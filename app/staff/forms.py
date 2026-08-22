from django import forms
from django.conf import settings as django_settings
from django.contrib.auth.forms import AuthenticationForm, SetPasswordForm
from django.contrib.auth.models import User

from club.models import Banner, QRCode, Resource, SiteSettings
from club.forms import StyledFormMixin

from .models import StaffProfile


class PanelLoginForm(StyledFormMixin, AuthenticationForm):
    pass


class ForcedPasswordChangeForm(StyledFormMixin, SetPasswordForm):
    """Used for both the first-login change and ordinary changes."""

    def clean_new_password1(self):
        password = self.cleaned_data['new_password1']
        if password == django_settings.PANEL_DEFAULT_PASSWORD:
            raise forms.ValidationError(
                'You cannot keep the shared default password. Choose a new one.')
        if password == django_settings.PANEL_ELEVATION_SECRET:
            raise forms.ValidationError(
                'That value is reserved. Choose a different password.')
        return password


class ElevationForm(StyledFormMixin, forms.Form):
    secret = forms.CharField(
        label='Elevation secret', widget=forms.PasswordInput,
        help_text='Grants Super Admin access for 30 minutes. Every attempt is recorded.')


class RotateSecretForm(StyledFormMixin, forms.Form):
    new_secret = forms.CharField(label='New elevation secret', widget=forms.PasswordInput,
                                 min_length=8)
    confirm_secret = forms.CharField(label='Confirm secret', widget=forms.PasswordInput)

    def clean(self):
        cleaned = super().clean()
        if cleaned.get('new_secret') != cleaned.get('confirm_secret'):
            raise forms.ValidationError('The two entries do not match.')
        return cleaned


class AdminAccountForm(StyledFormMixin, forms.ModelForm):
    """Creates an administrator with the shared default password."""

    username = forms.CharField(max_length=150)
    first_name = forms.CharField(max_length=60)
    last_name = forms.CharField(max_length=60, required=False)
    email = forms.EmailField()

    class Meta:
        model = StaffProfile
        fields = ['role', 'designation', 'phone']

    def __init__(self, *args, **kwargs):
        self.creator = kwargs.pop('creator', None)
        super().__init__(*args, **kwargs)
        self.order_fields(['username', 'first_name', 'last_name', 'email', 'role',
                           'designation', 'phone'])
        if self.instance.pk:
            user = self.instance.user
            self.fields['username'].initial = user.username
            self.fields['username'].disabled = True
            self.fields['first_name'].initial = user.first_name
            self.fields['last_name'].initial = user.last_name
            self.fields['email'].initial = user.email

    def clean_username(self):
        username = self.cleaned_data['username'].strip()
        if self.instance.pk:
            return username
        if User.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError('That username is already taken.')
        return username

    def clean_email(self):
        email = self.cleaned_data['email'].lower()
        existing = User.objects.filter(email__iexact=email)
        if self.instance.pk:
            existing = existing.exclude(pk=self.instance.user_id)
        if existing.exists():
            raise forms.ValidationError('An account with this e-mail already exists.')
        return email

    def save(self, commit=True):
        profile = super().save(commit=False)
        if profile.pk:
            user = profile.user
        else:
            user = User(username=self.cleaned_data['username'])
            profile.created_by = self.creator
        user.first_name = self.cleaned_data['first_name']
        user.last_name = self.cleaned_data.get('last_name', '')
        user.email = self.cleaned_data['email']
        if not user.pk:
            user.set_password(django_settings.PANEL_DEFAULT_PASSWORD)
        user.save()
        profile.user = user
        if not profile.pk:
            profile.must_change_password = True
        profile.save()
        profile.apply_role_permissions()
        return profile


# --------------------------------------------------------------- site content

class IdentityForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = SiteSettings
        fields = ['organization_name', 'short_name', 'slogan', 'established',
                  'logo', 'emblem', 'primary_color', 'introduction']
        widgets = {'primary_color': forms.TextInput(attrs={'type': 'color'}),
                   'introduction': forms.Textarea(attrs={'rows': 4})}


class HeaderForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = SiteSettings
        fields = ['parent_authority', 'registration_line', 'show_top_strip',
                  'show_ticker', 'show_header_search']


class FooterForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = SiteSettings
        fields = ['address', 'phone', 'alt_phone', 'email', 'office_hours',
                  'facebook', 'instagram', 'youtube', 'linkedin',
                  'content_managed_by', 'footer_note']
        widgets = {'address': forms.Textarea(attrs={'rows': 3}),
                   'footer_note': forms.Textarea(attrs={'rows': 2})}


class BannerForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = Banner
        fields = ['title', 'subtitle', 'image', 'link_url', 'link_text', 'placement',
                  'order', 'is_active', 'starts_on', 'ends_on']
        widgets = {'starts_on': forms.DateInput(attrs={'type': 'date'}),
                   'ends_on': forms.DateInput(attrs={'type': 'date'})}

    def clean(self):
        cleaned = super().clean()
        starts, ends = cleaned.get('starts_on'), cleaned.get('ends_on')
        if starts and ends and ends < starts:
            raise forms.ValidationError('The end date cannot fall before the start date.')
        return cleaned


class FileForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = Resource
        fields = ['title', 'category', 'description', 'file', 'external_url',
                  'file_label', 'published_on', 'is_published']
        widgets = {'description': forms.Textarea(attrs={'rows': 3}),
                   'published_on': forms.DateInput(attrs={'type': 'date'})}

    def clean(self):
        cleaned = super().clean()
        if not cleaned.get('file') and not cleaned.get('external_url') and not self.instance.file:
            raise forms.ValidationError('Attach a file or provide an external link.')
        return cleaned


class QRCodeForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = QRCode
        fields = ['label', 'payload', 'caption', 'scans_hint', 'placement',
                  'error_correction', 'image', 'order', 'is_active']
        widgets = {'payload': forms.Textarea(attrs={'rows': 3})}
        labels = {'payload': 'Link or text to encode', 'image': 'Upload a ready-made code'}

    def clean_payload(self):
        payload = self.cleaned_data['payload'].strip()
        if not payload and not (self.cleaned_data.get('image') or self.instance.image):
            raise forms.ValidationError('Enter something to encode, or upload an image.')
        return payload
