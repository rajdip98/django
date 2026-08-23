from django.contrib import admin

from .models import AuditLog, PanelSecret, StaffProfile


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'designation', 'is_enabled', 'must_change_password',
                    'password_changed_at')
    list_filter = ('role', 'is_enabled', 'must_change_password')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'user__email')
    readonly_fields = ('created_at', 'last_login_ip', 'password_changed_at')

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        obj.apply_role_permissions()


@admin.register(PanelSecret)
class PanelSecretAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'is_enabled', 'updated_by', 'updated_at')
    readonly_fields = ('secret_hash', 'updated_at')

    def has_add_permission(self, request):
        return not PanelSecret.objects.exists()


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor_label', 'action', 'target', 'was_elevated',
                    'ip_address')
    list_filter = ('action', 'was_elevated', 'created_at')
    search_fields = ('actor_label', 'target', 'detail')
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
