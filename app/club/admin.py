from django.contrib import admin

from .models import (Achievement, Activity, Announcement, Article, Category,
                     Certificate, ContactMessage, CoreValue, Event,
                     EventRegistration, GalleryItem, Interest, MemberProfile,
                     MembershipApplication, MembershipBenefit, Milestone,
                     Resource, SiteSettings, Statistic, TeamMember, Testimonial)

admin.site.site_header = 'Club Website — Content Management'
admin.site.site_title = 'Club Website Admin'
admin.site.index_title = 'Manage website content'


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Identity', {'fields': ('organization_name', 'short_name', 'parent_authority',
                                 'registration_line', 'slogan', 'established',
                                 'emblem', 'logo', 'primary_color')}),
        ('About content', {'fields': ('introduction', 'history', 'mission', 'vision',
                                      'objectives')}),
        ('Contact', {'fields': ('address', 'phone', 'alt_phone', 'email', 'office_hours',
                                'map_embed_url', 'latitude', 'longitude')}),
        ('Social media', {'fields': ('facebook', 'instagram', 'youtube', 'linkedin')}),
        ('Legal & footer', {'fields': ('privacy_policy', 'terms_of_use',
                                       'content_managed_by', 'visitor_count')}),
    )

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'section', 'slug', 'order')
    list_filter = ('section',)
    list_editable = ('order',)
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ('name',)


class EventRegistrationInline(admin.TabularInline):
    model = EventRegistration
    extra = 0
    fields = ('full_name', 'email', 'phone', 'attended', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'start', 'venue', 'registration_open',
                    'is_featured', 'registration_count')
    list_filter = ('category', 'registration_open', 'is_featured', 'start')
    search_fields = ('title', 'description', 'venue')
    date_hierarchy = 'start'
    prepopulated_fields = {'slug': ('title',)}
    inlines = [EventRegistrationInline]

    @admin.display(description='Registrations')
    def registration_count(self, obj):
        return obj.registrations.count()


@admin.register(EventRegistration)
class EventRegistrationAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'event', 'email', 'phone', 'attended', 'created_at')
    list_filter = ('attended', 'event')
    search_fields = ('full_name', 'email', 'phone')
    list_editable = ('attended',)


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'frequency', 'order')
    list_filter = ('category',)
    list_editable = ('order',)
    prepopulated_fields = {'slug': ('title',)}
    search_fields = ('title', 'description')


@admin.register(GalleryItem)
class GalleryItemAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'media_type', 'taken_on')
    list_filter = ('media_type', 'category')
    search_fields = ('title', 'caption')
    date_hierarchy = 'taken_on'


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ('name', 'position', 'category', 'tenure', 'order')
    list_filter = ('category',)
    list_editable = ('order',)
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ('name', 'position', 'bio')


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'author', 'published_at', 'is_featured',
                    'is_published')
    list_filter = ('category', 'is_featured', 'is_published', 'published_at')
    list_editable = ('is_featured', 'is_published')
    search_fields = ('title', 'body', 'excerpt')
    date_hierarchy = 'published_at'
    prepopulated_fields = {'slug': ('title',)}


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'kind', 'published_at', 'is_active', 'is_new')
    list_filter = ('kind', 'is_active', 'is_new')
    list_editable = ('is_active', 'is_new')
    search_fields = ('title', 'body')


@admin.register(MembershipApplication)
class MembershipApplicationAdmin(admin.ModelAdmin):
    list_display = ('reference_no', 'full_name', 'email', 'phone', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('full_name', 'email', 'phone', 'reference_no')
    readonly_fields = ('reference_no', 'created_at', 'updated_at')
    filter_horizontal = ('interests',)
    actions = ['approve_applications', 'reject_applications']

    @admin.action(description='Approve selected applications')
    def approve_applications(self, request, queryset):
        updated = queryset.update(status='approved')
        self.message_user(request, f'{updated} application(s) approved.')

    @admin.action(description='Reject selected applications')
    def reject_applications(self, request, queryset):
        updated = queryset.update(status='rejected')
        self.message_user(request, f'{updated} application(s) rejected.')


class CertificateInline(admin.TabularInline):
    model = Certificate
    extra = 0


@admin.register(MemberProfile)
class MemberProfileAdmin(admin.ModelAdmin):
    list_display = ('membership_id', 'display_name', 'status', 'department', 'joined_on')
    list_filter = ('status', 'joined_on')
    search_fields = ('membership_id', 'user__username', 'user__first_name',
                     'user__last_name', 'user__email')
    filter_horizontal = ('interests',)
    inlines = [CertificateInline]


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display = ('title', 'member', 'issued_on', 'reference_no')
    list_filter = ('issued_on',)
    search_fields = ('title', 'member__membership_id')


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'file_label', 'published_on', 'downloads',
                    'is_published')
    list_filter = ('category', 'is_published')
    list_editable = ('is_published',)
    search_fields = ('title', 'description')
    prepopulated_fields = {'slug': ('title',)}
    readonly_fields = ('downloads',)


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ('subject', 'name', 'email', 'created_at', 'is_handled')
    list_filter = ('is_handled', 'created_at')
    list_editable = ('is_handled',)
    search_fields = ('name', 'email', 'subject', 'message')
    readonly_fields = ('name', 'email', 'phone', 'subject', 'message', 'created_at')


@admin.register(Testimonial)
class TestimonialAdmin(admin.ModelAdmin):
    list_display = ('name', 'role', 'order')
    list_editable = ('order',)


@admin.register(Statistic)
class StatisticAdmin(admin.ModelAdmin):
    list_display = ('label', 'value', 'suffix', 'order')
    list_editable = ('value', 'suffix', 'order')


@admin.register(Milestone)
class MilestoneAdmin(admin.ModelAdmin):
    list_display = ('year', 'title', 'order')
    list_editable = ('order',)


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ('title', 'year', 'awarded_by', 'order')
    list_editable = ('order',)


@admin.register(CoreValue)
class CoreValueAdmin(admin.ModelAdmin):
    list_display = ('title', 'order')
    list_editable = ('order',)


@admin.register(MembershipBenefit)
class MembershipBenefitAdmin(admin.ModelAdmin):
    list_display = ('title', 'icon', 'order')
    list_editable = ('order',)


@admin.register(Interest)
class InterestAdmin(admin.ModelAdmin):
    list_display = ('name', 'order')
    list_editable = ('order',)
