// Public read API for the club website.
//
// The division of labour:
//   Python / Django  owns the database schema, both admin panels, membership and
//                    every write a staff member makes.
//   C# / ASP.NET     serves the public content to the browser as JSON, fast and
//                    cacheable, and accepts contact enquiries.
//   HTML / CSS / JS  the frontend, which calls this API.
//
// Configuration (environment variables):
//   CLUB_DB_CONNECTION   MySQL connection string; or
//   DATABASE_URL         the same mysql:// URL Django uses — it is converted here
//   CLUB_ALLOWED_ORIGINS comma-separated origins allowed to call this API
//   ASPNETCORE_URLS      where to listen, e.g. http://0.0.0.0:5080

using System.Text.Json;
using System.Text.Json.Serialization;
using ClubApi;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------- configuration

static string BuildConnectionString(IConfiguration config)
{
    var direct = Environment.GetEnvironmentVariable("CLUB_DB_CONNECTION");
    if (!string.IsNullOrWhiteSpace(direct)) return direct;

    // Accept the same DATABASE_URL Django reads, so both services are configured once.
    var url = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (!string.IsNullOrWhiteSpace(url))
    {
        var parsed = new Uri(url);
        var credentials = parsed.UserInfo.Split(':', 2);
        var user = Uri.UnescapeDataString(credentials[0]);
        var password = credentials.Length > 1 ? Uri.UnescapeDataString(credentials[1]) : string.Empty;
        var database = parsed.AbsolutePath.Trim('/');
        var port = parsed.Port > 0 ? parsed.Port : 3306;
        return $"Server={parsed.Host};Port={port};Database={database};User ID={user};" +
               $"Password={password};CharacterSet=utf8mb4;SslMode=Preferred;";
    }
    return config.GetConnectionString("Club")
        ?? throw new InvalidOperationException(
            "No database configured. Set CLUB_DB_CONNECTION or DATABASE_URL.");
}

var connectionString = BuildConnectionString(builder.Configuration);

var allowedOrigins = (Environment.GetEnvironmentVariable("CLUB_ALLOWED_ORIGINS")
                      ?? "http://localhost:8000,http://127.0.0.1:8000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddSingleton(provider =>
    new Database(connectionString, provider.GetRequiredService<ILogger<Database>>()));

builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .WithMethods("GET", "POST", "OPTIONS")));

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.AddOutputCache(options =>
    options.AddBasePolicy(policy => policy.Expire(TimeSpan.FromSeconds(60))));

var app = builder.Build();
app.UseCors();
app.UseOutputCache();

// --------------------------------------------------------------------- helpers

static int ClampLimit(int? requested, int fallback, int ceiling = 100)
    => Math.Clamp(requested ?? fallback, 1, ceiling);

static async Task<IResult> WithTenantAsync(
    HttpContext http, Database db, Func<long, Task<IResult>> handler)
{
    var tenant = await db.ResolveTenantAsync(http.Request.Host.Host, http.RequestAborted);
    if (tenant is null)
    {
        return Results.NotFound(new ApiError(
            "no_website",
            "No active website matches this host, and no default is configured."));
    }
    return await handler(tenant.Value);
}

// ---------------------------------------------------------------------- routes

app.MapGet("/api/health", async (Database db, CancellationToken token) =>
{
    var reachable = await db.CanReachDatabaseAsync(token);
    return reachable
        ? Results.Ok(new { status = "ok", database = "reachable" })
        : Results.Json(new ApiError("database_unavailable", "The database did not respond."),
                       statusCode: StatusCodes.Status503ServiceUnavailable);
}).ExcludeFromDescription();

app.MapGet("/api/site", (HttpContext http, Database db) => WithTenantAsync(http, db, async tenant =>
{
    var site = await db.GetSiteAsync(tenant, http.RequestAborted);
    return site is null
        ? Results.NotFound(new ApiError("no_settings", "This website has no settings yet."))
        : Results.Ok(site);
})).CacheOutput();

app.MapGet("/api/events", (HttpContext http, Database db, string? scope, int? limit) =>
    WithTenantAsync(http, db, async tenant =>
    {
        var events = await db.GetEventsAsync(tenant, scope ?? "upcoming",
                                             ClampLimit(limit, 20), http.RequestAborted);
        return Results.Ok(events);
    })).CacheOutput();

app.MapGet("/api/notices", (HttpContext http, Database db, int? limit) =>
    WithTenantAsync(http, db, async tenant =>
        Results.Ok(await db.GetNoticesAsync(tenant, ClampLimit(limit, 10), http.RequestAborted))))
    .CacheOutput();

app.MapGet("/api/articles", (HttpContext http, Database db, int? limit) =>
    WithTenantAsync(http, db, async tenant =>
        Results.Ok(await db.GetArticlesAsync(tenant, ClampLimit(limit, 10), http.RequestAborted))))
    .CacheOutput();

app.MapGet("/api/activities", (HttpContext http, Database db) =>
    WithTenantAsync(http, db, async tenant =>
        Results.Ok(await db.GetActivitiesAsync(tenant, http.RequestAborted))))
    .CacheOutput();

app.MapGet("/api/gallery", (HttpContext http, Database db, int? limit) =>
    WithTenantAsync(http, db, async tenant =>
        Results.Ok(await db.GetGalleryAsync(tenant, ClampLimit(limit, 24), http.RequestAborted))))
    .CacheOutput();

app.MapGet("/api/team", (HttpContext http, Database db) =>
    WithTenantAsync(http, db, async tenant =>
        Results.Ok(await db.GetTeamAsync(tenant, http.RequestAborted))))
    .CacheOutput();

app.MapGet("/api/statistics", (HttpContext http, Database db) =>
    WithTenantAsync(http, db, async tenant =>
        Results.Ok(await db.GetStatisticsAsync(tenant, http.RequestAborted))))
    .CacheOutput();

app.MapPost("/api/enquiries", (HttpContext http, Database db, EnquiryRequest enquiry) =>
    WithTenantAsync(http, db, async tenant =>
    {
        // Validate before touching the database; say what is wrong, not just "invalid".
        var problems = new List<string>();
        if (string.IsNullOrWhiteSpace(enquiry.Name)) problems.Add("a name is required");
        if (string.IsNullOrWhiteSpace(enquiry.Email) || !enquiry.Email.Contains('@'))
            problems.Add("a valid e-mail address is required");
        if (string.IsNullOrWhiteSpace(enquiry.Subject)) problems.Add("a subject is required");
        if (string.IsNullOrWhiteSpace(enquiry.Message)) problems.Add("a message is required");
        if (enquiry.Name?.Length > 160) problems.Add("the name is too long");
        if (enquiry.Message?.Length > 5000) problems.Add("the message is too long");
        if (problems.Count > 0)
        {
            return Results.BadRequest(new ApiError("invalid_enquiry", string.Join("; ", problems)));
        }

        var id = await db.AddEnquiryAsync(tenant, enquiry, http.RequestAborted);
        return Results.Created($"/api/enquiries/{id}", new
        {
            id,
            message = "Thank you — your enquiry has reached the office."
        });
    }));

app.Run();
