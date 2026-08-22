from django.urls import path

from . import views

app_name = 'staff'

urlpatterns = [
    path('login/', views.panel_login, name='login'),
    path('logout/', views.panel_logout, name='logout'),
    path('password/', views.change_password, name='change_password'),
    path('elevate/', views.elevate, name='elevate'),
    path('elevate/end/', views.end_elevation, name='end_elevation'),

    path('', views.dashboard, name='dashboard'),

    # Website content — available to Admins and Super Admins.
    path('site/identity/', views.site_identity, name='identity'),
    path('site/header/', views.site_header, name='header'),
    path('site/footer/', views.site_footer, name='footer'),
    path('banners/', views.banners, name='banners'),
    path('banners/new/', views.banner_edit, name='banner_create'),
    path('banners/<int:pk>/', views.banner_edit, name='banner_edit'),
    path('banners/<int:pk>/delete/', views.banner_delete, name='banner_delete'),
    path('files/', views.files, name='files'),
    path('files/new/', views.file_edit, name='file_create'),
    path('files/<int:pk>/', views.file_edit, name='file_edit'),
    path('files/<int:pk>/delete/', views.file_delete, name='file_delete'),
    path('qr-codes/', views.qr_codes, name='qr_codes'),
    path('qr-codes/new/', views.qr_edit, name='qr_create'),
    path('qr-codes/<int:pk>/', views.qr_edit, name='qr_edit'),
    path('qr-codes/<int:pk>/delete/', views.qr_delete, name='qr_delete'),

    # Super Admin only.
    path('administrators/', views.administrators, name='administrators'),
    path('administrators/new/', views.administrator_edit, name='administrator_create'),
    path('administrators/<int:pk>/', views.administrator_edit, name='administrator_edit'),
    path('administrators/<int:pk>/toggle/', views.administrator_toggle,
         name='administrator_toggle'),
    path('administrators/<int:pk>/reset-password/', views.administrator_reset_password,
         name='administrator_reset'),
    path('security/', views.security, name='security'),
    path('audit-log/', views.audit_log, name='audit_log'),
]
