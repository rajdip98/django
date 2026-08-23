"""Roles, audit trail and the elevation secret for the admin panel.

Two roles exist. A **Super Admin** may do everything: manage website content,
create and disable other administrators, rotate the elevation secret and read
the audit log. An **Admin** may only manage website content — identity, header,
footer, banners, files and QR codes — and never sees the Super Admin sections.

An Admin may borrow Super Admin access for a short, audited window by entering
the elevation secret. The secret is stored hashed, can be rotated or switched
off entirely by a Super Admin, and repeated wrong guesses lock the account out
of elevation.
"""
from datetime import timedelta

from django.conf import settings as django_settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone

from saas.models import Tenant

ELEVATION_WINDOW = timedelta(minutes=30)
ELEVATION_MAX_ATTEMPTS = 5
ELEVATION_LOCKOUT = timedelta(minutes=15)


class StaffProfile(models.Model):
    ROLE_SUPER_ADMIN = 'super_admin'
    ROLE_ADMIN = 'admin'
    ROLE_CHOICES = [
        (ROLE_SUPER_ADMIN, 'Super Admin'),
        (ROLE_ADMIN, 'Admin'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='staff_profile')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, null=True, blank=True,
                               related_name='staff_accounts',
                               help_text='The website this account administers.')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_ADMIN)
    designation = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    must_change_password = models.BooleanField(
        default=True,
        help_text='While set, the account can do nothing but change its password.')
    password_changed_at = models.DateTimeField(null=True, blank=True)
    is_enabled = models.BooleanField(
        default=True, help_text='Unset to suspend the account without deleting it.')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='staff_accounts_created')
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    failed_elevation_attempts = models.PositiveSmallIntegerField(default=0)
    elevation_locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['role', 'user__username']
        verbose_name = 'Staff account'

    def __str__(self):
        return f'{self.user.get_username()} ({self.get_role_display()})'

    @property
    def is_super_admin(self):
        return self.role == self.ROLE_SUPER_ADMIN

    @property
    def display_name(self):
        return self.user.get_full_name() or self.user.get_username()

    @property
    def elevation_locked(self):
        return bool(self.elevation_locked_until and self.elevation_locked_until > timezone.now())

    def apply_role_permissions(self):
        """Keep Django's own flags in step with the panel role.

        Only a Super Admin gets into the Django admin console at `/admin/`;
        Admins are confined to `/panel/`.
        """
        user = self.user
        user.is_staff = self.is_super_admin and self.is_enabled
        user.is_superuser = self.is_super_admin and self.is_enabled
        user.is_active = self.is_enabled
        user.save(update_fields=['is_staff', 'is_superuser', 'is_active'])

    def set_default_password(self):
        """Reset to the shared default and require a change at next login."""
        self.user.set_password(django_settings.PANEL_DEFAULT_PASSWORD)
        self.user.save(update_fields=['password'])
        self.must_change_password = True
        self.save(update_fields=['must_change_password'])

    def register_password_change(self):
        self.must_change_password = False
        self.password_changed_at = timezone.now()
        self.save(update_fields=['must_change_password', 'password_changed_at'])

    def register_elevation_failure(self):
        self.failed_elevation_attempts += 1
        if self.failed_elevation_attempts >= ELEVATION_MAX_ATTEMPTS:
            self.elevation_locked_until = timezone.now() + ELEVATION_LOCKOUT
            self.failed_elevation_attempts = 0
        self.save(update_fields=['failed_elevation_attempts', 'elevation_locked_until'])

    def clear_elevation_failures(self):
        self.failed_elevation_attempts = 0
        self.elevation_locked_until = None
        self.save(update_fields=['failed_elevation_attempts', 'elevation_locked_until'])


class PanelSecret(models.Model):
    """Singleton holding the hashed elevation secret.

    The raw value is never stored. A Super Admin can rotate it or disable
    elevation altogether, in which case no Admin can reach Super Admin pages.
    """

    secret_hash = models.CharField(max_length=256)
    is_enabled = models.BooleanField(
        default=True, verbose_name='Allow Admins to elevate with the secret')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='panel_secrets_updated')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Elevation secret'
        verbose_name_plural = 'Elevation secret'

    def __str__(self):
        return 'Elevation secret'

    @classmethod
    def load(cls):
        secret = cls.objects.first()
        if secret is None:
            secret = cls(is_enabled=True)
            secret.set_secret(django_settings.PANEL_ELEVATION_SECRET)
        return secret

    def set_secret(self, raw_value):
        self.secret_hash = make_password(raw_value)
        self.save()

    def verify(self, raw_value):
        if not self.is_enabled or not self.secret_hash:
            return False
        return check_password(raw_value, self.secret_hash)


class AuditLog(models.Model):
    """Append-only record of everything done through the panel."""

    LOGIN = 'login'
    LOGIN_FAILED = 'login_failed'
    LOGOUT = 'logout'
    PASSWORD_CHANGED = 'password_changed'
    PASSWORD_RESET = 'password_reset'
    ADMIN_CREATED = 'admin_created'
    ADMIN_UPDATED = 'admin_updated'
    ADMIN_SUSPENDED = 'admin_suspended'
    ADMIN_RESTORED = 'admin_restored'
    ELEVATION_GRANTED = 'elevation_granted'
    ELEVATION_DENIED = 'elevation_denied'
    ELEVATION_REVOKED = 'elevation_revoked'
    SECRET_ROTATED = 'secret_rotated'
    CONTENT_UPDATED = 'content_updated'
    CONTENT_CREATED = 'content_created'
    CONTENT_DELETED = 'content_deleted'

    ACTION_CHOICES = [
        (LOGIN, 'Signed in'), (LOGIN_FAILED, 'Failed sign-in'), (LOGOUT, 'Signed out'),
        (PASSWORD_CHANGED, 'Changed password'), (PASSWORD_RESET, 'Password reset to default'),
        (ADMIN_CREATED, 'Created an administrator'), (ADMIN_UPDATED, 'Updated an administrator'),
        (ADMIN_SUSPENDED, 'Suspended an administrator'),
        (ADMIN_RESTORED, 'Restored an administrator'),
        (ELEVATION_GRANTED, 'Elevated to Super Admin'),
        (ELEVATION_DENIED, 'Elevation refused'),
        (ELEVATION_REVOKED, 'Elevation ended'),
        (SECRET_ROTATED, 'Rotated the elevation secret'),
        (CONTENT_UPDATED, 'Updated content'), (CONTENT_CREATED, 'Created content'),
        (CONTENT_DELETED, 'Deleted content'),
    ]

    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='audit_entries')
    actor_label = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    target = models.CharField(max_length=200, blank=True)
    detail = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    was_elevated = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Audit log entry'
        verbose_name_plural = 'Audit log'

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M} {self.actor_label} — {self.get_action_display()}'
