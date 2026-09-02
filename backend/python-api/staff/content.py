"""Every kind of content an administrator can add, edit and remove.

One registry drives the panel: the sidebar, the list pages, the forms and the
delete screens all read from it. Adding a new content type here gives it a full
set of screens with no new views or templates.
"""
from django import forms
from django.forms import modelform_factory

from club.models import (Achievement, Activity, Announcement, Article, Category,
                         Certificate, ContactMessage, CoreValue, Event,
                         EventRegistration, GalleryItem, Interest, MemberProfile,
                         MembershipApplication, MembershipBenefit, Milestone,
                         Statistic, TeamMember, Testimonial)
from club.forms import StyledFormMixin


class TenantModelForm(StyledFormMixin, forms.ModelForm):
    """A form that only offers this website's own categories and related rows."""

    def __init__(self, *args, tenant=None, **kwargs):
        self.tenant = tenant
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            queryset = getattr(field, 'queryset', None)
            if queryset is not None and hasattr(queryset.model, 'tenant'):
                field.queryset = queryset.filter(tenant=tenant)


def build_form(model, fields, widgets=None):
    return modelform_factory(model, form=TenantModelForm, fields=fields,
                             widgets=widgets or {})


DATE = forms.DateInput(attrs={'type': 'date'})
DATETIME = forms.DateTimeInput(attrs={'type': 'datetime-local'}, format='%Y-%m-%dT%H:%M')
AREA = forms.Textarea(attrs={'rows': 4})


# Each entry: the model, the fields an administrator edits, and the columns shown
# in the list. A column is (heading, attribute or method name).
REGISTRY = {
    'events': {
        'label': 'Event', 'plural': 'Events', 'icon': '🎟',
        'model': Event, 'order': ['-start'],
        'fields': ['title', 'slug', 'category', 'summary', 'description', 'start', 'end',
                   'venue', 'organizer', 'image', 'capacity', 'registration_open',
                   'registration_deadline', 'is_featured'],
        'widgets': {'start': DATETIME, 'end': DATETIME, 'registration_deadline': DATE,
                    'summary': AREA, 'description': forms.Textarea(attrs={'rows': 6})},
        'columns': [('Title', 'title'), ('Category', 'category'), ('Starts', 'start'),
                    ('Venue', 'venue')],
        'help': 'Programmes, camps and meetings. Deleting an event also removes its '
                'registrations.',
    },
    'news': {
        'label': 'Notice', 'plural': 'Notices & news', 'icon': '📰',
        'model': Article, 'order': ['-published_at'],
        'fields': ['title', 'slug', 'category', 'author', 'excerpt', 'body', 'image',
                   'published_at', 'is_featured', 'is_published'],
        'widgets': {'published_at': DATETIME, 'excerpt': AREA,
                    'body': forms.Textarea(attrs={'rows': 10})},
        'columns': [('Title', 'title'), ('Category', 'category'),
                    ('Published', 'published_at'), ('Live', 'is_published')],
        'help': 'Announcements, results and press notes.',
    },
    'announcements': {
        'label': 'Notice-board item', 'plural': 'Notice board', 'icon': '📢',
        'model': Announcement, 'order': ['-published_at'],
        'fields': ['title', 'kind', 'body', 'link', 'published_at', 'is_active', 'is_new'],
        'widgets': {'published_at': DATETIME, 'body': AREA},
        'columns': [('Title', 'title'), ('Kind', 'kind'), ('Published', 'published_at'),
                    ('Showing', 'is_active')],
        'help': 'The scrolling ticker and the notice board on the home page.',
    },
    'gallery': {
        'label': 'Gallery item', 'plural': 'Gallery', 'icon': '🖼',
        'model': GalleryItem, 'order': ['-taken_on'],
        'fields': ['title', 'category', 'media_type', 'image', 'video_url', 'caption',
                   'taken_on'],
        'widgets': {'taken_on': DATE, 'caption': AREA},
        'columns': [('Title', 'title'), ('Album', 'category'), ('Type', 'media_type'),
                    ('Taken', 'taken_on')],
        'help': 'Photographs and videos. Upload an image, or paste a video link.',
    },
    'team': {
        'label': 'Team member', 'plural': 'Team & committee', 'icon': '👤',
        'model': TeamMember, 'order': ['category__order', 'order'],
        'fields': ['name', 'slug', 'position', 'category', 'bio', 'photo', 'email',
                   'phone', 'facebook', 'linkedin', 'instagram', 'tenure', 'order'],
        'widgets': {'bio': AREA},
        'columns': [('Name', 'name'), ('Position', 'position'), ('Group', 'category'),
                    ('Order', 'order')],
        'help': 'Office bearers, committee members, advisors and volunteers.',
    },
    'activities': {
        'label': 'Activity', 'plural': 'Activities', 'icon': '◆',
        'model': Activity, 'order': ['order'],
        'fields': ['title', 'slug', 'category', 'summary', 'description', 'icon',
                   'image', 'frequency', 'order'],
        'widgets': {'summary': AREA, 'description': forms.Textarea(attrs={'rows': 6})},
        'columns': [('Title', 'title'), ('Group', 'category'), ('Frequency', 'frequency'),
                    ('Order', 'order')],
        'help': 'The standing programme of work shown under “What we do”.',
    },
    'statistics': {
        'label': 'Statistic', 'plural': 'Statistics', 'icon': '📊',
        'model': Statistic, 'order': ['order'],
        'fields': ['label', 'value', 'suffix', 'order'],
        'columns': [('Label', 'label'), ('Value', 'value'), ('Suffix', 'suffix'),
                    ('Order', 'order')],
        'help': 'The counters on the home page, e.g. “540+ registered members”.',
    },
    'testimonials': {
        'label': 'Testimonial', 'plural': 'Testimonials', 'icon': '❝',
        'model': Testimonial, 'order': ['order'],
        'fields': ['name', 'role', 'quote', 'photo', 'order'],
        'widgets': {'quote': AREA},
        'columns': [('Name', 'name'), ('Role', 'role'), ('Order', 'order')],
        'help': 'Short quotations from members, volunteers and residents.',
    },
    'milestones': {
        'label': 'Milestone', 'plural': 'Timeline', 'icon': '🕰',
        'model': Milestone, 'order': ['-year'],
        'fields': ['year', 'title', 'description', 'order'],
        'widgets': {'description': AREA},
        'columns': [('Year', 'year'), ('Title', 'title'), ('Order', 'order')],
        'help': 'The dated journey shown on the About page.',
    },
    'achievements': {
        'label': 'Achievement', 'plural': 'Achievements', 'icon': '🏅',
        'model': Achievement, 'order': ['order'],
        'fields': ['title', 'year', 'awarded_by', 'description', 'order'],
        'widgets': {'description': AREA},
        'columns': [('Title', 'title'), ('Year', 'year'), ('Awarded by', 'awarded_by')],
        'help': 'Awards and recognitions listed on the About page.',
    },
    'values': {
        'label': 'Core value', 'plural': 'Core values', 'icon': '⚖',
        'model': CoreValue, 'order': ['order'],
        'fields': ['title', 'description', 'order'],
        'widgets': {'description': AREA},
        'columns': [('Title', 'title'), ('Order', 'order')],
        'help': 'The principles listed on the About page.',
    },
    'benefits': {
        'label': 'Membership benefit', 'plural': 'Membership benefits', 'icon': '✔',
        'model': MembershipBenefit, 'order': ['order'],
        'fields': ['title', 'description', 'icon', 'order'],
        'widgets': {'description': AREA},
        'columns': [('Title', 'title'), ('Order', 'order')],
        'help': 'What a member receives, shown on the Membership page.',
    },
    'interests': {
        'label': 'Area of interest', 'plural': 'Areas of interest', 'icon': '☑',
        'model': Interest, 'order': ['order'], 'shared': True,
        'fields': ['name', 'order'],
        'columns': [('Name', 'name'), ('Order', 'order')],
        'help': 'The tick-boxes offered on the membership form.',
    },
    'categories': {
        'label': 'Category', 'plural': 'Categories', 'icon': '🏷',
        'model': Category, 'order': ['section', 'order'],
        'fields': ['name', 'slug', 'section', 'order'],
        'columns': [('Name', 'name'), ('Used for', 'section'), ('Order', 'order')],
        'help': 'Groups used by events, news, gallery, activities, downloads and the team.',
    },
    'applications': {
        'label': 'Membership application', 'plural': 'Membership applications',
        'icon': '📝', 'model': MembershipApplication, 'order': ['-created_at'],
        'fields': ['full_name', 'email', 'phone', 'date_of_birth', 'address',
                   'department', 'interests', 'reason', 'photo', 'status', 'remarks'],
        'widgets': {'date_of_birth': DATE, 'address': AREA, 'reason': AREA,
                    'remarks': AREA},
        'columns': [('Reference', 'reference_no'), ('Applicant', 'full_name'),
                    ('E-mail', 'email'), ('Status', 'status')],
        'help': 'Applications received through the website. Set the status once verified.',
    },
    'registrations': {
        'label': 'Event registration', 'plural': 'Event registrations', 'icon': '🎫',
        'model': EventRegistration, 'order': ['-created_at'],
        'tenant_field': 'event__tenant', 'no_create': True,
        'fields': ['event', 'full_name', 'email', 'phone', 'remarks', 'attended'],
        'widgets': {'remarks': AREA},
        'columns': [('Participant', 'full_name'), ('Event', 'event'), ('E-mail', 'email'),
                    ('Attended', 'attended')],
        'help': 'People who registered for a programme through the website. Mark '
                'attendance here, or remove a registration that was withdrawn.',
    },
    'members': {
        'label': 'Member', 'plural': 'Members', 'icon': '🧑',
        'model': MemberProfile, 'order': ['-joined_on'], 'shared': True,
        'no_create': True,
        'fields': ['status', 'phone', 'department', 'address', 'date_of_birth',
                   'photo', 'joined_on', 'interests'],
        'widgets': {'date_of_birth': DATE, 'joined_on': DATE, 'address': AREA},
        'columns': [('Membership ID', 'membership_id'), ('Name', 'display_name'),
                    ('Status', 'status'), ('Joined', 'joined_on')],
        'help': 'Member portal accounts. Removing one deletes the member record and '
                'their certificates; the sign-in account itself stays until it is '
                'removed from the Django console.',
    },
    'certificates': {
        'label': 'Certificate', 'plural': 'Certificates', 'icon': '🎖',
        'model': Certificate, 'order': ['-issued_on'], 'shared': True,
        'fields': ['member', 'title', 'issued_on', 'reference_no', 'file'],
        'widgets': {'issued_on': DATE},
        'columns': [('Title', 'title'), ('Member', 'member'), ('Issued', 'issued_on'),
                    ('Reference', 'reference_no')],
        'help': 'Certificates issued to members, shown in their portal.',
    },
    'enquiries': {
        'label': 'Enquiry', 'plural': 'Enquiries', 'icon': '✉',
        'model': ContactMessage, 'order': ['-created_at'],
        'fields': ['name', 'email', 'phone', 'subject', 'message', 'is_handled'],
        'widgets': {'message': forms.Textarea(attrs={'rows': 6})},
        'columns': [('Subject', 'subject'), ('From', 'name'), ('Received', 'created_at'),
                    ('Handled', 'is_handled')],
        'help': 'Messages sent from the contact form. Tick “handled” once answered.',
    },
}


def get(kind):
    """The registry entry for a URL slug, or None."""
    return REGISTRY.get(kind)


def form_for(kind, tenant, instance=None, data=None, files=None):
    entry = REGISTRY[kind]
    form_class = build_form(entry['model'], entry['fields'], entry.get('widgets'))
    return form_class(data=data, files=files, instance=instance, tenant=tenant)


def queryset_for(kind, tenant):
    """Rows of one kind, limited to the website the panel is administering.

    Most content carries its own tenant. A few tables reach it through a relation
    instead (`tenant_field`), and a couple belong to the installation rather than
    to one website (`shared`).
    """
    entry = REGISTRY[kind]
    rows = entry['model'].objects.all()
    if not entry.get('shared'):
        rows = rows.filter(**{entry.get('tenant_field', 'tenant'): tenant})
    return rows.order_by(*entry['order'])


def may_create(kind):
    """Some records are only ever created by a visitor, never by an administrator."""
    return not REGISTRY[kind].get('no_create')
