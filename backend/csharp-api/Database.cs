using MySqlConnector;

namespace ClubApi;

/// <summary>
/// Reads the website's content straight from the database Django writes to.
///
/// Only SELECTs, plus one INSERT for an enquiry. Every statement is parameterised,
/// so nothing a visitor types can alter a query. The schema belongs to Django's
/// migrations; this service never changes it.
/// </summary>
public sealed class Database(string connectionString, ILogger<Database> logger)
{
    private readonly string _connectionString = connectionString;
    private readonly ILogger<Database> _logger = logger;

    private async Task<MySqlConnection> OpenAsync(CancellationToken token)
    {
        var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(token);
        return connection;
    }

    /// <summary>Which website (tenant) this request is for, matched on the host name.</summary>
    public async Task<long?> ResolveTenantAsync(string? host, CancellationToken token)
    {
        var name = (host ?? string.Empty).Split(':')[0].ToLowerInvariant();
        await using var connection = await OpenAsync(token);

        if (name.Length > 0)
        {
            await using var byDomain = new MySqlCommand(
                "SELECT id FROM saas_tenant WHERE LOWER(domain) = @domain AND is_active = 1 LIMIT 1",
                connection);
            byDomain.Parameters.AddWithValue("@domain", name);
            var matched = await byDomain.ExecuteScalarAsync(token);
            if (matched is not null and not DBNull) return Convert.ToInt64(matched);
        }

        await using var fallback = new MySqlCommand(
            "SELECT id FROM saas_tenant WHERE is_active = 1 ORDER BY is_default DESC, id LIMIT 1",
            connection);
        var fallbackId = await fallback.ExecuteScalarAsync(token);
        return fallbackId is null or DBNull ? null : Convert.ToInt64(fallbackId);
    }

    public async Task<SiteInfo?> GetSiteAsync(long tenantId, CancellationToken token)
    {
        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            """
            SELECT organization_name, slogan, parent_authority, registration_line,
                   introduction, address, phone, email, office_hours, established
            FROM club_sitesettings WHERE tenant_id = @tenant LIMIT 1
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return null;
        return new SiteInfo(
            reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
            reader.GetString(8), reader.GetInt32(9));
    }

    public async Task<List<EventItem>> GetEventsAsync(
        long tenantId, string scope, int limit, CancellationToken token)
    {
        var filter = scope switch
        {
            "past" => "AND e.start < UTC_TIMESTAMP()",
            "all" => string.Empty,
            _ => "AND e.start >= UTC_TIMESTAMP()",
        };
        scope = scope is "past" or "all" ? scope : "upcoming";
        // Upcoming reads soonest-first; anything historical reads newest-first, so a
        // visitor never opens the page on an event from years ago.
        var order = scope == "upcoming" ? "ASC" : "DESC";

        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            $"""
            SELECT e.id, e.title, e.slug, c.name, e.summary, e.venue, e.start, e.end,
                   e.registration_open, e.image
            FROM club_event e
            LEFT JOIN club_category c ON c.id = e.category_id
            WHERE e.tenant_id = @tenant {filter}
            ORDER BY e.start {order}
            LIMIT @limit
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);
        command.Parameters.AddWithValue("@limit", limit);

        var events = new List<EventItem>();
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            var start = reader.GetDateTime(6);
            events.Add(new EventItem(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
                reader.GetString(5), start,
                reader.IsDBNull(7) ? null : reader.GetDateTime(7),
                reader.GetBoolean(8), start >= DateTime.UtcNow,
                MediaUrl(reader.IsDBNull(9) ? null : reader.GetString(9))));
        }
        return events;
    }

    public async Task<List<NoticeItem>> GetNoticesAsync(long tenantId, int limit, CancellationToken token)
    {
        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            """
            SELECT id, title, kind, body, published_at, is_new
            FROM club_announcement
            WHERE tenant_id = @tenant AND is_active = 1
            ORDER BY published_at DESC LIMIT @limit
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);
        command.Parameters.AddWithValue("@limit", limit);

        var notices = new List<NoticeItem>();
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            notices.Add(new NoticeItem(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.GetDateTime(4), reader.GetBoolean(5)));
        }
        return notices;
    }

    public async Task<List<ArticleItem>> GetArticlesAsync(long tenantId, int limit, CancellationToken token)
    {
        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            """
            SELECT a.id, a.title, a.slug, c.name, a.excerpt, a.published_at
            FROM club_article a
            LEFT JOIN club_category c ON c.id = a.category_id
            WHERE a.tenant_id = @tenant AND a.is_published = 1
            ORDER BY a.published_at DESC LIMIT @limit
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);
        command.Parameters.AddWithValue("@limit", limit);

        var articles = new List<ArticleItem>();
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            articles.Add(new ArticleItem(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
                reader.GetDateTime(5)));
        }
        return articles;
    }

    public async Task<List<ActivityItem>> GetActivitiesAsync(long tenantId, CancellationToken token)
    {
        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            """
            SELECT a.id, a.title, c.name, a.icon, a.frequency, a.summary
            FROM club_activity a
            LEFT JOIN club_category c ON c.id = a.category_id
            WHERE a.tenant_id = @tenant
            ORDER BY a.`order`, a.title
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);

        var activities = new List<ActivityItem>();
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            activities.Add(new ActivityItem(
                reader.GetInt64(0), reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetString(5)));
        }
        return activities;
    }

    public async Task<List<GalleryItem>> GetGalleryAsync(long tenantId, int limit, CancellationToken token)
    {
        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            """
            SELECT g.id, g.title, c.name, g.media_type, g.caption, g.taken_on,
                   g.image, g.video_url
            FROM club_galleryitem g
            LEFT JOIN club_category c ON c.id = g.category_id
            WHERE g.tenant_id = @tenant
            ORDER BY g.taken_on DESC, g.id DESC LIMIT @limit
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);
        command.Parameters.AddWithValue("@limit", limit);

        var items = new List<GalleryItem>();
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            items.Add(new GalleryItem(
                reader.GetInt64(0), reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2), reader.GetString(3),
                reader.GetString(4), DateOnly.FromDateTime(reader.GetDateTime(5)),
                MediaUrl(reader.IsDBNull(6) ? null : reader.GetString(6)),
                reader.IsDBNull(7) ? null : reader.GetString(7)));
        }
        return items;
    }

    /// <summary>Office bearers and members of the executive committee.</summary>
    public async Task<List<TeamMemberItem>> GetTeamAsync(long tenantId, CancellationToken token)
    {
        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            """
            SELECT m.id, m.name, m.slug, m.position, c.name,
                   m.bio, m.photo, m.tenure
            FROM club_teammember m
            LEFT JOIN club_category c ON c.id = m.category_id
            WHERE m.tenant_id = @tenant
            ORDER BY c.`order` IS NULL, c.`order`, m.`order`, m.name
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);

        var members = new List<TeamMemberItem>();
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            members.Add(new TeamMemberItem(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.GetString(5), MediaUrl(reader.IsDBNull(6) ? null : reader.GetString(6)),
                reader.GetString(7)));
        }
        return members;
    }

    /// <summary>Counter tiles shown on the home page.</summary>
    public async Task<List<StatisticItem>> GetStatisticsAsync(long tenantId, CancellationToken token)
    {
        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            """
            SELECT id, label, value, suffix
            FROM club_statistic
            WHERE tenant_id = @tenant
            ORDER BY `order`, id
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);

        var stats = new List<StatisticItem>();
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            stats.Add(new StatisticItem(
                reader.GetInt64(0), reader.GetString(1),
                reader.GetInt64(2), reader.GetString(3)));
        }
        return stats;
    }

    /// <summary>
    /// Turn a stored upload path into a URL the browser can fetch. Django writes
    /// a path relative to MEDIA_ROOT; the gateway serves that under /media/.
    /// </summary>
    private static string? MediaUrl(string? storedPath)
    {
        if (string.IsNullOrWhiteSpace(storedPath)) return null;
        return "/media/" + storedPath.TrimStart('/');
    }

    /// <summary>Store an enquiry from the website's contact form.</summary>
    public async Task<long> AddEnquiryAsync(long tenantId, EnquiryRequest enquiry, CancellationToken token)
    {
        await using var connection = await OpenAsync(token);
        await using var command = new MySqlCommand(
            """
            INSERT INTO club_contactmessage
                (tenant_id, name, email, phone, subject, message, is_handled,
                 created_at, updated_at)
            VALUES (@tenant, @name, @email, @phone, @subject, @message, 0,
                    UTC_TIMESTAMP(), UTC_TIMESTAMP())
            """, connection);
        command.Parameters.AddWithValue("@tenant", tenantId);
        command.Parameters.AddWithValue("@name", enquiry.Name);
        command.Parameters.AddWithValue("@email", enquiry.Email);
        command.Parameters.AddWithValue("@phone", enquiry.Phone ?? string.Empty);
        command.Parameters.AddWithValue("@subject", enquiry.Subject);
        command.Parameters.AddWithValue("@message", enquiry.Message);
        await command.ExecuteNonQueryAsync(token);
        _logger.LogInformation("Enquiry stored for tenant {Tenant}", tenantId);
        return command.LastInsertedId;
    }

    public async Task<bool> CanReachDatabaseAsync(CancellationToken token)
    {
        try
        {
            await using var connection = await OpenAsync(token);
            await using var command = new MySqlCommand("SELECT 1", connection);
            await command.ExecuteScalarAsync(token);
            return true;
        }
        catch (MySqlException exception)
        {
            _logger.LogError(exception, "The database is unreachable");
            return false;
        }
    }
}
