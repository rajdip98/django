import calendar as pycalendar
from datetime import date, datetime, timedelta
from io import BytesIO

from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import IntegrityError
from django.db.models import Count, Q
from django.http import Http404, HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone

from .forms import (ContactForm, EventRegistrationForm, MembershipApplicationForm,
                    ProfileForm, SignUpForm)
from .models import (Achievement, Activity, Announcement, Article, Banner,
                     Category, CoreValue, Event, EventRegistration, GalleryItem,
                     MemberProfile, MembershipBenefit, Milestone, QRCode,
                     Resource, SiteSettings, Statistic, TeamMember, Testimonial)


def _paginate(request, queryset, per_page=9):
    paginator = Paginator(queryset, per_page)
    return paginator.get_page(request.GET.get('page'))


def _breadcrumbs(*items):
    """items: (label, url_name_or_None) pairs — Home is prepended automatically."""
    crumbs = [('Home', reverse('club:home'))]
    crumbs.extend(items)
    return crumbs


# ---------------------------------------------------------------- public pages

def home(request):
    now = timezone.now()
    upcoming = Event.objects.filter(tenant=request.tenant).filter(start__gte=now).order_by('start')[:3]
    context = {
        'upcoming_events': upcoming,
        'statistics': Statistic.objects.filter(tenant=request.tenant).all(),
        'activities': Activity.objects.filter(tenant=request.tenant).all()[:6],
        'articles': Article.objects.filter(tenant=request.tenant).filter(is_published=True)[:3],
        'gallery_items': GalleryItem.objects.filter(tenant=request.tenant).all()[:8],
        'testimonials': Testimonial.objects.filter(tenant=request.tenant).all()[:6],
        'leaders': TeamMember.objects.filter(tenant=request.tenant).select_related('category')[:4],
        'home_banners': Banner.live_for(tenant=request.tenant, placement='home_strip'),
        'hero_banners': Banner.live_for(tenant=request.tenant, placement='home_hero'),
        'sidebar_qr_codes': QRCode.live_for(tenant=request.tenant, placement='home_sidebar'),
        'page_title': 'Home',
        'meta_description': SiteSettings.load(request.tenant).introduction[:160],
    }
    return render(request, 'club/home.html', context)


def about(request):
    context = {
        'milestones': Milestone.objects.filter(tenant=request.tenant).all(),
        'core_values': CoreValue.objects.filter(tenant=request.tenant).all(),
        'achievements': Achievement.objects.filter(tenant=request.tenant).all(),
        'statistics': Statistic.objects.filter(tenant=request.tenant).all(),
        'president': TeamMember.objects.filter(tenant=request.tenant).filter(position__icontains='president')
                                       .exclude(position__icontains='vice').first(),
        'page_title': 'About Us',
        'breadcrumbs': _breadcrumbs(('About Us', None)),
        'meta_description': 'History, mission, vision, objectives and achievements of the organisation.',
    }
    return render(request, 'club/about.html', context)


def activities(request):
    groups = []
    for category in Category.objects.filter(tenant=request.tenant).filter(section='activity'):
        items = category.activities.all()
        if items:
            groups.append((category, items))
    uncategorised = Activity.objects.filter(tenant=request.tenant).filter(category__isnull=True)
    if uncategorised:
        groups.append((None, uncategorised))
    context = {
        'groups': groups,
        'page_title': 'Activities',
        'breadcrumbs': _breadcrumbs(('Activities', None)),
        'meta_description': 'Workshops, seminars, competitions, training, community service and cultural programmes.',
    }
    return render(request, 'club/activities.html', context)


def event_list(request):
    now = timezone.now()
    scope = request.GET.get('scope', 'upcoming')
    query = request.GET.get('q', '').strip()
    category_slug = request.GET.get('category', '')

    events = Event.objects.filter(tenant=request.tenant).select_related('category')
    if scope == 'past':
        events = events.filter(start__lt=now).order_by('-start')
    elif scope == 'all':
        events = events.order_by('-start')
    else:
        scope = 'upcoming'
        events = events.filter(start__gte=now).order_by('start')
    if query:
        events = events.filter(Q(title__icontains=query) | Q(description__icontains=query)
                               | Q(venue__icontains=query))
    if category_slug:
        events = events.filter(category__slug=category_slug)

    context = {
        'events': _paginate(request, events, 9),
        'categories': Category.objects.filter(tenant=request.tenant).filter(section='event'),
        'scope': scope,
        'query': query,
        'active_category': category_slug,
        'upcoming_count': Event.objects.filter(tenant=request.tenant).filter(start__gte=now).count(),
        'past_count': Event.objects.filter(tenant=request.tenant).filter(start__lt=now).count(),
        'page_title': 'Events',
        'breadcrumbs': _breadcrumbs(('Events', None)),
        'meta_description': 'Upcoming and past events, programmes and registration details.',
    }
    return render(request, 'club/event_list.html', context)


def event_detail(request, slug):
    event = get_object_or_404(Event.objects.filter(tenant=request.tenant).select_related('category'), slug=slug)
    related = Event.objects.filter(tenant=request.tenant).exclude(pk=event.pk)
    if event.category_id:
        related = related.filter(category_id=event.category_id)
    context = {
        'event': event,
        'related_events': related.order_by('-start')[:3],
        'registration_count': event.registrations.count(),
        'page_title': event.title,
        'breadcrumbs': _breadcrumbs(('Events', reverse('club:events')), (event.title, None)),
        'meta_description': event.summary or event.description[:160],
    }
    return render(request, 'club/event_detail.html', context)


def event_register(request, slug):
    event = get_object_or_404(Event, slug=slug)
    if not event.can_register:
        messages.error(request, 'Registration for this event is closed.')
        return redirect(event.get_absolute_url())

    initial = {}
    if request.user.is_authenticated:
        initial = {
            'full_name': request.user.get_full_name() or request.user.username,
            'email': request.user.email,
            'phone': getattr(getattr(request.user, 'member_profile', None), 'phone', ''),
        }
    if request.method == 'POST':
        form = EventRegistrationForm(request.POST, event=event)
        if form.is_valid():
            registration = form.save(commit=False)
            registration.event = event
            if request.user.is_authenticated:
                registration.user = request.user
            try:
                registration.save()
            except IntegrityError:
                # Two submissions racing each other past the form's own check.
                form.add_error('email', 'This e-mail address is already registered '
                                        'for this event.')
            else:
                messages.success(
                    request,
                    f'Registration confirmed for “{event.title}”. A confirmation has been '
                    f'recorded against {registration.email}.')
                return redirect(event.get_absolute_url())
        messages.error(request, 'Please correct the highlighted fields and submit again.')
    else:
        form = EventRegistrationForm(initial=initial, event=event)

    context = {
        'event': event,
        'form': form,
        'page_title': f'Register — {event.title}',
        'breadcrumbs': _breadcrumbs(('Events', reverse('club:events')),
                                    (event.title, event.get_absolute_url()),
                                    ('Registration', None)),
    }
    return render(request, 'club/event_register.html', context)


def event_calendar(request):
    today = date.today()
    try:
        year = int(request.GET.get('year', today.year))
        month = int(request.GET.get('month', today.month))
        anchor = date(year, month, 1)
    except (TypeError, ValueError):
        anchor = date(today.year, today.month, 1)
        year, month = anchor.year, anchor.month

    month_start = timezone.make_aware(datetime(anchor.year, anchor.month, 1))
    next_start = timezone.make_aware(datetime(
        anchor.year + (anchor.month // 12), anchor.month % 12 + 1, 1))
    events = (Event.objects.filter(tenant=request.tenant)
              .filter(start__gte=month_start, start__lt=next_start).order_by('start'))
    by_day = {}
    for event in events:
        by_day.setdefault(timezone.localtime(event.start).day, []).append(event)

    cal = pycalendar.Calendar(firstweekday=6)  # weeks start on Sunday
    weeks = []
    for week in cal.monthdatescalendar(year, month):
        row = []
        for day in week:
            row.append({
                'date': day,
                'in_month': day.month == month,
                'is_today': day == today,
                'events': by_day.get(day.day, []) if day.month == month else [],
            })
        weeks.append(row)

    prev_month = anchor - timedelta(days=1)
    next_month = (anchor + timedelta(days=32)).replace(day=1)
    context = {
        'weeks': weeks,
        'month_events': events,
        'anchor': anchor,
        'prev_month': prev_month,
        'next_month': next_month,
        'weekday_names': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        'page_title': 'Event Calendar',
        'breadcrumbs': _breadcrumbs(('Events', reverse('club:events')), ('Calendar', None)),
    }
    return render(request, 'club/calendar.html', context)


def gallery(request):
    category_slug = request.GET.get('category', '')
    media_type = request.GET.get('type', '')
    query = request.GET.get('q', '').strip()
    items = GalleryItem.objects.filter(tenant=request.tenant).select_related('category')
    if category_slug:
        items = items.filter(category__slug=category_slug)
    if media_type in {'photo', 'video'}:
        items = items.filter(media_type=media_type)
    if query:
        items = items.filter(Q(title__icontains=query) | Q(caption__icontains=query))
    context = {
        'query': query,
        'items': _paginate(request, items, 12),
        'categories': Category.objects.filter(tenant=request.tenant).filter(section='gallery'),
        'active_category': category_slug,
        'media_type': media_type,
        'photo_count': GalleryItem.objects.filter(tenant=request.tenant).filter(media_type='photo').count(),
        'video_count': GalleryItem.objects.filter(tenant=request.tenant).filter(media_type='video').count(),
        'page_title': 'Photo & Video Gallery',
        'breadcrumbs': _breadcrumbs(('Gallery', None)),
    }
    return render(request, 'club/gallery.html', context)


def team(request):
    groups = []
    categories = Category.objects.filter(tenant=request.tenant).filter(section='team').annotate(n=Count('members'))
    for category in categories:
        members = category.members.all()
        if members:
            groups.append((category, members))
    others = TeamMember.objects.filter(tenant=request.tenant).filter(category__isnull=True)
    if others:
        groups.append((None, others))
    context = {
        'groups': groups,
        'page_title': 'Our Team',
        'breadcrumbs': _breadcrumbs(('Our Team', None)),
        'meta_description': 'Executive committee, advisors, coordinators and volunteers.',
    }
    return render(request, 'club/team.html', context)


def news_list(request):
    query = request.GET.get('q', '').strip()
    category_slug = request.GET.get('category', '')
    articles = Article.objects.filter(tenant=request.tenant).filter(is_published=True).select_related('category')
    if query:
        articles = articles.filter(Q(title__icontains=query) | Q(body__icontains=query)
                                   | Q(excerpt__icontains=query))
    if category_slug:
        articles = articles.filter(category__slug=category_slug)
    featured = Article.objects.filter(tenant=request.tenant).filter(is_published=True, is_featured=True).first()
    context = {
        'articles': _paginate(request, articles, 8),
        'featured': featured,
        'categories': Category.objects.filter(tenant=request.tenant).filter(section='news'),
        'query': query,
        'active_category': category_slug,
        'page_title': 'News & Announcements',
        'breadcrumbs': _breadcrumbs(('News', None)),
    }
    return render(request, 'club/news_list.html', context)


def news_detail(request, slug):
    article = get_object_or_404(Article.objects.filter(tenant=request.tenant).select_related('category'),
                                slug=slug, is_published=True)
    related = Article.objects.filter(tenant=request.tenant).filter(is_published=True).exclude(pk=article.pk)
    if article.category_id:
        related = related.filter(category_id=article.category_id)
    context = {
        'article': article,
        'related_articles': related[:3],
        'page_title': article.title,
        'breadcrumbs': _breadcrumbs(('News', reverse('club:news')), (article.title, None)),
        'meta_description': article.excerpt[:160] or article.body[:160],
    }
    return render(request, 'club/news_detail.html', context)


def membership(request):
    if request.method == 'POST':
        form = MembershipApplicationForm(request.POST, request.FILES)
        if form.is_valid():
            application = form.save(commit=False)
            application.tenant = request.tenant
            if request.user.is_authenticated:
                application.user = request.user
            application.save()
            form.save_m2m()
            messages.success(request, 'Application submitted successfully.')
            return redirect(reverse('club:membership_success') + f'?ref={application.reference_no}')
        messages.error(request, 'Please correct the highlighted fields and submit again.')
    else:
        form = MembershipApplicationForm()
    context = {
        'form': form,
        'benefits': MembershipBenefit.objects.filter(tenant=request.tenant).all(),
        'qr_codes': QRCode.live_for(tenant=request.tenant, placement='membership'),
        'page_title': 'Membership',
        'breadcrumbs': _breadcrumbs(('Membership', None)),
        'meta_description': 'Membership benefits and the online application form.',
    }
    return render(request, 'club/membership.html', context)


def membership_success(request):
    context = {
        'reference_no': request.GET.get('ref', ''),
        'page_title': 'Application Received',
        'breadcrumbs': _breadcrumbs(('Membership', reverse('club:membership')),
                                    ('Acknowledgement', None)),
    }
    return render(request, 'club/membership_success.html', context)


def resources(request):
    category_slug = request.GET.get('category', '')
    query = request.GET.get('q', '').strip()
    items = Resource.objects.filter(tenant=request.tenant).filter(is_published=True).select_related('category')
    if category_slug:
        items = items.filter(category__slug=category_slug)
    if query:
        items = items.filter(Q(title__icontains=query) | Q(description__icontains=query))
    context = {
        'resources': _paginate(request, items, 12),
        'categories': Category.objects.filter(tenant=request.tenant).filter(section='resource'),
        'active_category': category_slug,
        'query': query,
        'page_title': 'Resources & Downloads',
        'breadcrumbs': _breadcrumbs(('Resources', None)),
    }
    return render(request, 'club/resources.html', context)


def resource_download(request, slug):
    resource = get_object_or_404(Resource, slug=slug, is_published=True)
    target = resource.download_url
    if not target:
        # The record is published but carries no file yet — send the visitor back
        # to the list rather than showing them a bare 404.
        messages.info(request, f'“{resource.title}” is not available for download. '
                               f'Please collect a copy from the office.')
        return redirect('club:resources')
    Resource.objects.filter(tenant=request.tenant).filter(pk=resource.pk).update(downloads=resource.downloads + 1)
    return HttpResponseRedirect(target)


def contact(request):
    if request.method == 'POST':
        form = ContactForm(request.POST)
        if form.is_valid():
            message = form.save(commit=False)
            message.tenant = request.tenant
            message.save()
            messages.success(request, 'Thank you — your message has been received. '
                                      'The office normally replies within two working days.')
            return redirect('club:contact')
        messages.error(request, 'Please correct the highlighted fields and submit again.')
    else:
        form = ContactForm()
    context = {
        'form': form,
        'qr_codes': QRCode.live_for(tenant=request.tenant, placement='contact'),
        'page_title': 'Contact Us',
        'breadcrumbs': _breadcrumbs(('Contact Us', None)),
    }
    return render(request, 'club/contact.html', context)


def search(request):
    query = request.GET.get('q', '').strip()
    section = request.GET.get('in', 'all')
    results = []

    if query:
        def add(objects, category, url_fn, date_fn=None, desc_fn=None):
            for obj in objects:
                results.append({
                    'title': str(obj),
                    'category': category,
                    'url': url_fn(obj),
                    'date': date_fn(obj) if date_fn else None,
                    'description': (desc_fn(obj) if desc_fn else '')[:180],
                })

        if section in ('all', 'events'):
            add(Event.objects.filter(tenant=request.tenant).filter(Q(title__icontains=query) | Q(description__icontains=query)
                                     | Q(venue__icontains=query))[:20],
                'Event', lambda o: o.get_absolute_url(), lambda o: o.start,
                lambda o: o.summary or o.description)
        if section in ('all', 'news'):
            add(Article.objects.filter(tenant=request.tenant).filter(Q(title__icontains=query) | Q(body__icontains=query),
                                       is_published=True)[:20],
                'News', lambda o: o.get_absolute_url(), lambda o: o.published_at,
                lambda o: o.excerpt or o.body)
        if section in ('all', 'team'):
            add(TeamMember.objects.filter(tenant=request.tenant).filter(Q(name__icontains=query) | Q(position__icontains=query)
                                          | Q(bio__icontains=query))[:20],
                'Team', lambda o: reverse('club:team') + f'#member-{o.slug}',
                None, lambda o: o.position)
        if section in ('all', 'resources'):
            add(Resource.objects.filter(tenant=request.tenant).filter(Q(title__icontains=query) | Q(description__icontains=query),
                                        is_published=True)[:20],
                'Resource', lambda o: reverse('club:resources') + f'?q={o.title}',
                lambda o: o.published_on, lambda o: o.description)
        if section in ('all', 'gallery'):
            add(GalleryItem.objects.filter(tenant=request.tenant).filter(Q(title__icontains=query) | Q(caption__icontains=query))[:20],
                'Gallery', lambda o: reverse('club:gallery') + '?q=' + query,
                lambda o: o.taken_on, lambda o: o.caption)
        if section in ('all', 'activities'):
            add(Activity.objects.filter(tenant=request.tenant).filter(Q(title__icontains=query) | Q(description__icontains=query))[:20],
                'Activity', lambda o: reverse('club:activities') + f'#activity-{o.slug}',
                None, lambda o: o.summary or o.description)
        if section in ('all', 'pages'):
            pages = [
                ('About Us', reverse('club:about'), 'History, mission, vision and achievements.'),
                ('Membership', reverse('club:membership'), 'Benefits and the online application form.'),
                ('Contact Us', reverse('club:contact'), 'Address, phone, e-mail and enquiry form.'),
                ('Event Calendar', reverse('club:calendar'), 'Month-wise calendar of programmes.'),
                ('Resources', reverse('club:resources'), 'Forms, reports and downloads.'),
            ]
            for title, url, desc in pages:
                if query.lower() in (title + desc).lower():
                    results.append({'title': title, 'category': 'Page', 'url': url,
                                    'date': None, 'description': desc})

    counts = {}
    for item in results:
        counts[item['category']] = counts.get(item['category'], 0) + 1

    context = {
        'query': query,
        'results': _paginate(request, results, 15),
        'result_count': len(results),
        'counts': sorted(counts.items()),
        'section': section,
        'page_title': f'Search results for “{query}”' if query else 'Search',
        'breadcrumbs': _breadcrumbs(('Search', None)),
    }
    return render(request, 'club/search.html', context)


def notifications(request):
    context = {
        'announcements': _paginate(request, Announcement.objects.filter(tenant=request.tenant).filter(is_active=True), 20),
        'page_title': 'Notifications',
        'breadcrumbs': _breadcrumbs(('Notifications', None)),
    }
    return render(request, 'club/notifications.html', context)


def static_page(request, kind):
    settings_obj = SiteSettings.load(request.tenant)
    body = settings_obj.privacy_policy if kind == 'privacy' else settings_obj.terms_of_use
    title = 'Privacy Policy' if kind == 'privacy' else 'Terms of Use'
    context = {
        'title': title,
        'body': body,
        'page_title': title,
        'breadcrumbs': _breadcrumbs((title, None)),
    }
    return render(request, 'club/static_page.html', context)


# ------------------------------------------------------------- member accounts

def sign_out(request):
    """Sign out of the member portal.

    Django's own LogoutView answers a GET with 405 Method Not Allowed, which is
    what a visitor sees if they type /logout/ or follow an old bookmark. A GET
    here shows a confirmation page instead; the actual sign-out is a POST.
    """
    if request.method == 'POST':
        logout(request)
        messages.success(request, 'You have been signed out.')
        return redirect('club:home')
    if not request.user.is_authenticated:
        return redirect('club:login')
    return render(request, 'club/logout.html', {
        'page_title': 'Sign out',
        'breadcrumbs': _breadcrumbs(('Sign out', None)),
    })


def signup(request):
    if request.user.is_authenticated:
        return redirect('club:dashboard')
    if request.method == 'POST':
        form = SignUpForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, 'Account created. Welcome to the member portal.')
            return redirect('club:dashboard')
        messages.error(request, 'Please correct the highlighted fields and submit again.')
    else:
        form = SignUpForm()
    context = {
        'form': form,
        'page_title': 'Create Account',
        'breadcrumbs': _breadcrumbs(('Create Account', None)),
    }
    return render(request, 'club/signup.html', context)


def _profile_for(user):
    profile, _ = MemberProfile.objects.get_or_create(user=user)
    return profile


@login_required
def dashboard(request):
    profile = _profile_for(request.user)
    now = timezone.now()
    registrations = (EventRegistration.objects
                     .filter(Q(user=request.user) | Q(email__iexact=request.user.email))
                     .select_related('event'))
    context = {
        'profile': profile,
        'registrations': registrations[:10],
        'upcoming_registered': [r for r in registrations if r.event.start >= now][:5],
        'upcoming_events': Event.objects.filter(tenant=request.tenant).filter(start__gte=now).order_by('start')[:4],
        'certificates': profile.certificates.all()[:5],
        'announcements': Announcement.objects.filter(tenant=request.tenant).filter(is_active=True)[:5],
        'resources': Resource.objects.filter(tenant=request.tenant).filter(is_published=True)[:5],
        'page_title': 'Member Dashboard',
        'breadcrumbs': _breadcrumbs(('Dashboard', None)),
    }
    return render(request, 'club/dashboard.html', context)


@login_required
def profile(request):
    profile_obj = _profile_for(request.user)
    if request.method == 'POST':
        form = ProfileForm(request.POST, request.FILES, instance=profile_obj)
        if form.is_valid():
            form.save()
            messages.success(request, 'Your profile has been updated.')
            return redirect('club:profile')
        messages.error(request, 'Please correct the highlighted fields and submit again.')
    else:
        form = ProfileForm(instance=profile_obj)
    context = {
        'form': form,
        'profile': profile_obj,
        'page_title': 'My Profile',
        'breadcrumbs': _breadcrumbs(('Dashboard', reverse('club:dashboard')),
                                    ('My Profile', None)),
    }
    return render(request, 'club/profile.html', context)


@login_required
def my_events(request):
    registrations = (EventRegistration.objects
                     .filter(Q(user=request.user) | Q(email__iexact=request.user.email))
                     .select_related('event'))
    now = timezone.now()
    context = {
        'upcoming': [r for r in registrations if r.event.start >= now],
        'past': [r for r in registrations if r.event.start < now],
        'page_title': 'My Events',
        'breadcrumbs': _breadcrumbs(('Dashboard', reverse('club:dashboard')),
                                    ('My Events', None)),
    }
    return render(request, 'club/my_events.html', context)


@login_required
def my_certificates(request):
    profile_obj = _profile_for(request.user)
    context = {
        'certificates': profile_obj.certificates.all(),
        'profile': profile_obj,
        'page_title': 'My Certificates',
        'breadcrumbs': _breadcrumbs(('Dashboard', reverse('club:dashboard')),
                                    ('Certificates', None)),
    }
    return render(request, 'club/my_certificates.html', context)


def health(request):
    """Cheap liveness probe for a load balancer or platform health check.

    Touches the database so a broken connection reports as unhealthy rather than
    quietly serving errors.
    """
    try:
        SiteSettings.objects.exists()
    except Exception:  # pragma: no cover - only on a broken database
        return HttpResponse('database unavailable', status=503, content_type='text/plain')
    return HttpResponse('ok', content_type='text/plain')


def favicon(request):
    """Browsers ask for /favicon.ico on every page; answer with the site's mark.

    The uploaded logo is used when there is one, otherwise a small SVG built
    from the organisation's initial.
    """
    settings_obj = SiteSettings.load(request.tenant)
    if settings_obj.logo:
        return HttpResponseRedirect(settings_obj.logo.url)
    if settings_obj.emblem:
        return HttpResponseRedirect(settings_obj.emblem.url)
    initial = (settings_obj.short_name or settings_obj.organization_name or '?')[:1]
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        '<rect width="32" height="32" rx="6" fill="%s"/>'
        '<text x="16" y="22" font-size="16" font-family="Georgia,serif" '
        'fill="#c8901d" text-anchor="middle">%s</text></svg>'
        % (settings_obj.primary_color or '#123a6d', initial)
    )
    response = HttpResponse(svg, content_type='image/svg+xml')
    response['Cache-Control'] = 'public, max-age=86400'
    return response


def qr_svg(request, slug):
    """Render a QR code as SVG, generated live from its stored payload.

    Because the code is drawn on request, repointing it in the admin panel
    changes every printed and published copy immediately.
    """
    code = get_object_or_404(QRCode, slug=slug, is_active=True)
    if code.image:
        return HttpResponseRedirect(code.image.url)

    import qrcode
    import qrcode.image.svg
    from qrcode.constants import (ERROR_CORRECT_H, ERROR_CORRECT_L,
                                  ERROR_CORRECT_M, ERROR_CORRECT_Q)

    levels = {'L': ERROR_CORRECT_L, 'M': ERROR_CORRECT_M,
              'Q': ERROR_CORRECT_Q, 'H': ERROR_CORRECT_H}
    maker = qrcode.QRCode(
        version=None,
        error_correction=levels.get(code.error_correction, ERROR_CORRECT_M),
        box_size=10, border=2,
        image_factory=qrcode.image.svg.SvgPathImage)
    maker.add_data(code.payload)
    maker.make(fit=True)

    buffer = BytesIO()
    maker.make_image().save(buffer)
    response = HttpResponse(buffer.getvalue(), content_type='image/svg+xml')
    # Repointing the code bumps updated_at, so caches pick the change up.
    response['ETag'] = f'"{code.pk}-{int(code.updated_at.timestamp())}"'
    response['Cache-Control'] = 'public, max-age=300'
    return response
