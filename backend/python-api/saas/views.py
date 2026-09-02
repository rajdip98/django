"""The platform (SaaS) panel: one owner, many websites."""
from django.conf import settings as django_settings
from django.contrib import messages
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth import update_session_auth_hash
from django.core.paginator import Paginator
from django.db.models import Count
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from club.models import (Article, ContactMessage, Event, MembershipApplication,
                         SiteSettings)  # noqa: F401 — used by the delete summary
from staff.access import record
from staff.models import AuditLog, StaffProfile

from .access import (grant_unlock, is_unlocked, may_use_platform, platform_profile,
                     platform_required, revoke_unlock, unlock_expires_at)
from .forms import (PlatformAdminForm, PlatformLoginForm, PlatformPasswordForm,
                    RotatePlatformSecretForm, TenantForm, UnlockForm)
from .models import PlatformProfile, PlatformSecret, Tenant


def _context(request, **extra):
    profile = platform_profile(request)
    context = {
        'platform_profile': profile,
        'is_owner': profile is not None,
        'unlocked': is_unlocked(request),
        'unlock_expires': unlock_expires_at(request),
        'tenant_count': Tenant.objects.count(),
    }
    context.update(extra)
    return context


# ------------------------------------------------------------- session flow

def platform_login(request):
    if platform_profile(request):
        return redirect('saas:dashboard')
    form = PlatformLoginForm(request, data=request.POST or None)
    if request.method == 'POST':
        if form.is_valid():
            user = form.get_user()
            profile = PlatformProfile.objects.filter(user=user).first()
            if profile is None or not profile.is_enabled:
                record(request, AuditLog.LOGIN_FAILED, target=user.get_username(),
                       detail='Not a platform account.', actor=user)
                messages.error(
                    request,
                    'That account is not a platform account. Website administrators sign '
                    'in at their own website’s /panel/.')
            else:
                auth_login(request, user)
                profile.last_login_ip = request.META.get('REMOTE_ADDR')
                profile.save(update_fields=['last_login_ip'])
                record(request, AuditLog.LOGIN, target=user.get_username(),
                       detail='Platform panel.')
                if profile.must_change_password:
                    messages.warning(request, 'You are signed in with the shared platform '
                                              'password. Choose a new one now.')
                    return redirect('saas:change_password')
                return redirect('saas:dashboard')
        else:
            record(request, AuditLog.LOGIN_FAILED,
                   target=request.POST.get('username', '')[:150],
                   detail='Platform panel: wrong username or password.')
    return render(request, 'saas/login.html', {'form': form})


def platform_logout(request):
    if request.method != 'POST':
        return render(request, 'saas/logout.html', _context(request, section='Sign out'))
    if request.user.is_authenticated:
        record(request, AuditLog.LOGOUT, target=request.user.get_username(),
               detail='Platform panel.')
    revoke_unlock(request)
    auth_logout(request)
    messages.success(request, 'Signed out of the platform panel.')
    return redirect('saas:login')


def unlock(request):
    """A site admin exchanges the platform passphrase for a timed window."""
    if platform_profile(request):
        return redirect('saas:dashboard')
    secret = PlatformSecret.load()
    form = UnlockForm(request.POST or None)
    if request.method == 'POST':
        if not secret.is_enabled:
            record(request, AuditLog.ELEVATION_DENIED, target='Platform panel',
                   detail='Passphrase unlock is switched off.')
            messages.error(request, 'Passphrase access to the platform panel is switched off.')
        elif form.is_valid() and secret.verify(form.cleaned_data['passphrase']):
            expires = grant_unlock(request)
            record(request, AuditLog.ELEVATION_GRANTED, target='Platform panel',
                   detail=f'Unlocked until {expires:%Y-%m-%d %H:%M} UTC.')
            messages.success(request, 'Platform panel unlocked for 20 minutes.')
            return redirect('saas:dashboard')
        else:
            record(request, AuditLog.ELEVATION_DENIED, target='Platform panel',
                   detail='Wrong platform passphrase.')
            messages.error(request, 'That passphrase was not accepted.')
    from staff.views import panel_tenant  # local import avoids a circular import
    panel_site = panel_tenant(request)
    return render(request, 'saas/unlock.html', _context(
        request, form=form, secret_enabled=secret.is_enabled,
        tenant=panel_site, org=SiteSettings.load(panel_site),
        profile=getattr(request.user, 'staff_profile', None)))


def end_unlock(request):
    if is_unlocked(request):
        record(request, AuditLog.ELEVATION_REVOKED, target='Platform panel')
        revoke_unlock(request)
        messages.success(request, 'Platform access ended.')
    return redirect('staff:dashboard')


@platform_required
def change_password(request):
    profile = platform_profile(request)
    form = PlatformPasswordForm(request.user, request.POST or None)
    if request.method == 'POST' and form.is_valid():
        form.save()
        if profile:
            profile.register_password_change()
        update_session_auth_hash(request, request.user)
        record(request, AuditLog.PASSWORD_CHANGED, target=request.user.get_username(),
               detail='Platform account.')
        messages.success(request, 'Your platform password has been updated.')
        return redirect('saas:dashboard')
    return render(request, 'saas/change_password.html', _context(
        request, form=form, forced=bool(profile and profile.must_change_password),
        section='Password'))


# ---------------------------------------------------------------- dashboard

@platform_required
def dashboard(request):
    tenants = Tenant.objects.annotate(admins=Count('staff_accounts')).order_by('name')
    rows = []
    for tenant in tenants:
        rows.append({
            'tenant': tenant,
            'settings': SiteSettings.objects.filter(tenant=tenant).first(),
            'admins': tenant.admins,
            'events': Event.objects.filter(tenant=tenant).count(),
            'articles': Article.objects.filter(tenant=tenant).count(),
            'applications': MembershipApplication.objects.filter(
                tenant=tenant, status='pending').count(),
            'enquiries': ContactMessage.objects.filter(tenant=tenant, is_handled=False).count(),
        })
    return render(request, 'saas/dashboard.html', _context(
        request, rows=rows, section='Dashboard',
        total_admins=StaffProfile.objects.count(),
        recent=AuditLog.objects.select_related('actor')[:10]))


# ------------------------------------------------------------------ tenants

@platform_required
def tenants(request):
    return render(request, 'saas/tenants.html', _context(
        request, section='Websites',
        tenants=Tenant.objects.annotate(admins=Count('staff_accounts'))))


@platform_required
def tenant_edit(request, pk=None):
    tenant = get_object_or_404(Tenant, pk=pk) if pk else None
    form = TenantForm(request.POST or None, instance=tenant)
    if request.method == 'POST' and form.is_valid():
        saved = form.save(commit=False)
        if not saved.pk:
            saved.created_by = request.user
        saved.save()
        if saved.is_default:
            Tenant.objects.exclude(pk=saved.pk).update(is_default=False)
        if not SiteSettings.objects.filter(tenant=saved).exists():
            SiteSettings.objects.create(tenant=saved, organization_name=saved.name)
        record(request, AuditLog.CONTENT_UPDATED if pk else AuditLog.CONTENT_CREATED,
               target=f'Website: {saved.name}',
               detail=f'Domain: {saved.domain or "(default)"}')
        messages.success(request, f'“{saved.name}” saved.')
        return redirect('saas:tenants')
    return render(request, 'saas/form_page.html', _context(
        request, form=form, section='Website', object=tenant,
        back_url=reverse('saas:tenants'),
        note='A new website starts with its own empty settings, and needs at least one '
             'administrator before anyone can edit it.' if not pk else ''))


@platform_required
def tenant_toggle(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    if request.method == 'POST':
        tenant.is_active = not tenant.is_active
        tenant.save(update_fields=['is_active'])
        record(request, AuditLog.CONTENT_UPDATED, target=f'Website: {tenant.name}',
               detail='Taken offline.' if not tenant.is_active else 'Brought back online.')
        messages.success(
            request, f'“{tenant.name}” is now {"online" if tenant.is_active else "offline"}.')
    return redirect('saas:tenants')


# ----------------------------------------------------- administrators (all sites)

@platform_required
def administrators(request):
    accounts = StaffProfile.objects.select_related('user', 'tenant')
    tenant_filter = request.GET.get('tenant', '')
    if tenant_filter:
        accounts = accounts.filter(tenant__slug=tenant_filter)
    return render(request, 'saas/administrators.html', _context(
        request, section='Administrators', accounts=accounts,
        tenants=Tenant.objects.all(), active_tenant=tenant_filter,
        default_password=django_settings.PANEL_DEFAULT_PASSWORD))


@platform_required
def administrator_edit(request, pk=None):
    profile = get_object_or_404(StaffProfile, pk=pk) if pk else None
    form = PlatformAdminForm(request.POST or None, instance=profile, creator=request.user)
    if request.method == 'POST' and form.is_valid():
        saved = form.save()
        record(request, AuditLog.ADMIN_UPDATED if pk else AuditLog.ADMIN_CREATED,
               target=saved.user.get_username(),
               detail=f'{saved.get_role_display()} on {saved.tenant}')
        messages.success(
            request,
            f'{saved.display_name} saved for “{saved.tenant}”.' if pk else
            f'{saved.display_name} created for “{saved.tenant}” with the shared default '
            f'password, which they must change at first sign-in.')
        return redirect('saas:administrators')
    return render(request, 'saas/form_page.html', _context(
        request, form=form, section='Administrator', object=profile,
        back_url=reverse('saas:administrators')))


@platform_required
def administrator_toggle(request, pk):
    profile = get_object_or_404(StaffProfile, pk=pk)
    if request.method == 'POST':
        profile.is_enabled = not profile.is_enabled
        profile.save(update_fields=['is_enabled'])
        profile.apply_role_permissions()
        record(request, AuditLog.ADMIN_RESTORED if profile.is_enabled
               else AuditLog.ADMIN_SUSPENDED, target=profile.user.get_username(),
               detail=f'On {profile.tenant}')
        messages.success(request, f'{profile.display_name} '
                                  f'{"restored" if profile.is_enabled else "suspended"}.')
    return redirect('saas:administrators')


@platform_required
def administrator_reset(request, pk):
    profile = get_object_or_404(StaffProfile, pk=pk)
    if request.method == 'POST':
        profile.set_default_password()
        record(request, AuditLog.PASSWORD_RESET, target=profile.user.get_username(),
               detail=f'On {profile.tenant}')
        messages.success(request, f'{profile.display_name} is back on the shared default '
                                  f'password and must change it at next sign-in.')
    return redirect('saas:administrators')


# ----------------------------------------------------------------- security

@platform_required
def security(request):
    secret = PlatformSecret.load()
    form = RotatePlatformSecretForm(request.POST or None)
    if request.method == 'POST':
        if 'toggle' in request.POST:
            secret.is_enabled = not secret.is_enabled
            secret.save(update_fields=['is_enabled'])
            record(request, AuditLog.SECRET_ROTATED, target='Platform passphrase',
                   detail='Enabled.' if secret.is_enabled else 'Disabled.')
            messages.success(request, 'Passphrase access '
                                      f'{"enabled" if secret.is_enabled else "disabled"}.')
            return redirect('saas:security')
        if form.is_valid():
            secret.set_secret(form.cleaned_data['new_secret'])
            secret.updated_by = request.user
            secret.save()
            record(request, AuditLog.SECRET_ROTATED, target='Platform passphrase',
                   detail='Rotated.')
            messages.success(request, 'The platform passphrase has been rotated.')
            return redirect('saas:security')
    return render(request, 'saas/security.html', _context(
        request, section='Security', form=form, secret=secret,
        owners=PlatformProfile.objects.select_related('user')))


@platform_required
def audit_log(request):
    entries = AuditLog.objects.select_related('actor')
    action = request.GET.get('action', '')
    if action:
        entries = entries.filter(action=action)
    page = Paginator(entries, 40).get_page(request.GET.get('page'))
    return render(request, 'saas/audit_log.html', _context(
        request, section='Audit log', entries=page, actions=AuditLog.ACTION_CHOICES,
        active_action=action))


@platform_required
def tenant_delete(request, pk):
    """Delete a website and everything it holds. The heaviest action in the panel."""
    tenant = get_object_or_404(Tenant, pk=pk)
    counts = [
        ('administrator accounts', StaffProfile.objects.filter(tenant=tenant).count()),
        ('events', Event.objects.filter(tenant=tenant).count()),
        ('notices and news', Article.objects.filter(tenant=tenant).count()),
        ('membership applications', MembershipApplication.objects.filter(tenant=tenant).count()),
        ('enquiries', ContactMessage.objects.filter(tenant=tenant).count()),
    ]

    if request.method == 'POST':
        # Deleting a website is easy to do by accident, so the name must be typed.
        if request.POST.get('confirm_name', '').strip() != tenant.name:
            messages.error(request, 'The name did not match, so nothing was deleted.')
            return redirect('saas:tenant_delete', pk=pk)
        name = tenant.name
        record(request, AuditLog.CONTENT_DELETED, target=f'Website: {name}',
               detail='Website and all of its content deleted.')
        tenant.delete()
        messages.success(request, f'“{name}” and everything it held have been deleted.')
        return redirect('saas:tenants')

    return render(request, 'saas/confirm_delete_tenant.html', _context(
        request, section='Websites', tenant_to_delete=tenant, counts=counts))


@platform_required
def administrator_delete(request, pk):
    """Remove an administrator account from any website."""
    profile = get_object_or_404(StaffProfile, pk=pk)
    if profile.user_id == request.user.id:
        messages.error(request, 'You cannot delete the account you are signed in with.')
        return redirect('saas:administrators')

    if request.method == 'POST':
        name, username, website = profile.display_name, profile.user.get_username(), profile.tenant
        user = profile.user
        record(request, AuditLog.ADMIN_SUSPENDED, target=username,
               detail=f'Account deleted from the platform panel ({website}).')
        profile.delete()
        if not hasattr(user, 'platform_profile') and not hasattr(user, 'member_profile'):
            user.delete()
        messages.success(request, f'{name} has been removed from “{website}”.')
        return redirect('saas:administrators')

    return render(request, 'saas/confirm_delete.html', _context(
        request, section='Administrators', object=profile, kind='administrator account',
        back_url=reverse('saas:administrators'),
        extra='Their audit-log entries are kept. Suspending instead keeps the account.'))
