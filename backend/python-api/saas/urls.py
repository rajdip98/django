from django.urls import path

from . import views

app_name = 'saas'

urlpatterns = [
    path('login/', views.platform_login, name='login'),
    path('logout/', views.platform_logout, name='logout'),
    path('unlock/', views.unlock, name='unlock'),
    path('unlock/end/', views.end_unlock, name='end_unlock'),
    path('password/', views.change_password, name='change_password'),

    path('', views.dashboard, name='dashboard'),
    path('websites/', views.tenants, name='tenants'),
    path('websites/new/', views.tenant_edit, name='tenant_create'),
    path('websites/<int:pk>/', views.tenant_edit, name='tenant_edit'),
    path('websites/<int:pk>/toggle/', views.tenant_toggle, name='tenant_toggle'),
    path('websites/<int:pk>/delete/', views.tenant_delete, name='tenant_delete'),

    path('administrators/', views.administrators, name='administrators'),
    path('administrators/new/', views.administrator_edit, name='administrator_create'),
    path('administrators/<int:pk>/', views.administrator_edit, name='administrator_edit'),
    path('administrators/<int:pk>/toggle/', views.administrator_toggle,
         name='administrator_toggle'),
    path('administrators/<int:pk>/reset-password/', views.administrator_reset,
         name='administrator_reset'),
    path('administrators/<int:pk>/delete/', views.administrator_delete,
         name='administrator_delete'),

    path('security/', views.security, name='security'),
    path('audit-log/', views.audit_log, name='audit_log'),
]
