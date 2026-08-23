"""Who may open the platform panel, and how a site admin unlocks it."""
from functools import wraps

from django.contrib import messages
from django.shortcuts import redirect
from django.utils import timezone

from staff.access import client_ip, record  # audit helpers are shared
from staff.models import AuditLog

from .models import PLATFORM_WINDOW, PlatformProfile

UNLOCK_SESSION_KEY = 'platform_unlocked_until'


def platform_profile(request):
    if not request.user.is_authenticated:
        return None
    return PlatformProfile.objects.filter(user=request.user, is_enabled=True).first()


def is_unlocked(request):
    """True while a site admin's platform window, opened with the passphrase, is live."""
    raw = request.session.get(UNLOCK_SESSION_KEY)
    if not raw:
        return False
    try:
        expires = timezone.datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return False
    if timezone.is_naive(expires):
        expires = timezone.make_aware(expires)
    if expires <= timezone.now():
        request.session.pop(UNLOCK_SESSION_KEY, None)
        return False
    return True


def unlock_expires_at(request):
    raw = request.session.get(UNLOCK_SESSION_KEY)
    if not raw:
        return None
    try:
        return timezone.datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return None


def grant_unlock(request):
    expires = timezone.now() + PLATFORM_WINDOW
    request.session[UNLOCK_SESSION_KEY] = expires.isoformat()
    return expires


def revoke_unlock(request):
    request.session.pop(UNLOCK_SESSION_KEY, None)


def may_use_platform(request):
    """A platform account, or a site admin holding a live unlock window."""
    return platform_profile(request) is not None or is_unlocked(request)


def platform_required(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        profile = platform_profile(request)
        if profile is not None:
            if profile.must_change_password and view.__name__ != 'change_password':
                return redirect('saas:change_password')
            request.platform_profile = profile
            return view(request, *args, **kwargs)
        if is_unlocked(request):
            request.platform_profile = None
            return view(request, *args, **kwargs)
        if request.user.is_authenticated:
            messages.warning(
                request,
                'The platform panel is separate from a website’s admin panel. Enter the '
                'platform passphrase to continue.')
            return redirect('saas:unlock')
        return redirect('saas:login')

    return wrapper
