from django.conf import settings as django_settings
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from club.models import Announcement, Banner, QRCode, SiteSettings

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


class SiteAppearanceTests(TestCase):
    """Panel changes to the name, header and banners reach the public site."""
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


class ContentManagementTests(TestCase):
    """An administrator can add, edit and remove every kind of content."""

    @classmethod
    def setUpTestData(cls):
        from saas.models import Tenant
        cls.tenant = Tenant.objects.create(name='Content Test', is_default=True)
        SiteSettings.objects.create(tenant=cls.tenant, organization_name='Content Test')
        cls.admin = make_staff('content_admin', StaffProfile.ROLE_ADMIN,
                               password=NEW_PASSWORD, must_change=False)
        cls.admin.tenant = cls.tenant
        cls.admin.save()

    def setUp(self):
        self.client.force_login(self.admin.user)

    def test_every_content_type_has_a_working_list_page(self):
        from staff import content
        for kind in content.REGISTRY:
            with self.subTest(kind=kind):
                response = self.client.get(reverse('staff:content_list', args=[kind]))
                self.assertEqual(response.status_code, 200)

    def test_every_content_type_has_a_working_form(self):
        """Most types can be created here; the ones filled in from the website
        redirect back to their list instead of offering an empty form."""
        from staff import content
        for kind in content.REGISTRY:
            with self.subTest(kind=kind):
                response = self.client.get(reverse('staff:content_create', args=[kind]))
                if content.may_create(kind):
                    self.assertEqual(response.status_code, 200)
                else:
                    self.assertRedirects(
                        response, reverse('staff:content_list', args=[kind]))

    def test_an_unknown_content_type_is_a_404(self):
        self.assertEqual(
            self.client.get(reverse('staff:content_list', args=['nonsense'])).status_code, 404)

    def test_adding_a_notice_puts_it_on_the_public_site(self):
        self.client.post(reverse('staff:content_create', args=['announcements']), {
            'title': 'Water supply interrupted on Tuesday', 'kind': 'notice',
            'body': 'Repairs to the main line.', 'link': '',
            'published_at': '2026-08-20T10:00', 'is_active': 'on', 'is_new': 'on'})
        notice = Announcement.objects.get()
        self.assertEqual(notice.tenant, self.tenant)
        self.assertContains(self.client.get(reverse('club:home')),
                            'Water supply interrupted on Tuesday')

    def test_editing_changes_what_the_public_sees(self):
        notice = Announcement.objects.create(
            tenant=self.tenant, title='Original wording', kind='notice')
        self.client.post(reverse('staff:content_edit', args=['announcements', notice.pk]), {
            'title': 'Corrected wording', 'kind': 'notice', 'body': '', 'link': '',
            'published_at': '2026-08-20T10:00', 'is_active': 'on'})
        notice.refresh_from_db()
        self.assertEqual(notice.title, 'Corrected wording')
        page = self.client.get(reverse('club:home'))
        self.assertContains(page, 'Corrected wording')
        self.assertNotContains(page, 'Original wording')

    def test_removing_takes_it_off_the_public_site(self):
        notice = Announcement.objects.create(
            tenant=self.tenant, title='Temporary notice', kind='notice')
        response = self.client.post(
            reverse('staff:content_delete', args=['announcements', notice.pk]))
        self.assertRedirects(response, reverse('staff:content_list', args=['announcements']))
        self.assertFalse(Announcement.objects.filter(pk=notice.pk).exists())
        self.assertNotContains(self.client.get(reverse('club:home')), 'Temporary notice')

    def test_deletion_is_recorded(self):
        notice = Announcement.objects.create(tenant=self.tenant, title='Audited', kind='notice')
        self.client.post(reverse('staff:content_delete', args=['announcements', notice.pk]))
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.CONTENT_DELETED).exists())

    def test_one_website_cannot_touch_another_websites_content(self):
        from saas.models import Tenant
        other = Tenant.objects.create(name='Another Website')
        theirs = Announcement.objects.create(tenant=other, title='Not yours', kind='notice')
        self.assertEqual(self.client.get(
            reverse('staff:content_edit', args=['announcements', theirs.pk])).status_code, 404)
        self.assertEqual(self.client.get(
            reverse('staff:content_delete', args=['announcements', theirs.pk])).status_code, 404)
        listing = self.client.get(reverse('staff:content_list', args=['announcements']))
        self.assertNotContains(listing, 'Not yours')

    def test_the_sidebar_offers_every_content_type(self):
        from staff import content
        response = self.client.get(reverse('staff:dashboard'))
        for kind, entry in content.REGISTRY.items():
            with self.subTest(kind=kind):
                self.assertContains(response, reverse('staff:content_list', args=[kind]))


class PanelVisibilityTests(TestCase):
    """Both panels are reachable from the website itself, not only by URL."""

    @classmethod
    def setUpTestData(cls):
        from saas.models import Tenant
        tenant = Tenant.objects.create(name='Visible Test', is_default=True)
        SiteSettings.objects.create(tenant=tenant, organization_name='Visible Test')

    def test_the_home_page_links_to_both_panels(self):
        response = self.client.get(reverse('club:home'))
        self.assertContains(response, '/adminpanel/login/')
        self.assertContains(response, '/superadminpanel/login/')
        self.assertContains(response, 'Admin Panel')
        self.assertContains(response, 'Super Admin')

    def test_every_public_page_carries_the_links(self):
        for name in ['about', 'events', 'gallery', 'news', 'membership', 'contact']:
            with self.subTest(page=name):
                response = self.client.get(reverse(f'club:{name}'))
                self.assertContains(response, '/adminpanel/login/')
                self.assertContains(response, '/superadminpanel/login/')


class RemovalTests(TestCase):
    """Everything that can be added can also be taken away."""

    @classmethod
    def setUpTestData(cls):
        from saas.models import Tenant
        cls.tenant = Tenant.objects.create(name='Removal Test', is_default=True)
        SiteSettings.objects.create(tenant=cls.tenant, organization_name='Removal Test')
        cls.boss = make_staff('removal_boss', StaffProfile.ROLE_SUPER_ADMIN,
                              password=NEW_PASSWORD, must_change=False)
        cls.boss.tenant = cls.tenant
        cls.boss.save()

    def setUp(self):
        self.client.force_login(self.boss.user)

    def test_every_content_type_offers_a_delete_screen(self):
        from django.urls import reverse as url_for
        from staff import content
        for kind, entry in content.REGISTRY.items():
            with self.subTest(kind=kind):
                self.assertTrue(url_for('staff:content_delete', args=[kind, 1]))

    def test_an_administrator_can_be_deleted(self):
        other = make_staff('leaver', StaffProfile.ROLE_ADMIN,
                           password=NEW_PASSWORD, must_change=False)
        other.tenant = self.tenant
        other.save()
        response = self.client.post(reverse('staff:administrator_delete', args=[other.pk]))
        self.assertRedirects(response, reverse('staff:administrators'))
        self.assertFalse(StaffProfile.objects.filter(pk=other.pk).exists())
        self.assertFalse(User.objects.filter(username='leaver').exists())

    def test_you_cannot_delete_the_account_you_are_using(self):
        self.client.post(reverse('staff:administrator_delete', args=[self.boss.pk]))
        self.assertTrue(StaffProfile.objects.filter(pk=self.boss.pk).exists())

    def test_deleting_an_administrator_is_recorded(self):
        other = make_staff('audited_leaver', StaffProfile.ROLE_ADMIN,
                           password=NEW_PASSWORD, must_change=False)
        other.tenant = self.tenant
        other.save()
        self.client.post(reverse('staff:administrator_delete', args=[other.pk]))
        self.assertTrue(AuditLog.objects.filter(target='audited_leaver').exists())

    def test_another_websites_administrator_cannot_be_deleted(self):
        from saas.models import Tenant
        other_site = Tenant.objects.create(name='Someone Else')
        theirs = make_staff('their_admin', StaffProfile.ROLE_ADMIN,
                            password=NEW_PASSWORD, must_change=False)
        theirs.tenant = other_site
        theirs.save()
        self.assertEqual(
            self.client.get(reverse('staff:administrator_delete', args=[theirs.pk])).status_code, 404)
        self.assertTrue(StaffProfile.objects.filter(pk=theirs.pk).exists())

    def test_a_registration_can_be_removed_but_not_created(self):
        from club.models import Event, EventRegistration
        from django.utils import timezone
        from datetime import timedelta
        event = Event.objects.create(tenant=self.tenant, title='Camp', description='x',
                                     start=timezone.now() + timedelta(days=3), venue='Hall')
        registration = EventRegistration.objects.create(
            event=event, full_name='Someone', email='someone@example.com')
        # creating is refused: these arrive from the website
        self.assertRedirects(self.client.get(reverse('staff:content_create', args=['registrations'])),
                             reverse('staff:content_list', args=['registrations']))
        self.client.post(reverse('staff:content_delete', args=['registrations', registration.pk]))
        self.assertFalse(EventRegistration.objects.filter(pk=registration.pk).exists())

    def test_registrations_of_another_website_are_out_of_reach(self):
        from club.models import Event, EventRegistration
        from saas.models import Tenant
        from django.utils import timezone
        from datetime import timedelta
        other_site = Tenant.objects.create(name='Other Site')
        event = Event.objects.create(tenant=other_site, title='Their camp', description='x',
                                     start=timezone.now() + timedelta(days=3), venue='Hall')
        theirs = EventRegistration.objects.create(
            event=event, full_name='Their person', email='them@example.com')
        self.assertEqual(self.client.get(
            reverse('staff:content_delete', args=['registrations', theirs.pk])).status_code, 404)


class SessionCheckTests(TestCase):
    """The endpoint the Java gateway calls before proxying the dashboard."""

    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.admin = make_staff('gateway_admin', StaffProfile.ROLE_ADMIN,
                               password=NEW_PASSWORD, must_change=False)
        cls.disabled = make_staff('retired_admin', StaffProfile.ROLE_ADMIN,
                                  password=NEW_PASSWORD, must_change=False, enabled=False)

    def test_anonymous_caller_is_not_authenticated(self):
        response = self.client.get(reverse('staff:session_check'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'authenticated': False})

    def test_signed_in_admin_is_authenticated(self):
        self.client.force_login(self.admin.user)
        payload = self.client.get(reverse('staff:session_check')).json()
        self.assertTrue(payload['authenticated'])
        self.assertEqual(payload['role'], StaffProfile.ROLE_ADMIN)
        self.assertFalse(payload['elevated'])

    def test_disabled_account_is_refused(self):
        """Disabling the profile must close the dashboard too, not only the panel."""
        self.client.force_login(self.disabled.user)
        payload = self.client.get(reverse('staff:session_check')).json()
        self.assertEqual(payload, {'authenticated': False})

    def test_no_identifying_details_leak_to_the_gateway(self):
        self.client.force_login(self.admin.user)
        payload = self.client.get(reverse('staff:session_check')).json()
        self.assertEqual(set(payload), {'authenticated', 'role', 'elevated',
                                        'must_change_password'})
        self.assertNotIn('gateway_admin', response_text(payload))


def response_text(payload):
    return ' '.join(str(value) for value in payload.values())
