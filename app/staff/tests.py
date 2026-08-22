from django.conf import settings as django_settings
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from club.models import Banner, QRCode, SiteSettings

from .models import (ELEVATION_MAX_ATTEMPTS, AuditLog, PanelSecret,
                     StaffProfile)

DEFAULT = django_settings.PANEL_DEFAULT_PASSWORD
SECRET = django_settings.PANEL_ELEVATION_SECRET
NEW_PASSWORD = 'Kolkata!Sunrise26'


def make_staff(username, role, password=DEFAULT, must_change=True, enabled=True):
    user = User.objects.create_user(username=username, password=password,
                                    email=f'{username}@example.com', first_name=username.title())
    profile = StaffProfile.objects.create(user=user, role=role, must_change_password=must_change,
                                          is_enabled=enabled)
    profile.apply_role_permissions()
    return profile


class RoleSeparationTests(TestCase):
    """An Admin manages content; Super Admin sections stay out of reach."""

    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.admin = make_staff('ward_admin', StaffProfile.ROLE_ADMIN,
                               password=NEW_PASSWORD, must_change=False)
        cls.super_admin = make_staff('chief', StaffProfile.ROLE_SUPER_ADMIN,
                                     password=NEW_PASSWORD, must_change=False)

    def test_admin_reaches_every_content_section(self):
        self.client.force_login(self.admin.user)
        for name in ['dashboard', 'identity', 'header', 'footer', 'banners', 'files',
                     'qr_codes']:
            with self.subTest(section=name):
                self.assertEqual(self.client.get(reverse(f'staff:{name}')).status_code, 200)

    def test_admin_is_redirected_away_from_super_admin_sections(self):
        self.client.force_login(self.admin.user)
        for name in ['administrators', 'security', 'audit_log']:
            with self.subTest(section=name):
                response = self.client.get(reverse(f'staff:{name}'))
                self.assertRedirects(response, reverse('staff:elevate'))

    def test_super_admin_reaches_restricted_sections(self):
        self.client.force_login(self.super_admin.user)
        for name in ['administrators', 'security', 'audit_log']:
            with self.subTest(section=name):
                self.assertEqual(self.client.get(reverse(f'staff:{name}')).status_code, 200)

    def test_only_super_admin_gets_django_console_access(self):
        self.assertFalse(self.admin.user.is_staff)
        self.assertTrue(self.super_admin.user.is_staff)
        self.assertTrue(self.super_admin.user.is_superuser)

    def test_anonymous_visitor_is_sent_to_the_panel_login(self):
        response = self.client.get(reverse('staff:dashboard'))
        self.assertRedirects(response, reverse('staff:login'))

    def test_suspended_account_cannot_use_the_panel(self):
        self.admin.is_enabled = False
        self.admin.save()
        self.client.force_login(self.admin.user)
        self.assertRedirects(self.client.get(reverse('staff:dashboard')), reverse('staff:login'))


class FirstLoginPasswordTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.profile = make_staff('newadmin', StaffProfile.ROLE_ADMIN)

    def test_default_password_signs_in_but_forces_a_change(self):
        response = self.client.post(reverse('staff:login'),
                                    {'username': 'newadmin', 'password': DEFAULT})
        self.assertRedirects(response, reverse('staff:change_password'))

    def test_panel_is_locked_until_the_password_changes(self):
        self.client.force_login(self.profile.user)
        for name in ['dashboard', 'banners', 'qr_codes']:
            with self.subTest(section=name):
                self.assertRedirects(self.client.get(reverse(f'staff:{name}')),
                                     reverse('staff:change_password'))

    def test_super_admin_sections_are_locked_too(self):
        super_admin = make_staff('boss', StaffProfile.ROLE_SUPER_ADMIN)
        self.client.force_login(super_admin.user)
        self.assertRedirects(self.client.get(reverse('staff:administrators')),
                             reverse('staff:change_password'))

    def test_the_default_password_cannot_be_kept(self):
        self.client.force_login(self.profile.user)
        response = self.client.post(reverse('staff:change_password'),
                                    {'new_password1': DEFAULT, 'new_password2': DEFAULT})
        self.assertContains(response, 'cannot keep the shared default password')
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.must_change_password)

    def test_the_elevation_secret_cannot_be_used_as_a_password(self):
        self.client.force_login(self.profile.user)
        response = self.client.post(reverse('staff:change_password'),
                                    {'new_password1': SECRET, 'new_password2': SECRET})
        self.assertContains(response, 'reserved')

    def test_a_new_password_unlocks_the_panel(self):
        self.client.force_login(self.profile.user)
        self.client.post(reverse('staff:change_password'),
                         {'new_password1': NEW_PASSWORD, 'new_password2': NEW_PASSWORD})
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.must_change_password)
        self.assertIsNotNone(self.profile.password_changed_at)
        self.assertEqual(self.client.get(reverse('staff:dashboard')).status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.PASSWORD_CHANGED).exists())


class ElevationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.admin = make_staff('deputy', StaffProfile.ROLE_ADMIN,
                               password=NEW_PASSWORD, must_change=False)
        PanelSecret.load()

    def setUp(self):
        self.client.force_login(self.admin.user)

    def test_correct_secret_opens_a_super_admin_window(self):
        response = self.client.post(reverse('staff:elevate'), {'secret': SECRET})
        self.assertRedirects(response, reverse('staff:dashboard'))
        self.assertEqual(self.client.get(reverse('staff:administrators')).status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.ELEVATION_GRANTED).exists())

    def test_wrong_secret_is_refused_and_recorded(self):
        self.client.post(reverse('staff:elevate'), {'secret': 'not-the-secret'})
        self.assertRedirects(self.client.get(reverse('staff:administrators')),
                             reverse('staff:elevate'))
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.ELEVATION_DENIED).exists())

    def test_repeated_failures_lock_elevation(self):
        for _ in range(ELEVATION_MAX_ATTEMPTS):
            self.client.post(reverse('staff:elevate'), {'secret': 'wrong'})
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.elevation_locked)
        self.client.post(reverse('staff:elevate'), {'secret': SECRET})
        self.assertRedirects(self.client.get(reverse('staff:administrators')),
                             reverse('staff:elevate'))

    def test_expired_window_closes_access(self):
        self.client.post(reverse('staff:elevate'), {'secret': SECRET})
        session = self.client.session
        session['panel_elevated_until'] = (timezone.now() - timezone.timedelta(minutes=1)).isoformat()
        session.save()
        self.assertRedirects(self.client.get(reverse('staff:administrators')),
                             reverse('staff:elevate'))

    def test_ending_elevation_revokes_access(self):
        self.client.post(reverse('staff:elevate'), {'secret': SECRET})
        self.client.get(reverse('staff:end_elevation'))
        self.assertRedirects(self.client.get(reverse('staff:security')),
                             reverse('staff:elevate'))

    def test_disabled_secret_refuses_elevation(self):
        secret = PanelSecret.load()
        secret.is_enabled = False
        secret.save()
        self.client.post(reverse('staff:elevate'), {'secret': SECRET})
        self.assertRedirects(self.client.get(reverse('staff:administrators')),
                             reverse('staff:elevate'))

    def test_secret_is_not_stored_in_clear(self):
        secret = PanelSecret.load()
        self.assertNotIn(SECRET, secret.secret_hash)
        self.assertTrue(secret.verify(SECRET))


class AdministratorManagementTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.super_admin = make_staff('chief', StaffProfile.ROLE_SUPER_ADMIN,
                                     password=NEW_PASSWORD, must_change=False)

    def setUp(self):
        self.client.force_login(self.super_admin.user)

    def test_super_admin_creates_an_admin_on_the_default_password(self):
        self.client.post(reverse('staff:administrator_create'), {
            'username': 'newperson', 'first_name': 'New', 'last_name': 'Person',
            'email': 'new@example.com', 'role': StaffProfile.ROLE_ADMIN,
            'designation': 'Content editor', 'phone': ''})
        profile = StaffProfile.objects.get(user__username='newperson')
        self.assertEqual(profile.role, StaffProfile.ROLE_ADMIN)
        self.assertTrue(profile.must_change_password)
        self.assertTrue(profile.user.check_password(DEFAULT))
        self.assertFalse(profile.user.is_staff)
        self.assertEqual(profile.created_by, self.super_admin.user)
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.ADMIN_CREATED).exists())

    def test_creating_many_admins_is_allowed(self):
        for index in range(5):
            self.client.post(reverse('staff:administrator_create'), {
                'username': f'admin{index}', 'first_name': f'Admin{index}', 'last_name': '',
                'email': f'admin{index}@example.com', 'role': StaffProfile.ROLE_ADMIN,
                'designation': '', 'phone': ''})
        self.assertEqual(StaffProfile.objects.filter(role=StaffProfile.ROLE_ADMIN).count(), 5)

    def test_password_reset_puts_an_account_back_on_the_default(self):
        target = make_staff('someone', StaffProfile.ROLE_ADMIN,
                            password=NEW_PASSWORD, must_change=False)
        self.client.post(reverse('staff:administrator_reset', args=[target.pk]))
        target.refresh_from_db()
        self.assertTrue(target.must_change_password)
        self.assertTrue(target.user.check_password(DEFAULT))

    def test_suspension_blocks_the_account(self):
        target = make_staff('temp', StaffProfile.ROLE_ADMIN,
                            password=NEW_PASSWORD, must_change=False)
        self.client.post(reverse('staff:administrator_toggle', args=[target.pk]))
        target.refresh_from_db()
        self.assertFalse(target.is_enabled)
        self.assertFalse(target.user.is_active)

    def test_a_super_admin_cannot_suspend_themselves(self):
        self.client.post(reverse('staff:administrator_toggle', args=[self.super_admin.pk]))
        self.super_admin.refresh_from_db()
        self.assertTrue(self.super_admin.is_enabled)

    def test_rotating_the_secret_changes_what_is_accepted(self):
        self.client.post(reverse('staff:security'),
                         {'new_secret': 'a-longer-secret-2026', 'confirm_secret': 'a-longer-secret-2026'})
        secret = PanelSecret.load()
        self.assertFalse(secret.verify(SECRET))
        self.assertTrue(secret.verify('a-longer-secret-2026'))


class ContentManagementTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.admin = make_staff('editor', StaffProfile.ROLE_ADMIN,
                               password=NEW_PASSWORD, must_change=False)

    def setUp(self):
        self.client.force_login(self.admin.user)

    def test_admin_can_rename_the_site_and_it_shows_publicly(self):
        self.client.post(reverse('staff:identity'), {
            'organization_name': 'Ward 12 Community Club', 'short_name': 'W12',
            'slogan': 'Together we serve', 'established': 2004,
            'primary_color': '#123a6d', 'introduction': 'A community organisation.'})
        self.assertEqual(SiteSettings.load().organization_name, 'Ward 12 Community Club')
        self.assertContains(self.client.get(reverse('club:home')), 'Ward 12 Community Club')

    def test_header_switches_take_effect_on_the_public_site(self):
        self.client.post(reverse('staff:header'), {
            'parent_authority': 'District Board', 'registration_line': 'Reg. 1/2004'})
        settings_obj = SiteSettings.load()
        self.assertFalse(settings_obj.show_ticker)
        self.assertFalse(settings_obj.show_top_strip)
        self.assertNotContains(self.client.get(reverse('club:home')), 'ticker-label')

    def test_banner_created_in_the_panel_appears_on_the_site(self):
        self.client.post(reverse('staff:banner_create'), {
            'title': 'Blood donation camp on Sunday', 'subtitle': 'Donors welcome',
            'placement': 'home_strip', 'link_url': '/events/', 'link_text': 'See details',
            'order': 0, 'is_active': 'on'})
        banner = Banner.objects.get()
        self.assertEqual(banner.updated_by, self.admin.user)
        self.assertContains(self.client.get(reverse('club:home')),
                            'Blood donation camp on Sunday')

    def test_content_changes_are_audited(self):
        self.client.post(reverse('staff:footer'), {
            'address': 'Ward 12', 'phone': '123', 'email': 'a@example.com'})
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.CONTENT_UPDATED,
                                                target='Footer').exists())


class QRCodeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.admin = make_staff('qradmin', StaffProfile.ROLE_ADMIN,
                               password=NEW_PASSWORD, must_change=False)
        cls.code = QRCode.objects.create(
            label='Membership form', payload='https://example.org/membership/',
            placement='footer', caption='Scan to apply')

    def test_code_renders_as_svg(self):
        response = self.client.get(reverse('club:qr_svg', args=[self.code.slug]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/svg+xml')
        self.assertIn(b'<svg', response.content)

    def test_inactive_code_is_not_served(self):
        self.code.is_active = False
        self.code.save()
        self.assertEqual(
            self.client.get(reverse('club:qr_svg', args=[self.code.slug])).status_code, 404)

    def test_code_appears_in_the_footer_of_every_page(self):
        response = self.client.get(reverse('club:home'))
        self.assertContains(response, self.code.get_absolute_url())

    def test_repointing_the_code_keeps_the_same_address(self):
        original_url = self.code.get_absolute_url()
        self.client.force_login(self.admin.user)
        self.client.post(reverse('staff:qr_edit', args=[self.code.pk]), {
            'label': 'Membership form', 'payload': 'https://example.org/events/',
            'caption': 'Scan to apply', 'scans_hint': '', 'placement': 'footer',
            'error_correction': 'M', 'order': 0, 'is_active': 'on'})
        self.code.refresh_from_db()
        self.assertEqual(self.code.payload, 'https://example.org/events/')
        self.assertEqual(self.code.get_absolute_url(), original_url)
        self.assertEqual(self.client.get(original_url).status_code, 200)

    def test_uploaded_image_takes_precedence(self):
        self.code.image = 'qr/custom.png'
        self.code.save()
        self.assertIn('custom.png', self.code.display_url)
