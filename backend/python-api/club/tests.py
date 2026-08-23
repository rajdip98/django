from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import (ContactMessage, Event, EventRegistration, Interest,
                     MemberProfile, MembershipApplication, SiteSettings)


class PublicPageTests(TestCase):
    """Every page in the navigation must render for an anonymous visitor."""

    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.event = Event.objects.create(
            title='Free Health Camp', description='General screening.',
            start=timezone.now() + timedelta(days=5), venue='Community Hall',
            capacity=50, registration_open=True)

    def test_navigation_pages_render(self):
        for name in ['home', 'about', 'activities', 'events', 'calendar', 'gallery',
                     'team', 'news', 'membership', 'resources', 'contact', 'search',
                     'notifications', 'login', 'signup', 'privacy', 'terms']:
            with self.subTest(page=name):
                response = self.client.get(reverse(f'club:{name}'))
                self.assertEqual(response.status_code, 200)

    def test_event_detail_and_search(self):
        self.assertEqual(self.client.get(self.event.get_absolute_url()).status_code, 200)
        response = self.client.get(reverse('club:search'), {'q': 'health'})
        self.assertContains(response, 'Free Health Camp')

    def test_member_pages_require_login(self):
        for name in ['dashboard', 'profile', 'my_events', 'my_certificates']:
            with self.subTest(page=name):
                response = self.client.get(reverse(f'club:{name}'))
                self.assertEqual(response.status_code, 302)
                self.assertIn(reverse('club:login'), response.url)


class FormSubmissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.interest = Interest.objects.create(name='Community Service')
        cls.event = Event.objects.create(
            title='Blood Donation Camp', description='Quarterly camp.',
            start=timezone.now() + timedelta(days=10), venue='Portico',
            capacity=2, registration_open=True)

    def test_membership_application_is_recorded_with_reference(self):
        response = self.client.post(reverse('club:membership'), {
            'full_name': 'Ananya Sengupta', 'email': 'Ananya@Example.com',
            'phone': '+91 98300 00000', 'date_of_birth': '2003-04-17',
            'address': 'Ward 12', 'department': 'B.A. Second Year',
            'interests': [self.interest.pk], 'reason': 'To volunteer at the library.',
            'declaration': 'on',
        }, follow=True)
        self.assertEqual(response.status_code, 200)
        application = MembershipApplication.objects.get()
        self.assertEqual(application.email, 'ananya@example.com')
        self.assertTrue(application.reference_no.startswith('APP/'))
        self.assertContains(response, application.reference_no)

    def test_duplicate_pending_application_is_rejected(self):
        payload = {
            'full_name': 'Ananya Sengupta', 'email': 'ananya@example.com',
            'phone': '+91 98300 00000', 'date_of_birth': '2003-04-17',
            'address': 'Ward 12', 'reason': 'To volunteer.', 'declaration': 'on',
        }
        self.client.post(reverse('club:membership'), payload)
        self.client.post(reverse('club:membership'), payload)
        self.assertEqual(MembershipApplication.objects.count(), 1)

    def test_event_registration_and_capacity(self):
        url = reverse('club:event_register', args=[self.event.slug])
        for index in range(2):
            self.client.post(url, {'full_name': f'Person {index}',
                                   'email': f'person{index}@example.com', 'phone': '123'})
        self.assertEqual(self.event.registrations.count(), 2)
        self.assertEqual(self.event.seats_left, 0)
        self.assertFalse(self.event.can_register)

        # A full event redirects away from the registration form.
        response = self.client.get(url)
        self.assertRedirects(response, self.event.get_absolute_url())

    def test_contact_message_is_saved(self):
        self.client.post(reverse('club:contact'), {
            'name': 'Rehana Khatun', 'email': 'rehana@example.com', 'phone': '',
            'subject': 'Library timings', 'message': 'Is the reading room open on Sunday?'})
        self.assertEqual(ContactMessage.objects.count(), 1)


class MemberPortalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.user = User.objects.create_user(
            username='member', password='member12345', email='member@example.com',
            first_name='Ananya', last_name='Sengupta')
        cls.profile = MemberProfile.objects.create(
            user=cls.user, status='active', joined_on=date(2024, 1, 10))
        cls.event = Event.objects.create(
            title='Sports Meet', description='Track events.',
            start=timezone.now() + timedelta(days=3), venue='Stadium')
        EventRegistration.objects.create(
            event=cls.event, user=cls.user, full_name='Ananya Sengupta',
            email='member@example.com')

    def test_membership_id_is_generated(self):
        self.assertTrue(self.profile.membership_id.endswith(f'{self.profile.pk:04d}'))

    def test_dashboard_lists_registrations(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('club:dashboard'))
        self.assertContains(response, self.profile.membership_id)
        self.assertContains(response, 'Sports Meet')

    def test_signup_creates_profile(self):
        response = self.client.post(reverse('club:signup'), {
            'username': 'newmember', 'first_name': 'Sourav', 'last_name': 'Biswas',
            'email': 'sourav@example.com', 'phone': '+91 90000 00000',
            'password1': 'Sunrise!2026', 'password2': 'Sunrise!2026'}, follow=True)
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(username='newmember')
        self.assertEqual(user.member_profile.status, 'pending')

    def test_profile_update(self):
        self.client.force_login(self.user)
        self.client.post(reverse('club:profile'), {
            'first_name': 'Ananya', 'last_name': 'Sengupta', 'email': 'new@example.com',
            'phone': '+91 98300 12345', 'department': 'B.A. Third Year',
            'address': 'Ward 12', 'date_of_birth': '2003-04-17'})
        self.profile.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(self.profile.phone, '+91 98300 12345')
        self.assertEqual(self.user.email, 'new@example.com')


class DuplicateRegistrationTests(TestCase):
    """A repeat registration must be refused politely, not crash the page."""

    @classmethod
    def setUpTestData(cls):
        SiteSettings.load()
        cls.event = Event.objects.create(
            title='Yoga Camp', description='Morning session.',
            start=timezone.now() + timedelta(days=4), venue='Terrace')

    def test_second_registration_with_the_same_email_is_rejected(self):
        url = reverse('club:event_register', args=[self.event.slug])
        payload = {'full_name': 'Ananya Sengupta', 'email': 'ananya@example.com', 'phone': '1'}
        self.client.post(url, payload)
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'already registered')
        self.assertEqual(self.event.registrations.count(), 1)

    def test_the_check_ignores_case(self):
        url = reverse('club:event_register', args=[self.event.slug])
        self.client.post(url, {'full_name': 'A', 'email': 'person@example.com', 'phone': ''})
        self.client.post(url, {'full_name': 'A', 'email': 'PERSON@example.com', 'phone': ''})
        self.assertEqual(self.event.registrations.count(), 1)
