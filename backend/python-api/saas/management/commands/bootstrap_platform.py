"""Create the platform owner, the platform passphrase and the first website."""
from django.conf import settings as django_settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from club.models import SiteSettings
from saas.models import PlatformProfile, PlatformSecret, Tenant
from staff.models import StaffProfile


class Command(BaseCommand):
    help = 'Create the platform owner account, passphrase and default website.'

    def add_arguments(self, parser):
        parser.add_argument('--username', default='platformowner')
        parser.add_argument('--email', default='owner@example.com')
        parser.add_argument('--site-name', default='Demo Club Website')

    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(is_default=True).first()
        if tenant is None:
            tenant = Tenant.objects.create(
                name=options['site_name'], is_default=True,
                notes='Created by bootstrap_platform as the default website.')
            self.stdout.write(f'Default website "{tenant.name}" created.')

        # adopt any content that predates the platform layer
        for model in (SiteSettings,):
            model.objects.filter(tenant__isnull=True).update(tenant=tenant)
        StaffProfile.objects.filter(tenant__isnull=True).update(tenant=tenant)

        user, created = User.objects.get_or_create(
            username=options['username'],
            defaults={'email': options['email'], 'first_name': 'Platform Owner'})
        if created:
            user.set_password(django_settings.PLATFORM_DEFAULT_PASSWORD)
            user.save()
        profile, _ = PlatformProfile.objects.get_or_create(
            user=user, defaults={'must_change_password': True})
        profile.apply_permissions()

        if not PlatformSecret.objects.exists():
            PlatformSecret.load()
            self.stdout.write('Platform passphrase initialised from PLATFORM_DEFAULT_PASSWORD.')

        if created:
            self.stdout.write(self.style.SUCCESS(
                f'Platform owner "{options["username"]}" created with the shared platform '
                f'password. It must be changed at first sign-in at /superadminpanel/login/.'))
        else:
            self.stdout.write(f'Platform owner "{options["username"]}" already exists.')
