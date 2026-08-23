namespace ClubApi;

// The shapes the browser receives. Django owns the database schema; these are a
// deliberate, narrow public view of it — no internal columns, no member data.

public record SiteInfo(
    string Name,
    string Slogan,
    string Authority,
    string Registration,
    string Introduction,
    string Address,
    string Phone,
    string Email,
    string OfficeHours,
    int Established);

public record EventItem(
    long Id,
    string Title,
    string Slug,
    string? Category,
    string Summary,
    string Venue,
    DateTime Start,
    DateTime? End,
    bool RegistrationOpen,
    bool IsUpcoming,
    string? Image);

public record NoticeItem(
    long Id,
    string Title,
    string Kind,
    string Body,
    DateTime PublishedAt,
    bool IsNew);

public record ArticleItem(
    long Id,
    string Title,
    string Slug,
    string? Category,
    string Excerpt,
    DateTime PublishedAt);

public record ActivityItem(
    long Id,
    string Title,
    string? Category,
    string Icon,
    string Frequency,
    string Summary);

public record GalleryItem(
    long Id,
    string Title,
    string? Category,
    string MediaType,
    string Caption,
    DateOnly TakenOn,
    string? Image,
    string? VideoUrl);

public record TeamMemberItem(
    long Id,
    string Name,
    string Slug,
    string Position,
    string? Category,
    string Bio,
    string? Photo,
    string Tenure);

public record StatisticItem(
    long Id,
    string Label,
    long Value,
    string Suffix);

public record EnquiryRequest(
    string Name,
    string Email,
    string? Phone,
    string Subject,
    string Message);

public record ApiError(string Error, string Detail);
