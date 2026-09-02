from django.conf import settings as django_settings
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from club.models import Banner, SiteSettings
from staff.models import AuditLog, StaffProfile

from .models import PlatformProfile, PlatformSecret, Tenant

PANEL_PW = django_settings.PANEL_DEFAULT_PASSWORD          # rajdip10
PLATFORM_PW = django_settings.PLATFORM_DEFAULT_PASSWORD    # rajdip@100
NEW_PW = 'Krishnanagar!Portal26'


def make_site_admin(username, tenant, role=StaffProfile.ROLE_SUPER_ADMIN,
                    password=NEW_PW, must_change=False):
    user = User.objects.create_user(username=username, password=password,
                                    email=f'{username}@example.com')
    profile = StaffProfile.objects.create(user=user, tenant=tenant, role=role,
                                          must_change_password=must_change)
    profile.apply_role_permissions()
    return profile


def make_owner(username='owner', password=PLATFORM_PW, must_change=True):
    user = User.objects.create_user(username=username, password=password,
                                    email=f'{username}@example.com')
    profile = PlatformProfile.objects.create(user=user, must_change_password=must_change)
    profile.apply_permissions()
    return profile


class SeparationTests(TestCase):
    """A website admin is not a platform owner, and vice versa."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Ward 12 Committee', is_default=True)
        SiteSettings.objects.create(tenant=cls.tenant, organization_name='Ward 12 Committee')
        cls.admin = make_site_admin('ward_admin', cls.tenant)
        PlatformSecret.load()

    def test_site_admin_cannot_open_the_platform_panel(self):
        self.client.force_login(self.admin.user)
        for name in ['dashboard', 'tenants', 'administrators', 'security', 'audit_log']:
            with self.subTest(page=name):
                response = self.client.get(reverse(f'saas:{name}'))
                self.assertRedirects(response, reverse('saas:unlock'))

    def test_site_admin_cannot_sign_in_at_the_platform_login(self):
        response = self.client.post(reverse('saas:login'),
                                    {'username': 'ward_admin', 'password': NEW_PW}, follow=True)
        self.assertContains(response, 'not a platform account')
        self.assertRedirects(self.client.get(reverse('saas:dashboard')), reverse('saas:login'))

    def test_the_platform_passphrase_opens_the_panel_for_a_site_admin(self):
        self.client.force_login(self.admin.user)
        response = self.client.post(reverse('saas:unlock'), {'passphrase': PLATFORM_PW})
        self.assertRedirects(response, reverse('saas:dashboard'))
        self.assertEqual(self.client.get(reverse('saas:tenants')).status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.ELEVATION_GRANTED).exists())

    def test_a_wrong_passphrase_is_refused_and_recorded(self):
        self.client.force_login(self.admin.user)
        self.client.post(reverse('saas:unlock'), {'passphrase': 'not-the-passphrase'})
        self.assertRedirects(self.client.get(reverse('saas:tenants')), reverse('saas:unlock'))
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.ELEVATION_DENIED).exists())

    def test_the_site_admin_password_does_not_unlock_the_platform(self):
        self.client.force_login(self.admin.user)
        self.client.post(reverse('saas:unlock'), {'passphrase': PANEL_PW})
        self.assertRedirects(self.client.get(reverse('saas:tenants')), reverse('saas:unlock'))

    def test_ending_the_unlock_closes_the_platform_panel(self):
        self.client.force_login(self.admin.user)
        self.client.post(reverse('saas:unlock'), {'passphrase': PLATFORM_PW})
        self.client.get(reverse('saas:end_unlock'))
        self.assertRedirects(self.client.get(reverse('saas:tenants')), reverse('saas:unlock'))

    def test_a_disabled_passphrase_refuses_everyone_but_owners(self):
        secret = PlatformSecret.load()
        secret.is_enabled = False
        secret.save()
        self.client.force_login(self.admin.user)
        self.client.post(reverse('saas:unlock'), {'passphrase': PLATFORM_PW})
        self.assertRedirects(self.client.get(reverse('saas:tenants')), reverse('saas:unlock'))

    def test_platform_owner_is_not_given_a_website_panel_session(self):
        owner = make_owner(must_change=False)
        self.client.force_login(owner.user)
        self.assertRedirects(self.client.get(reverse('staff:dashboard')), reverse('staff:login'))

    def test_the_passphrase_is_not_stored_in_clear(self):
        secret = PlatformSecret.load()
        self.assertNotIn(PLATFORM_PW, secret.secret_hash)
        self.assertTrue(secret.verify(PLATFORM_PW))


class PlatformOwnerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='First Website', is_default=True)
        SiteSettings.objects.create(tenant=cls.tenant, organization_name='First Website')
        PlatformSecret.load()

    def test_default_platform_password_forces_a_change(self):
        make_owner()
        response = self.client.post(reverse('saas:login'),
                                    {'username': 'owner', 'password': PLATFORM_PW})
        self.assertRedirects(response, reverse('saas:change_password'))
        self.assertRedirects(self.client.get(reverse('saas:tenants')),
                             reverse('saas:change_password'))

    def test_the_platform_password_cannot_be_kept(self):
        owner = make_owner()
        self.client.force_login(owner.user)
        response = self.client.post(reverse('saas:change_password'),
                                    {'new_password1': PLATFORM_PW, 'new_password2': PLATFORM_PW})
        self.assertContains(response, 'cannot keep the shared platform password')

    def test_owner_creates_a_website_and_its_administrator(self):
        owner = make_owner(must_change=False)
        self.client.force_login(owner.user)
        self.client.post(reverse('saas:tenant_create'), {
            'name': 'Second Website', 'slug': 'second-website', 'domain': 'second.example.org',
            'plan': 'standard', 'contact_email': 'second@example.org', 'is_active': 'on',
            'notes': ''})
        second = Tenant.objects.get(slug='second-website')
        self.assertTrue(SiteSettings.objects.filter(tenant=second).exists())

        self.client.post(reverse('saas:administrator_create'), {
            'tenant': second.pk, 'username': 'second_admin', 'first_name': 'Second',
            'last_name': 'Admin', 'email': 'admin@second.example.org',
            'role': StaffProfile.ROLE_SUPER_ADMIN, 'designation': '', 'phone': ''})
        created = StaffProfile.objects.get(user__username='second_admin')
        self.assertEqual(created.tenant, second)
        self.assertTrue(created.must_change_password)
        self.assertTrue(created.user.check_password(PANEL_PW))

    def test_owner_can_suspend_a_website_and_an_administrator(self):
        owner = make_owner(must_change=False)
        admin = make_site_admin('someone', self.tenant)
        self.client.force_login(owner.user)
        self.client.post(reverse('saas:tenant_toggle', args=[self.tenant.pk]))
        self.tenant.refresh_from_db()
        self.assertFalse(self.tenant.is_active)
        self.client.post(reverse('saas:administrator_toggle', args=[admin.pk]))
        admin.refresh_from_db()
        self.assertFalse(admin.is_enabled)

    def test_owner_resets_a_site_admin_to_the_default_password(self):
        owner = make_owner(must_change=False)
        admin = make_site_admin('resetme', self.tenant)
        self.client.force_login(owner.user)
        self.client.post(reverse('saas:administrator_reset', args=[admin.pk]))
        admin.refresh_from_db()
        self.assertTrue(admin.must_change_password)
        self.assertTrue(admin.user.check_password(PANEL_PW))

    def test_rotating_the_passphrase_changes_what_is_accepted(self):
        owner = make_owner(must_change=False)
        self.client.force_login(owner.user)
        self.client.post(reverse('saas:security'),
                         {'new_secret': 'a-longer-platform-secret', 'confirm_secret': 'a-longer-platform-secret'})
        secret = PlatformSecret.load()
        self.assertFalse(secret.verify(PLATFORM_PW))
        self.assertTrue(secret.verify('a-longer-platform-secret'))


class TenantIsolationTests(TestCase):
    """Two websites on one installation never see each other's content."""

    @classmethod
    def setUpTestData(cls):
        cls.first = Tenant.objects.create(name='First Club', is_default=True,
                                          domain='first.example.org')
        cls.second = Tenant.objects.create(name='Second Club', domain='second.example.org')
        SiteSettings.objects.create(tenant=cls.first, organization_name='First Club')
        SiteSettings.objects.create(tenant=cls.second, organization_name='Second Club')
        Banner.objects.create(tenant=cls.first, title='Banner of the first club',
                              placement='home_strip')
        Banner.objects.create(tenant=cls.second, title='Banner of the second club',
                              placement='home_strip')
        cls.first_admin = make_site_admin('first_admin', cls.first)
        cls.second_admin = make_site_admin('second_admin', cls.second)

    def test_each_domain_serves_its_own_website(self):
        first = self.client.get('/', HTTP_HOST='first.example.org')
        self.assertContains(first, 'First Club')
        self.assertNotContains(first, 'Second Club')
        second = self.client.get('/', HTTP_HOST='second.example.org')
        self.assertContains(second, 'Second Club')
        self.assertNotContains(second, 'First Club')

    def test_an_unknown_host_gets_the_default_website(self):
        response = self.client.get('/', HTTP_HOST='unknown.example.org')
        self.assertContains(response, 'First Club')

    def test_the_panel_lists_only_its_own_websites_banners(self):
        self.client.force_login(self.first_admin.user)
        response = self.client.get(reverse('staff:banners'))
        self.assertContains(response, 'Banner of the first club')
        self.assertNotContains(response, 'Banner of the second club')

    def test_an_admin_cannot_open_another_websites_banner(self):
        other = Banner.objects.get(tenant=self.second)
        self.client.force_login(self.first_admin.user)
        self.assertEqual(self.client.get(reverse('staff:banner_edit', args=[other.pk])).status_code, 404)

    def test_a_banner_created_in_the_panel_belongs_to_that_website(self):
        self.client.force_login(self.second_admin.user)
        self.client.post(reverse('staff:banner_create'), {
            'title': 'Fresh banner', 'subtitle': '', 'placement': 'home_strip',
            'link_url': '', 'link_text': 'Read more', 'order': 0, 'is_active': 'on'})
        self.assertEqual(Banner.objects.get(title='Fresh banner').tenant, self.second)

    def test_an_admin_only_sees_administrators_of_their_own_website(self):
        self.client.force_login(self.first_admin.user)
        response = self.client.get(reverse('staff:administrators'))
        self.assertContains(response, 'first_admin')
        self.assertNotContains(response, 'second_admin')


class PanelAddressTests(TestCase):
    """The two panels answer at the addresses printed on letterheads."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Address Test', is_default=True)
        SiteSettings.objects.create(tenant=cls.tenant, organization_name='Address Test')
        PlatformSecret.load()

    def test_the_panels_are_where_people_are_told_they_are(self):
        for address in ['/adminpanel/login/', '/superadminpanel/login/']:
            with self.subTest(address=address):
                self.assertEqual(self.client.get(address).status_code, 200)

    def test_typing_the_address_without_a_trailing_slash_still_works(self):
        for address in ['/adminpanel/login', '/superadminpanel/login']:
            with self.subTest(address=address):
                response = self.client.get(address)
                self.assertEqual(response.status_code, 301)
                self.assertTrue(response.url.endswith('/login/'))

    def test_the_old_addresses_redirect_rather_than_404(self):
        pairs = [
            ('/panel/login/', '/adminpanel/login/'),
            ('/platform/login/', '/superadminpanel/login/'),
            ('/admin-panel/', '/adminpanel/login/'),
            ('/adminlogin/', '/adminpanel/login/'),
            ('/superadmin/', '/superadminpanel/login/'),
            ('/super-admin-panel/', '/superadminpanel/login/'),
        ]
        for old, new in pairs:
            with self.subTest(old=old):
                response = self.client.get(old)
                self.assertIn(response.status_code, (301, 302))
                self.assertEqual(response.url, new)

    def test_the_website_links_to_both_panels(self):
        response = self.client.get('/')
        self.assertContains(response, '/adminpanel/login/')
        self.assertContains(response, '/superadminpanel/login/')
        self.assertContains(response, 'Admin Panel')
        self.assertContains(response, 'Super Admin')


class PlatformRemovalTests(TestCase):
    """The platform owner can remove an account, or a whole website."""

    @classmethod
    def setUpTestData(cls):
        cls.first = Tenant.objects.create(name='Keep This Site', is_default=True)
        cls.second = Tenant.objects.create(name='Remove This Site')
        SiteSettings.objects.create(tenant=cls.first, organization_name='Keep This Site')
        SiteSettings.objects.create(tenant=cls.second, organization_name='Remove This Site')
        PlatformSecret.load()

    def setUp(self):
        self.owner = make_owner(must_change=False)
        self.client.force_login(self.owner.user)

    def test_the_confirmation_page_says_what_will_be_destroyed(self):
        response = self.client.get(reverse('saas:tenant_delete', args=[self.second.pk]))
        self.assertContains(response, 'Remove This Site')
        self.assertContains(response, 'Administrator accounts')
        self.assertContains(response, 'take it offline')

    def test_a_website_is_deleted_only_when_the_name_is_typed(self):
        wrong = self.client.post(reverse('saas:tenant_delete', args=[self.second.pk]),
                                 {'confirm_name': 'not the name'})
        self.assertRedirects(wrong, reverse('saas:tenant_delete', args=[self.second.pk]))
        self.assertTrue(Tenant.objects.filter(pk=self.second.pk).exists())

        right = self.client.post(reverse('saas:tenant_delete', args=[self.second.pk]),
                                 {'confirm_name': 'Remove This Site'})
        self.assertRedirects(right, reverse('saas:tenants'))
        self.assertFalse(Tenant.objects.filter(pk=self.second.pk).exists())

    def test_deleting_a_website_takes_its_content_with_it(self):
        from club.models import Announcement
        Announcement.objects.create(tenant=self.second, title='Theirs', kind='notice')
        self.client.post(reverse('saas:tenant_delete', args=[self.second.pk]),
                         {'confirm_name': 'Remove This Site'})
        self.assertFalse(Announcement.objects.filter(title='Theirs').exists())
        self.assertTrue(Tenant.objects.filter(pk=self.first.pk).exists())

    def test_deleting_a_website_is_recorded(self):
        self.client.post(reverse('saas:tenant_delete', args=[self.second.pk]),
                         {'confirm_name': 'Remove This Site'})
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.CONTENT_DELETED,
                                                target__contains='Remove This Site').exists())

    def test_an_administrator_of_any_website_can_be_deleted(self):
        admin = make_site_admin('platform_removed', self.first)
        response = self.client.post(reverse('saas:administrator_delete', args=[admin.pk]))
        self.assertRedirects(response, reverse('saas:administrators'))
        self.assertFalse(StaffProfile.objects.filter(pk=admin.pk).exists())

    def test_the_owner_cannot_delete_their_own_account(self):
        admin = StaffProfile.objects.create(user=self.owner.user, tenant=self.first)
        self.client.post(reverse('saas:administrator_delete', args=[admin.pk]))
        self.assertTrue(StaffProfile.objects.filter(pk=admin.pk).exists())
