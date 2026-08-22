"""Data model for the club / organisation portal.

Everything a visitor sees on the public site is stored here and editable from
the Django admin, so the site is fully dynamic: no page hard-codes content.
"""
from datetime import date

from django.contrib.auth.models import User
from django.db import models
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SiteSettings(models.Model):
    """Singleton row holding organisation-wide identity and contact details."""

    organization_name = models.CharField(max_length=200, default='Sunrise Youth Club')
    short_name = models.CharField(max_length=40, default='SYC')
    parent_authority = models.CharField(
        max_length=200, blank=True,
        help_text='Department / ministry line shown in the top government strip.')
    registration_line = models.CharField(
        max_length=250, blank=True,
        help_text='Registration or affiliation statement shown under the emblem.')
    slogan = models.CharField(max_length=200, blank=True)
    introduction = models.TextField(blank=True)
    history = models.TextField(blank=True)
    mission = models.TextField(blank=True)
    vision = models.TextField(blank=True)
    objectives = models.TextField(blank=True, help_text='One objective per line.')
    established = models.PositiveIntegerField(default=2015)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=60, blank=True)
    alt_phone = models.CharField(max_length=60, blank=True)
    email = models.EmailField(blank=True)
    office_hours = models.CharField(max_length=200, blank=True)
    map_embed_url = models.URLField(blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    facebook = models.URLField(blank=True)
    instagram = models.URLField(blank=True)
    youtube = models.URLField(blank=True)
    linkedin = models.URLField(blank=True)
    primary_color = models.CharField(max_length=9, default='#123a6d')
    emblem = models.ImageField(upload_to='site/', blank=True)
    logo = models.ImageField(upload_to='site/', blank=True)
    privacy_policy = models.TextField(blank=True)
    terms_of_use = models.TextField(blank=True)
    visitor_count = models.PositiveIntegerField(default=0)
    content_managed_by = models.CharField(max_length=200, blank=True)

    class Meta:
        verbose_name = 'Site settings'
        verbose_name_plural = 'Site settings'

    def __str__(self):
        return self.organization_name

    @classmethod
    def load(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj

    @property
    def objective_list(self):
        return [line.strip() for line in self.objectives.splitlines() if line.strip()]

    @property
    def social_links(self):
        return [
            ('Facebook', self.facebook, 'facebook'),
            ('Instagram', self.instagram, 'instagram'),
            ('YouTube', self.youtube, 'youtube'),
            ('LinkedIn', self.linkedin, 'linkedin'),
        ]


class Statistic(models.Model):
    """Counter tiles on the home page (500+ Members, 50+ Events ...)."""

    label = models.CharField(max_length=80)
    value = models.PositiveIntegerField()
    suffix = models.CharField(max_length=8, blank=True, default='+')
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.value}{self.suffix} {self.label}'


class CoreValue(models.Model):
    title = models.CharField(max_length=80)
    description = models.TextField()
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


class Milestone(models.Model):
    """Entries on the About page timeline."""

    year = models.CharField(max_length=12)
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['-year', 'order']

    def __str__(self):
        return f'{self.year} — {self.title}'


class Achievement(models.Model):
    title = models.CharField(max_length=160)
    year = models.CharField(max_length=12, blank=True)
    awarded_by = models.CharField(max_length=160, blank=True)
    description = models.TextField(blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', '-year']

    def __str__(self):
        return self.title


class Testimonial(models.Model):
    name = models.CharField(max_length=120)
    role = models.CharField(max_length=120, blank=True)
    quote = models.TextField()
    photo = models.ImageField(upload_to='testimonials/', blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.name


class Announcement(TimeStamped):
    """Powers the scrolling "what's new" ticker and the notification bell."""

    KIND_CHOICES = [
        ('notice', 'Notice'),
        ('event', 'Event'),
        ('deadline', 'Deadline'),
        ('meeting', 'Meeting'),
        ('result', 'Result'),
    ]
    title = models.CharField(max_length=250)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='notice')
    body = models.TextField(blank=True)
    link = models.CharField(max_length=300, blank=True)
    published_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)
    is_new = models.BooleanField(default=True, help_text='Show the blinking NEW tag.')

    class Meta:
        ordering = ['-published_at']

    def __str__(self):
        return self.title

    @property
    def target_url(self):
        return self.link or reverse('club:notifications')


class Category(models.Model):
    """Shared category table for events, news, gallery, activities, resources."""

    SECTION_CHOICES = [
        ('event', 'Event'),
        ('news', 'News'),
        ('gallery', 'Gallery'),
        ('activity', 'Activity'),
        ('resource', 'Resource'),
        ('team', 'Team'),
    ]
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=90)
    section = models.CharField(max_length=20, choices=SECTION_CHOICES)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']
        unique_together = [('slug', 'section')]
        verbose_name_plural = 'Categories'

    def __str__(self):
        return f'{self.get_section_display()}: {self.name}'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Event(TimeStamped):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        limit_choices_to={'section': 'event'}, related_name='events')
    summary = models.CharField(max_length=300, blank=True)
    description = models.TextField()
    start = models.DateTimeField()
    end = models.DateTimeField(null=True, blank=True)
    venue = models.CharField(max_length=200)
    organizer = models.CharField(max_length=160, blank=True)
    image = models.ImageField(upload_to='events/', blank=True)
    capacity = models.PositiveIntegerField(default=0, help_text='0 means unlimited.')
    registration_open = models.BooleanField(default=True)
    registration_deadline = models.DateField(null=True, blank=True)
    is_featured = models.BooleanField(default=False)

    class Meta:
        ordering = ['-start']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:220]
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse('club:event_detail', args=[self.slug])

    @property
    def is_upcoming(self):
        return self.start >= timezone.now()

    @property
    def seats_left(self):
        if not self.capacity:
            return None
        return max(self.capacity - self.registrations.count(), 0)

    @property
    def can_register(self):
        if not self.registration_open or not self.is_upcoming:
            return False
        if self.registration_deadline and self.registration_deadline < date.today():
            return False
        return self.seats_left is None or self.seats_left > 0


class EventRegistration(TimeStamped):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='registrations')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                             related_name='event_registrations')
    full_name = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    remarks = models.TextField(blank=True)
    attended = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('event', 'email')]

    def __str__(self):
        return f'{self.full_name} → {self.event}'


class Activity(models.Model):
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        limit_choices_to={'section': 'activity'}, related_name='activities')
    summary = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=8, blank=True, help_text='A single emoji or glyph.')
    image = models.ImageField(upload_to='activities/', blank=True)
    frequency = models.CharField(max_length=120, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'title']
        verbose_name_plural = 'Activities'

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:180]
        super().save(*args, **kwargs)


class GalleryItem(TimeStamped):
    MEDIA_CHOICES = [('photo', 'Photo'), ('video', 'Video')]
    title = models.CharField(max_length=200)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        limit_choices_to={'section': 'gallery'}, related_name='gallery_items')
    media_type = models.CharField(max_length=10, choices=MEDIA_CHOICES, default='photo')
    image = models.ImageField(upload_to='gallery/', blank=True)
    video_url = models.URLField(blank=True)
    caption = models.TextField(blank=True)
    taken_on = models.DateField(default=date.today)

    class Meta:
        ordering = ['-taken_on', '-id']

    def __str__(self):
        return self.title


class TeamMember(models.Model):
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True)
    position = models.CharField(max_length=160)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        limit_choices_to={'section': 'team'}, related_name='members')
    bio = models.TextField(blank=True)
    photo = models.ImageField(upload_to='team/', blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    facebook = models.URLField(blank=True)
    linkedin = models.URLField(blank=True)
    instagram = models.URLField(blank=True)
    tenure = models.CharField(max_length=60, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['category__order', 'order', 'name']

    def __str__(self):
        return f'{self.name} ({self.position})'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:180]
        super().save(*args, **kwargs)

    @property
    def social_links(self):
        return [
            ('Facebook', self.facebook, 'facebook'),
            ('LinkedIn', self.linkedin, 'linkedin'),
            ('Instagram', self.instagram, 'instagram'),
        ]


class Article(TimeStamped):
    title = models.CharField(max_length=220)
    slug = models.SlugField(max_length=240, unique=True)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        limit_choices_to={'section': 'news'}, related_name='articles')
    author = models.CharField(max_length=120, blank=True)
    excerpt = models.TextField(blank=True)
    body = models.TextField()
    image = models.ImageField(upload_to='news/', blank=True)
    published_at = models.DateTimeField(default=timezone.now)
    is_featured = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ['-published_at']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:240]
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse('club:news_detail', args=[self.slug])


class MembershipBenefit(models.Model):
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=8, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


class Interest(models.Model):
    """Areas of interest offered on the membership application form."""

    name = models.CharField(max_length=80, unique=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class MembershipApplication(TimeStamped):
    STATUS_CHOICES = [
        ('pending', 'Pending review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    full_name = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=40)
    date_of_birth = models.DateField()
    address = models.TextField()
    department = models.CharField(max_length=160, blank=True,
                                  verbose_name='Department / class')
    interests = models.ManyToManyField(Interest, blank=True, related_name='applications')
    reason = models.TextField(verbose_name='Reason for joining')
    photo = models.ImageField(upload_to='applications/', blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='pending')
    reference_no = models.CharField(max_length=30, unique=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                             related_name='applications')
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.reference_no or "APP"} — {self.full_name}'

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.reference_no:
            self.reference_no = f'APP/{timezone.now():%Y}/{self.pk:05d}'
            super().save(update_fields=['reference_no'])


class MemberProfile(TimeStamped):
    STATUS_CHOICES = MembershipApplication.STATUS_CHOICES + [('active', 'Active member')]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='member_profile')
    membership_id = models.CharField(max_length=30, unique=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='pending')
    phone = models.CharField(max_length=40, blank=True)
    department = models.CharField(max_length=160, blank=True)
    address = models.TextField(blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    photo = models.ImageField(upload_to='members/', blank=True)
    joined_on = models.DateField(default=date.today)
    interests = models.ManyToManyField(Interest, blank=True, related_name='members')

    def __str__(self):
        return f'{self.membership_id or self.user.username}'

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.membership_id:
            self.membership_id = f'{SiteSettings.load().short_name}-{self.joined_on:%Y}-{self.pk:04d}'
            super().save(update_fields=['membership_id'])

    @property
    def display_name(self):
        return self.user.get_full_name() or self.user.username


class Certificate(models.Model):
    member = models.ForeignKey(MemberProfile, on_delete=models.CASCADE,
                               related_name='certificates')
    title = models.CharField(max_length=200)
    issued_on = models.DateField(default=date.today)
    reference_no = models.CharField(max_length=40, blank=True)
    file = models.FileField(upload_to='certificates/', blank=True)

    class Meta:
        ordering = ['-issued_on']

    def __str__(self):
        return f'{self.title} — {self.member}'


class Resource(TimeStamped):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        limit_choices_to={'section': 'resource'}, related_name='resources')
    description = models.TextField(blank=True)
    file = models.FileField(upload_to='resources/', blank=True)
    external_url = models.URLField(blank=True)
    file_label = models.CharField(max_length=40, blank=True,
                                  help_text='e.g. "PDF, 1.2 MB" — shown on the card.')
    published_on = models.DateField(default=date.today)
    downloads = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ['-published_on', 'title']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:220]
        super().save(*args, **kwargs)

    @property
    def download_url(self):
        if self.file:
            return self.file.url
        return self.external_url


class ContactMessage(TimeStamped):
    name = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    subject = models.CharField(max_length=200)
    message = models.TextField()
    is_handled = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.subject} — {self.name}'
