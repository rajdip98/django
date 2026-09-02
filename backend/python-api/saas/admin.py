from django.contrib import admin

from .models import PlatformProfile, PlatformSecret, Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'domain', 'plan', 'is_active', 'is_default', 'created_at')
    list_filter = ('is_active', 'plan')
    search_fields = ('name', 'domain', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(PlatformProfile)
class PlatformProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'is_enabled', 'must_change_password', 'password_changed_at')
    list_filter = ('is_enabled', 'must_change_password')

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        obj.apply_permissions()


@admin.register(PlatformSecret)
class PlatformSecretAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'is_enabled', 'updated_by', 'updated_at')
    readonly_fields = ('secret_hash', 'updated_at')

    def has_add_permission(self, request):
        return not PlatformSecret.objects.exists()
