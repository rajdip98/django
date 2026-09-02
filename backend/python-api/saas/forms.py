from django import forms
from django.conf import settings as django_settings
from django.contrib.auth.forms import AuthenticationForm, SetPasswordForm
from django.contrib.auth.models import User

from club.forms import StyledFormMixin
from staff.models import StaffProfile

from .models import Tenant


class PlatformLoginForm(StyledFormMixin, AuthenticationForm):
    pass


class PlatformPasswordForm(StyledFormMixin, SetPasswordForm):
    def clean_new_password1(self):
        password = self.cleaned_data['new_password1']
        if password == django_settings.PLATFORM_DEFAULT_PASSWORD:
            raise forms.ValidationError(
                'You cannot keep the shared platform password. Choose a new one.')
        if password == django_settings.PANEL_DEFAULT_PASSWORD:
            raise forms.ValidationError(
                'That is the websites’ default admin password. Choose a different one.')
        return password


class UnlockForm(StyledFormMixin, forms.Form):
    passphrase = forms.CharField(
        label='Platform passphrase', widget=forms.PasswordInput,
        help_text='Opens the platform panel for 20 minutes. Every attempt is recorded.')


class RotatePlatformSecretForm(StyledFormMixin, forms.Form):
    new_secret = forms.CharField(label='New platform passphrase',
                                 widget=forms.PasswordInput, min_length=8)
    confirm_secret = forms.CharField(label='Confirm passphrase', widget=forms.PasswordInput)

    def clean(self):
        cleaned = super().clean()
        if cleaned.get('new_secret') != cleaned.get('confirm_secret'):
            raise forms.ValidationError('The two entries do not match.')
        return cleaned


class TenantForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = Tenant
        fields = ['name', 'slug', 'domain', 'plan', 'contact_email', 'is_active',
                  'is_default', 'notes']
        widgets = {'notes': forms.Textarea(attrs={'rows': 3})}
        help_texts = {'slug': 'Used in links and internal references. Letters, numbers and hyphens.'}

    def clean_domain(self):
        domain = self.cleaned_data['domain'].strip().lower().replace('https://', '') \
            .replace('http://', '').rstrip('/')
        if domain:
            clash = Tenant.objects.filter(domain__iexact=domain)
            if self.instance.pk:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise forms.ValidationError('Another website already answers on that domain.')
        return domain


class PlatformAdminForm(StyledFormMixin, forms.ModelForm):
    """Creates a site administrator for any website, from the platform panel."""

    username = forms.CharField(max_length=150)
    first_name = forms.CharField(max_length=60)
    last_name = forms.CharField(max_length=60, required=False)
    email = forms.EmailField()

    class Meta:
        model = StaffProfile
        fields = ['tenant', 'role', 'designation', 'phone']
        labels = {'tenant': 'Website'}

    def __init__(self, *args, **kwargs):
        self.creator = kwargs.pop('creator', None)
        super().__init__(*args, **kwargs)
        self.fields['tenant'].queryset = Tenant.objects.filter(is_active=True)
        self.fields['tenant'].required = True
        self.order_fields(['tenant', 'username', 'first_name', 'last_name', 'email',
                           'role', 'designation', 'phone'])
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
