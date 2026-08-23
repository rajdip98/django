from django.conf import settings as django_settings
from django.contrib import messages
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth import update_session_auth_hash
from django.core.paginator import Paginator
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from club.models import (Article, Banner, ContactMessage, Event,
                         MembershipApplication, QRCode, Resource, SiteSettings)

from . import content
from .access import (elevation_expires_at, get_profile, grant_elevation,
                     has_super_powers, is_elevated, panel_required, record,
                     revoke_elevation, super_admin_required)
from .forms import (AdminAccountForm, BannerForm, ElevationForm, FileForm,
                    FooterForm, ForcedPasswordChangeForm, HeaderForm,
                    IdentityForm, PanelLoginForm, QRCodeForm, RotateSecretForm)
from .models import AuditLog, PanelSecret, StaffProfile


def panel_tenant(request):
    """The website this panel session administers.

    A site admin is pinned to their own tenant, whatever host they arrived on;
    only an account without one falls back to the requested website.
    """
    profile = getattr(request, 'staff_profile', None) or get_profile(request)
    if profile is not None and profile.tenant_id:
        return profile.tenant
    return getattr(request, 'tenant', None)


def _context(request, **extra):
    """Shared panel context: role badge, elevation state, navigation."""
    profile = getattr(request, 'staff_profile', None) or get_profile(request)
    context = {
        'tenant': panel_tenant(request),
        'content_types': sorted(content.REGISTRY.items(), key=lambda pair: pair[1]['plural']),
        'profile': profile,
        'is_super': bool(profile and profile.is_super_admin),
        'elevated': is_elevated(request),
        'elevation_expires': elevation_expires_at(request),
        'can_super': has_super_powers(request),
        'org': SiteSettings.load(panel_tenant(request)),
    }
    context.update(extra)
    return context


# --------------------------------------------------------------- session flow

def panel_login(request):
    if request.user.is_authenticated and get_profile(request):
        return redirect('staff:dashboard')
    form = PanelLoginForm(request, data=request.POST or None)
    if request.method == 'POST':
        if form.is_valid():
            user = form.get_user()
            profile = StaffProfile.objects.filter(user=user).first()
            if profile is None or not profile.is_enabled:
                record(request, AuditLog.LOGIN_FAILED, target=user.get_username(),
                       detail='No enabled staff account for this login.', actor=user)
                messages.error(request, 'This account may not use the administration panel.')
            else:
                auth_login(request, user)
                profile.last_login_ip = request.META.get('REMOTE_ADDR')
                profile.save(update_fields=['last_login_ip'])
                record(request, AuditLog.LOGIN, target=user.get_username())
                if profile.must_change_password:
                    messages.warning(
                        request, 'You are signed in with the shared default password. '
                                 'Choose a new password before continuing.')
                    return redirect('staff:change_password')
                return redirect('staff:dashboard')
        else:
            record(request, AuditLog.LOGIN_FAILED,
                   target=request.POST.get('username', '')[:150],
                   detail='Wrong username or password.')
    return render(request, 'staff/login.html', {'form': form, 'org': SiteSettings.load()})


def panel_logout(request):
    """Sign out of the panel. A GET asks for confirmation rather than 405-ing."""
    if request.method != 'POST':
        if not request.user.is_authenticated:
            return redirect('staff:login')
        return render(request, 'staff/logout.html', _context(request, section='Sign out'))
    if request.user.is_authenticated:
        record(request, AuditLog.LOGOUT, target=request.user.get_username())
    revoke_elevation(request)
    auth_logout(request)
    messages.success(request, 'You have been signed out of the administration panel.')
    return redirect('staff:login')


@panel_required
def change_password(request):
    profile = request.staff_profile
    form = ForcedPasswordChangeForm(request.user, request.POST or None)
    if request.method == 'POST' and form.is_valid():
        form.save()
        profile.register_password_change()
        update_session_auth_hash(request, request.user)
        record(request, AuditLog.PASSWORD_CHANGED, target=request.user.get_username())
        messages.success(request, 'Your password has been updated.')
        return redirect('staff:dashboard')
    return render(request, 'staff/change_password.html', _context(
        request, form=form, forced=profile.must_change_password, profile=profile))


@panel_required
def elevate(request):
    """Admins exchange the elevation secret for a timed Super Admin window."""
    profile = request.staff_profile
    if profile.is_super_admin:
        messages.info(request, 'You already hold Super Admin access.')
        return redirect('staff:dashboard')

    secret = PanelSecret.load()
    form = ElevationForm(request.POST or None)
    if request.method == 'POST':
        if profile.elevation_locked:
            record(request, AuditLog.ELEVATION_DENIED, target=request.user.get_username(),
                   detail='Attempted while locked out.')
            messages.error(request, 'Too many failed attempts. Try again later.')
        elif not secret.is_enabled:
            record(request, AuditLog.ELEVATION_DENIED, target=request.user.get_username(),
                   detail='Elevation is switched off.')
            messages.error(request, 'Elevation has been switched off by a Super Admin.')
        elif form.is_valid() and secret.verify(form.cleaned_data['secret']):
            expires = grant_elevation(request)
            profile.clear_elevation_failures()
            record(request, AuditLog.ELEVATION_GRANTED, target=request.user.get_username(),
                   detail=f'Window open until {expires:%Y-%m-%d %H:%M} UTC.')
            messages.success(
                request, 'Super Admin access granted for 30 minutes. It ends automatically, '
                         'and everything you do is recorded.')
            return redirect('staff:dashboard')
        else:
            profile.register_elevation_failure()
            record(request, AuditLog.ELEVATION_DENIED, target=request.user.get_username(),
                   detail='Wrong secret.')
            messages.error(request, 'That secret was not accepted.')
    return render(request, 'staff/elevate.html', _context(
        request, form=form, secret_enabled=secret.is_enabled, locked=profile.elevation_locked))


@panel_required
def end_elevation(request):
    if is_elevated(request):
        record(request, AuditLog.ELEVATION_REVOKED, target=request.user.get_username())
        revoke_elevation(request)
        messages.success(request, 'Super Admin access ended.')
    return redirect('staff:dashboard')


# ------------------------------------------------------------------ dashboard

@panel_required
def dashboard(request):
    tenant = panel_tenant(request)
    stats = [
        ('Events', Event.objects.filter(tenant=tenant).count(), reverse('club:events')),
        ('News articles', Article.objects.filter(tenant=tenant).count(), reverse('club:news')),
        ('Banners', Banner.objects.filter(tenant=tenant).count(), reverse('staff:banners')),
        ('QR codes', QRCode.objects.filter(tenant=tenant).count(), reverse('staff:qr_codes')),
        ('Files & downloads', Resource.objects.filter(tenant=tenant).count(), reverse('staff:files')),
        ('Membership applications', MembershipApplication.objects.filter(status='pending', tenant=tenant).count(),
         reverse('staff:dashboard')),
        ('Unread enquiries', ContactMessage.objects.filter(is_handled=False, tenant=tenant).count(),
         reverse('staff:dashboard')),
    ]
    recent = AuditLog.objects.all()[:8] if has_super_powers(request) else \
        AuditLog.objects.filter(actor=request.user)[:8]
    return render(request, 'staff/dashboard.html', _context(
        request, stats=stats, recent=recent,
        admin_count=StaffProfile.objects.filter(role=StaffProfile.ROLE_ADMIN,
                                                tenant=tenant).count(),
        super_count=StaffProfile.objects.filter(role=StaffProfile.ROLE_SUPER_ADMIN,
                                                tenant=tenant).count()))


# ------------------------------------------------------------- site content

def _settings_page(request, form_class, template, section_label):
    settings_obj = SiteSettings.load(panel_tenant(request))
    form = form_class(request.POST or None, request.FILES or None, instance=settings_obj)
    if request.method == 'POST' and form.is_valid():
        form.save()
        record(request, AuditLog.CONTENT_UPDATED, target=section_label)
        messages.success(request, f'{section_label} saved.')
        return redirect(request.path)
    return render(request, template, _context(request, form=form, section=section_label))


@panel_required
def site_identity(request):
    return _settings_page(request, IdentityForm, 'staff/form_page.html',
                          'Website name & logo')


@panel_required
def site_header(request):
    return _settings_page(request, HeaderForm, 'staff/form_page.html', 'Header')


@panel_required
def site_footer(request):
    return _settings_page(request, FooterForm, 'staff/form_page.html', 'Footer')


@panel_required
def banners(request):
    return render(request, 'staff/banners.html', _context(
        request, banners=Banner.objects.filter(tenant=panel_tenant(request))))


@panel_required
def banner_edit(request, pk=None):
    banner = get_object_or_404(Banner, pk=pk, tenant=panel_tenant(request)) if pk else None
    form = BannerForm(request.POST or None, request.FILES or None, instance=banner)
    if request.method == 'POST' and form.is_valid():
        saved = form.save(commit=False)
        saved.updated_by = request.user
        saved.tenant = panel_tenant(request)
        saved.save()
        record(request, AuditLog.CONTENT_UPDATED if pk else AuditLog.CONTENT_CREATED,
               target=f'Banner: {saved.title}')
        messages.success(request, 'Banner saved.')
        return redirect('staff:banners')
    return render(request, 'staff/form_page.html', _context(
        request, form=form, section='Banner', back_url=reverse('staff:banners'),
        object=banner))


@panel_required
def banner_delete(request, pk):
    banner = get_object_or_404(Banner, pk=pk, tenant=panel_tenant(request))
    if request.method == 'POST':
        record(request, AuditLog.CONTENT_DELETED, target=f'Banner: {banner.title}')
        banner.delete()
        messages.success(request, 'Banner deleted.')
        return redirect('staff:banners')
    return render(request, 'staff/confirm_delete.html', _context(
        request, object=banner, kind='banner', back_url=reverse('staff:banners')))


@panel_required
def files(request):
    return render(request, 'staff/files.html', _context(
        request, files=Resource.objects.filter(tenant=panel_tenant(request))))


@panel_required
def file_edit(request, pk=None):
    resource = get_object_or_404(Resource, pk=pk, tenant=panel_tenant(request)) if pk else None
    form = FileForm(request.POST or None, request.FILES or None, instance=resource)
    if request.method == 'POST' and form.is_valid():
        saved = form.save(commit=False)
        saved.tenant = panel_tenant(request)
        saved.save()
        record(request, AuditLog.CONTENT_UPDATED if pk else AuditLog.CONTENT_CREATED,
               target=f'File: {saved.title}')
        messages.success(request, 'File saved.')
        return redirect('staff:files')
    return render(request, 'staff/form_page.html', _context(
        request, form=form, section='File / download', back_url=reverse('staff:files'),
        object=resource))


@panel_required
def file_delete(request, pk):
    resource = get_object_or_404(Resource, pk=pk, tenant=panel_tenant(request))
    if request.method == 'POST':
        record(request, AuditLog.CONTENT_DELETED, target=f'File: {resource.title}')
        resource.delete()
        messages.success(request, 'File deleted.')
        return redirect('staff:files')
    return render(request, 'staff/confirm_delete.html', _context(
        request, object=resource, kind='file', back_url=reverse('staff:files')))


@panel_required
def qr_codes(request):
    return render(request, 'staff/qr_codes.html', _context(
        request, codes=QRCode.objects.filter(tenant=panel_tenant(request))))


@panel_required
def qr_edit(request, pk=None):
    code = get_object_or_404(QRCode, pk=pk, tenant=panel_tenant(request)) if pk else None
    form = QRCodeForm(request.POST or None, request.FILES or None, instance=code)
    if request.method == 'POST' and form.is_valid():
        saved = form.save(commit=False)
        saved.updated_by = request.user
        saved.tenant = panel_tenant(request)
        saved.save()
        record(request, AuditLog.CONTENT_UPDATED if pk else AuditLog.CONTENT_CREATED,
               target=f'QR code: {saved.label}', detail=f'Points to: {saved.payload[:120]}')
        messages.success(request, 'QR code saved. The published code now points to the new target.')
        return redirect('staff:qr_codes')
    return render(request, 'staff/qr_form.html', _context(
        request, form=form, section='QR code', back_url=reverse('staff:qr_codes'),
        object=code))


@panel_required
def qr_delete(request, pk):
    code = get_object_or_404(QRCode, pk=pk, tenant=panel_tenant(request))
    if request.method == 'POST':
        record(request, AuditLog.CONTENT_DELETED, target=f'QR code: {code.label}')
        code.delete()
        messages.success(request, 'QR code deleted.')
        return redirect('staff:qr_codes')
    return render(request, 'staff/confirm_delete.html', _context(
        request, object=code, kind='QR code', back_url=reverse('staff:qr_codes')))


# ----------------------------------------------------------- super admin only

@super_admin_required
def administrators(request):
    return render(request, 'staff/administrators.html', _context(
        request, accounts=StaffProfile.objects.select_related('user').filter(
            tenant=panel_tenant(request)),
        default_password=django_settings.PANEL_DEFAULT_PASSWORD))


@super_admin_required
def administrator_edit(request, pk=None):
    tenant = panel_tenant(request)
    profile = get_object_or_404(StaffProfile, pk=pk, tenant=tenant) if pk else None
    form = AdminAccountForm(request.POST or None, instance=profile, creator=request.user,
                            tenant=tenant)
    if request.method == 'POST' and form.is_valid():
        saved = form.save()
        if pk:
            record(request, AuditLog.ADMIN_UPDATED, target=saved.user.get_username(),
                   detail=f'Role: {saved.get_role_display()}')
            messages.success(request, f'{saved.display_name} updated.')
        else:
            record(request, AuditLog.ADMIN_CREATED, target=saved.user.get_username(),
                   detail=f'Role: {saved.get_role_display()}')
            messages.success(
                request,
                f'{saved.display_name} created with the shared default password. '
                f'They must change it the first time they sign in.')
        return redirect('staff:administrators')
    return render(request, 'staff/form_page.html', _context(
        request, form=form, section='Administrator',
        back_url=reverse('staff:administrators'), object=profile,
        note=('New accounts start with the shared default password and are forced to '
              'change it at first sign-in.') if not pk else ''))


@super_admin_required
def administrator_toggle(request, pk):
    profile = get_object_or_404(StaffProfile, pk=pk, tenant=panel_tenant(request))
    if profile.user_id == request.user.id:
        messages.error(request, 'You cannot suspend your own account.')
        return redirect('staff:administrators')
    if request.method == 'POST':
        profile.is_enabled = not profile.is_enabled
        profile.save(update_fields=['is_enabled'])
        profile.apply_role_permissions()
        action = AuditLog.ADMIN_RESTORED if profile.is_enabled else AuditLog.ADMIN_SUSPENDED
        record(request, action, target=profile.user.get_username())
        messages.success(
            request,
            f'{profile.display_name} { "restored" if profile.is_enabled else "suspended" }.')
    return redirect('staff:administrators')


@super_admin_required
def administrator_reset_password(request, pk):
    profile = get_object_or_404(StaffProfile, pk=pk, tenant=panel_tenant(request))
    if request.method == 'POST':
        profile.set_default_password()
        record(request, AuditLog.PASSWORD_RESET, target=profile.user.get_username())
        messages.success(
            request,
            f'{profile.display_name} is back on the shared default password and must '
            f'change it at the next sign-in.')
    return redirect('staff:administrators')


@super_admin_required
def security(request):
    secret = PanelSecret.load()
    form = RotateSecretForm(request.POST or None)
    if request.method == 'POST':
        if 'toggle' in request.POST:
            secret.is_enabled = not secret.is_enabled
            secret.save(update_fields=['is_enabled'])
            record(request, AuditLog.SECRET_ROTATED,
                   target='Elevation secret',
                   detail=f'Elevation { "enabled" if secret.is_enabled else "disabled" }.')
            messages.success(
                request,
                f'Elevation { "enabled" if secret.is_enabled else "disabled" }.')
            return redirect('staff:security')
        if form.is_valid():
            secret.set_secret(form.cleaned_data['new_secret'])
            secret.updated_by = request.user
            secret.save()
            record(request, AuditLog.SECRET_ROTATED, target='Elevation secret',
                   detail='Secret rotated.')
            messages.success(request, 'The elevation secret has been rotated.')
            return redirect('staff:security')
    return render(request, 'staff/security.html', _context(
        request, form=form, secret=secret,
        elevated_now=StaffProfile.objects.filter(role=StaffProfile.ROLE_ADMIN).count()))


@super_admin_required
def audit_log(request):
    entries = AuditLog.objects.select_related('actor')
    action = request.GET.get('action', '')
    actor = request.GET.get('actor', '')
    if action:
        entries = entries.filter(action=action)
    if actor:
        entries = entries.filter(actor_label__icontains=actor)
    page = Paginator(entries, 40).get_page(request.GET.get('page'))
    return render(request, 'staff/audit_log.html', _context(
        request, entries=page, actions=AuditLog.ACTION_CHOICES,
        active_action=action, actor_query=actor))


# ------------------------------------------------------- content, of every kind

def _entry_or_404(kind):
    entry = content.get(kind)
    if entry is None:
        raise Http404(f'There is no content type called “{kind}”.')
    return entry


def _row_values(entry, obj):
    """The cells for one row of a list page."""
    cells = []
    for heading, attribute in entry['columns']:
        value = getattr(obj, attribute, '')
        if callable(value):
            value = value()
        if value is None or value == '':
            value = '—'
        elif isinstance(value, bool):
            value = 'Yes' if value else 'No'
        cells.append((heading, value))
    return cells


@panel_required
def content_list(request, kind):
    entry = _entry_or_404(kind)
    tenant = panel_tenant(request)
    rows = content.queryset_for(kind, tenant)
    page = Paginator(rows, 25).get_page(request.GET.get('page'))
    return render(request, 'staff/content_list.html', _context(
        request, kind=kind, entry=entry, section=entry['plural'], page=page,
        may_create=content.may_create(kind),
        headings=[heading for heading, _ in entry['columns']],
        rows=[(obj, _row_values(entry, obj)) for obj in page]))


@panel_required
def content_edit(request, kind, pk=None):
    entry = _entry_or_404(kind)
    tenant = panel_tenant(request)
    instance = None
    if pk is not None:
        instance = get_object_or_404(content.queryset_for(kind, tenant), pk=pk)
    elif not content.may_create(kind):
        # Registrations and member accounts arrive from the website, not from here.
        messages.info(request, f'{entry["plural"]} are created from the website. '
                               f'You can edit or remove the ones already here.')
        return redirect('staff:content_list', kind=kind)

    if request.method == 'POST':
        form = content.form_for(kind, tenant, instance=instance,
                                data=request.POST, files=request.FILES)
        if form.is_valid():
            saved = form.save(commit=False)
            if hasattr(saved, 'tenant_id') and not entry.get('shared'):
                saved.tenant = tenant
            saved.save()
            form.save_m2m()
            record(request, AuditLog.CONTENT_UPDATED if pk else AuditLog.CONTENT_CREATED,
                   target=f'{entry["label"]}: {saved}')
            messages.success(request, f'{entry["label"]} saved.')
            return redirect('staff:content_list', kind=kind)
        messages.error(request, 'Please correct the highlighted fields and save again.')
    else:
        form = content.form_for(kind, tenant, instance=instance)

    return render(request, 'staff/form_page.html', _context(
        request, form=form, section=entry['label'], object=instance,
        back_url=reverse('staff:content_list', args=[kind]), note=entry.get('help', '')))


@panel_required
def content_delete(request, kind, pk):
    entry = _entry_or_404(kind)
    tenant = panel_tenant(request)
    obj = get_object_or_404(content.queryset_for(kind, tenant), pk=pk)
    if request.method == 'POST':
        record(request, AuditLog.CONTENT_DELETED, target=f'{entry["label"]}: {obj}')
        obj.delete()
        messages.success(request, f'{entry["label"]} deleted.')
        return redirect('staff:content_list', kind=kind)
    return render(request, 'staff/confirm_delete.html', _context(
        request, object=obj, kind=entry['label'].lower(),
        back_url=reverse('staff:content_list', args=[kind])))


@super_admin_required
def administrator_delete(request, pk):
    """Remove an administrator account from this website, for good."""
    profile = get_object_or_404(StaffProfile, pk=pk, tenant=panel_tenant(request))
    if profile.user_id == request.user.id:
        messages.error(request, 'You cannot delete the account you are signed in with.')
        return redirect('staff:administrators')

    if request.method == 'POST':
        name, username = profile.display_name, profile.user.get_username()
        user = profile.user
        record(request, AuditLog.ADMIN_SUSPENDED, target=username,
               detail='Account deleted from the panel.')
        profile.delete()
        # The sign-in account goes too, unless it is also a platform account or
        # holds a member profile that would be orphaned.
        if not hasattr(user, 'platform_profile') and not hasattr(user, 'member_profile'):
            user.delete()
        messages.success(request, f'{name} has been removed.')
        return redirect('staff:administrators')

    return render(request, 'staff/confirm_delete.html', _context(
        request, object=profile, kind='administrator account',
        back_url=reverse('staff:administrators'),
        extra='Their audit-log entries are kept, so the record of what they did '
              'remains. Suspending instead keeps the account and its access history.'))

def session_check(request):
    """Answer the gateway's question: is this caller a signed-in staff member?

    The Java gateway calls this before it will proxy anything to the analytics
    dashboard, which has no login of its own. Django stays the single authority
    on who is signed in — disabling an account here closes every door at once.

    Nothing is returned but the answer: no username, no session data, no
    identifiers. A caller who is not signed in learns only that.
    """
    profile = get_profile(request)
    if profile is None:
        return JsonResponse({'authenticated': False}, status=200)

    return JsonResponse({
        'authenticated': True,
        'role': profile.role,
        'elevated': bool(elevation_expires_at(request)),
        'must_change_password': profile.must_change_password,
    }, status=200)
