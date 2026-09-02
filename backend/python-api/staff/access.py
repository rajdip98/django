"""Access rules for the admin panel.

`panel_required` gates every panel page on an enabled staff account.
`super_admin_required` additionally demands the Super Admin role — or a live
elevation window opened with the elevation secret.
"""
from functools import wraps

from django.contrib import messages
from django.shortcuts import redirect
from django.utils import timezone

from .models import ELEVATION_WINDOW, AuditLog, StaffProfile

ELEVATION_SESSION_KEY = 'panel_elevated_until'


def get_profile(request):
    if not request.user.is_authenticated:
        return None
    return StaffProfile.objects.filter(user=request.user, is_enabled=True).first()


def is_platform_user(request):
    """True when the signed-in account is a platform (SaaS) account.

    Platform accounts administer websites from the platform panel; they are not
    site admins and do not get a site panel session.
    """
    if not request.user.is_authenticated:
        return False
    return hasattr(request.user, 'platform_profile')


def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def is_elevated(request):
    """True while an Admin's elevation window is still open."""
    raw = request.session.get(ELEVATION_SESSION_KEY)
    if not raw:
        return False
    try:
        expires = timezone.datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return False
    if timezone.is_naive(expires):
        expires = timezone.make_aware(expires)
    if expires <= timezone.now():
        request.session.pop(ELEVATION_SESSION_KEY, None)
        return False
    return True


def elevation_expires_at(request):
    raw = request.session.get(ELEVATION_SESSION_KEY)
    if not raw:
        return None
    try:
        return timezone.datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return None


def grant_elevation(request):
    expires = timezone.now() + ELEVATION_WINDOW
    request.session[ELEVATION_SESSION_KEY] = expires.isoformat()
    return expires


def revoke_elevation(request):
    request.session.pop(ELEVATION_SESSION_KEY, None)


def has_super_powers(request):
    profile = get_profile(request)
    if profile is None:
        return False
    return profile.is_super_admin or is_elevated(request)


def record(request, action, target='', detail='', actor=None):
    """Write an audit entry. Never raises — auditing must not break a request."""
    user = actor or (request.user if request.user.is_authenticated else None)
    try:
        AuditLog.objects.create(
            actor=user,
            actor_label=(user.get_username() if user else 'anonymous'),
            action=action,
            target=str(target)[:200],
            detail=detail,
            ip_address=client_ip(request),
            was_elevated=is_elevated(request),
        )
    except Exception:  # pragma: no cover - auditing is best effort
        pass


def panel_required(view):
    """Signed in, staff account enabled, and password already changed."""

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        profile = get_profile(request)
        if profile is None:
            return redirect('staff:login')
        if profile.must_change_password and view.__name__ != 'change_password':
            return redirect('staff:change_password')
        request.staff_profile = profile
        return view(request, *args, **kwargs)

    return wrapper


def super_admin_required(view):
    """Super Admin, or an Admin inside a live elevation window."""

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        profile = get_profile(request)
        if profile is None:
            return redirect('staff:login')
        if profile.must_change_password:
            return redirect('staff:change_password')
        if not (profile.is_super_admin or is_elevated(request)):
            messages.warning(
                request,
                'That section is restricted to Super Admins. Enter the elevation secret '
                'to continue with Super Admin access for a limited time.')
            return redirect('staff:elevate')
        request.staff_profile = profile
        return view(request, *args, **kwargs)

    return wrapper
