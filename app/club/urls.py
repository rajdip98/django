from django.contrib.auth import views as auth_views
from django.urls import path

from . import views
from .forms import GovAuthenticationForm

app_name = 'club'

urlpatterns = [
    path('', views.home, name='home'),
    path('about/', views.about, name='about'),
    path('activities/', views.activities, name='activities'),

    path('events/', views.event_list, name='events'),
    path('events/<slug:slug>/', views.event_detail, name='event_detail'),
    path('events/<slug:slug>/register/', views.event_register, name='event_register'),
    path('calendar/', views.event_calendar, name='calendar'),

    path('gallery/', views.gallery, name='gallery'),
    path('team/', views.team, name='team'),

    path('news/', views.news_list, name='news'),
    path('news/<slug:slug>/', views.news_detail, name='news_detail'),

    path('membership/', views.membership, name='membership'),
    path('membership/acknowledgement/', views.membership_success, name='membership_success'),

    path('resources/', views.resources, name='resources'),
    path('resources/<slug:slug>/download/', views.resource_download, name='resource_download'),

    path('contact/', views.contact, name='contact'),
    path('search/', views.search, name='search'),
    path('notifications/', views.notifications, name='notifications'),
    path('privacy/', views.static_page, {'kind': 'privacy'}, name='privacy'),
    path('terms/', views.static_page, {'kind': 'terms'}, name='terms'),

    # Accounts
    path('register/', views.signup, name='signup'),
    path('login/', auth_views.LoginView.as_view(
        template_name='club/login.html',
        authentication_form=GovAuthenticationForm,
        redirect_authenticated_user=True), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='club:home'), name='logout'),
    path('password-reset/', auth_views.PasswordResetView.as_view(
        template_name='club/password_reset.html',
        email_template_name='club/password_reset_email.txt',
        success_url='/password-reset/sent/'), name='password_reset'),
    path('password-reset/sent/', auth_views.PasswordResetDoneView.as_view(
        template_name='club/password_reset_done.html'), name='password_reset_done'),
    path('password-reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='club/password_reset_confirm.html',
        success_url='/password-reset/complete/'), name='password_reset_confirm'),
    path('password-reset/complete/', auth_views.PasswordResetCompleteView.as_view(
        template_name='club/password_reset_complete.html'), name='password_reset_complete'),

    # Member portal
    path('dashboard/', views.dashboard, name='dashboard'),
    path('profile/', views.profile, name='profile'),
    path('dashboard/events/', views.my_events, name='my_events'),
    path('dashboard/certificates/', views.my_certificates, name='my_certificates'),
]
