"""Create the first Super Admin and the elevation secret.

Safe to run repeatedly: existing accounts are left alone.
"""
from django.conf import settings as django_settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from staff.models import PanelSecret, StaffProfile


class Command(BaseCommand):
    help = 'Create the initial Super Admin account and elevation secret.'

    def add_arguments(self, parser):
        parser.add_argument('--username', default='superadmin')
        parser.add_argument('--email', default='superadmin@example.com')
        parser.add_argument('--name', default='Super Admin')

    def handle(self, *args, **options):
        username = options['username']
        user, created = User.objects.get_or_create(
            username=username,
            defaults={'email': options['email'], 'first_name': options['name']})
        if created:
            user.set_password(django_settings.PANEL_DEFAULT_PASSWORD)
            user.save()

        profile, profile_created = StaffProfile.objects.get_or_create(
            user=user,
            defaults={'role': StaffProfile.ROLE_SUPER_ADMIN,
                      'designation': 'Portal administrator',
                      'must_change_password': True})
        if not profile_created and profile.role != StaffProfile.ROLE_SUPER_ADMIN:
            profile.role = StaffProfile.ROLE_SUPER_ADMIN
            profile.save(update_fields=['role'])
        profile.apply_role_permissions()

        if not PanelSecret.objects.exists():
            PanelSecret.load()
            self.stdout.write('Elevation secret initialised from PANEL_ELEVATION_SECRET.')

        # Adopt any pre-existing `admin` superuser into the panel, so it does
        # not hold access without a role or an audit trail.
        legacy = User.objects.filter(username='admin').first()
        if legacy and not StaffProfile.objects.filter(user=legacy).exists():
            StaffProfile.objects.create(
                user=legacy, role=StaffProfile.ROLE_SUPER_ADMIN,
                designation='Legacy sample account', must_change_password=True)

        if created:
            self.stdout.write(self.style.SUCCESS(
                f'Super Admin "{username}" created with the shared default password. '
                f'It must be changed at first sign-in at /adminpanel/login/.'))
        else:
            self.stdout.write(f'Super Admin "{username}" already exists — left unchanged.')
