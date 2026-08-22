from django.utils import timezone

from .models import Announcement, Banner, Category, QRCode, SiteSettings

NAV_ITEMS = [
    ('Home', 'club:home', []),
    ('About Us', 'club:about', []),
    ('Events', 'club:events', [('All Events', 'club:events'),
                               ('Event Calendar', 'club:calendar')]),
    ('Activities', 'club:activities', []),
    ('Gallery', 'club:gallery', []),
    ('Our Team', 'club:team', []),
    ('News', 'club:news', [('News & Notices', 'club:news'),
                           ('Notifications', 'club:notifications')]),
    ('Membership', 'club:membership', [('Membership & Benefits', 'club:membership'),
                                       ('Create Account', 'club:signup')]),
    ('Resources', 'club:resources', []),
    ('Contact Us', 'club:contact', []),
]


def site(request):
    """Injects site identity, navigation and live notices into every template."""
    settings_obj = SiteSettings.load()
    announcements = list(Announcement.objects.filter(is_active=True)[:8])
    return {
        'org': settings_obj,
        'nav_items': NAV_ITEMS,
        'ticker_items': announcements[:6],
        'notifications_list': announcements[:6],
        'notification_count': len([a for a in announcements if a.is_new]),
        'footer_categories': Category.objects.filter(section='resource')[:5],
        'top_banners': Banner.live_for('sitewide_top'),
        'footer_qr_codes': QRCode.live_for('footer'),
        'current_year': timezone.now().year,
        'last_updated': timezone.now(),
    }
