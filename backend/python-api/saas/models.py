"""The platform layer: one installation, many websites.

A **Tenant** is one website — its own name, logo, header, footer, banners,
programmes and notices, reached on its own domain. Site admins work inside a
single tenant and never see another.

A **Platform Owner** sits above every tenant. They create websites, issue and
suspend site-admin accounts across all of them, and read the audit trail for
the whole installation. The two are separate accounts with separate passwords:
holding a site-admin account grants nothing at platform level.
"""
from django.conf import settings as django_settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

PLATFORM_WINDOW = timezone.timedelta(minutes=20)
PLATFORM_MAX_ATTEMPTS = 5
PLATFORM_LOCKOUT = timezone.timedelta(minutes=15)


class Tenant(models.Model):
    """One website served by this installation."""

    PLAN_CHOICES = [
        ('basic', 'Basic'),
        ('standard', 'Standard'),
        ('full', 'Full'),
    ]

    name = models.CharField(max_length=160, help_text='Name of the organisation.')
    slug = models.SlugField(max_length=180, unique=True)
    domain = models.CharField(
        max_length=200, blank=True,
        help_text='Domain this website answers on, e.g. club.example.org. Leave blank '
                  'while it is the only website on this installation.')
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='standard')
    is_active = models.BooleanField(
        default=True, help_text='Unset to take the website offline without deleting it.')
    contact_email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)
    is_default = models.BooleanField(
        default=False,
        help_text='Served when no domain matches. Exactly one tenant should carry this.')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='tenants_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:180]
        super().save(*args, **kwargs)

    @classmethod
    def resolve(cls, host):
        """Pick the tenant for an incoming request, by domain then by default."""
        host = (host or '').split(':')[0].lower()
        if host:
            match = cls.objects.filter(domain__iexact=host, is_active=True).first()
            if match:
                return match
        return cls.objects.filter(is_default=True, is_active=True).first() \
            or cls.objects.filter(is_active=True).first()

    @property
    def admin_count(self):
        return self.staff_accounts.count()


class PlatformProfile(models.Model):
    """A platform-level account. Separate from any site-admin account."""

    user = models.OneToOneField(User, on_delete=models.CASCADE,
                                related_name='platform_profile')
    must_change_password = models.BooleanField(default=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    is_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = 'Platform account'

    def __str__(self):
        return f'{self.user.get_username()} (Platform Owner)'

    @property
    def display_name(self):
        return self.user.get_full_name() or self.user.get_username()

    def apply_permissions(self):
        user = self.user
        user.is_staff = self.is_enabled
        user.is_superuser = self.is_enabled
        user.is_active = self.is_enabled
        user.save(update_fields=['is_staff', 'is_superuser', 'is_active'])

    def register_password_change(self):
        self.must_change_password = False
        self.password_changed_at = timezone.now()
        self.save(update_fields=['must_change_password', 'password_changed_at'])

    def set_default_password(self):
        self.user.set_password(django_settings.PLATFORM_DEFAULT_PASSWORD)
        self.user.save(update_fields=['password'])
        self.must_change_password = True
        self.save(update_fields=['must_change_password'])


class PlatformSecret(models.Model):
    """Hashed passphrase that lets a site admin reach the platform panel.

    Stored hashed, rotatable, and switchable off entirely — with it disabled,
    only real platform accounts can open the platform panel.
    """

    secret_hash = models.CharField(max_length=256)
    is_enabled = models.BooleanField(
        default=True, verbose_name='Allow site admins to unlock the platform panel')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='platform_secrets_updated')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Platform passphrase'
        verbose_name_plural = 'Platform passphrase'

    def __str__(self):
        return 'Platform passphrase'

    @classmethod
    def load(cls):
        secret = cls.objects.first()
        if secret is None:
            secret = cls(is_enabled=True)
            secret.set_secret(django_settings.PLATFORM_DEFAULT_PASSWORD)
        return secret

    def set_secret(self, raw_value):
        self.secret_hash = make_password(raw_value)
        self.save()

    def verify(self, raw_value):
        if not self.is_enabled or not self.secret_hash:
            return False
        return check_password(raw_value, self.secret_hash)
