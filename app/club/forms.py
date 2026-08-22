from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.models import User

from .models import (ContactMessage, EventRegistration, Interest,
                     MemberProfile, MembershipApplication)

TEXT_ATTRS = {'class': 'gov-input'}
AREA_ATTRS = {'class': 'gov-input', 'rows': 5}


class StyledFormMixin:
    """Applies the government-form input styling to every widget."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            widget = field.widget
            if isinstance(widget, (forms.CheckboxInput, forms.CheckboxSelectMultiple,
                                   forms.RadioSelect)):
                continue
            if isinstance(widget, forms.Select):
                widget.attrs.setdefault('class', 'gov-input gov-select')
            elif isinstance(widget, (forms.ClearableFileInput, forms.FileInput)):
                widget.attrs.setdefault('class', 'gov-file')
            elif isinstance(widget, forms.Textarea):
                widget.attrs.setdefault('class', 'gov-input')
                widget.attrs.setdefault('rows', 5)
            else:
                widget.attrs.setdefault('class', 'gov-input')
            if field.required:
                widget.attrs.setdefault('aria-required', 'true')


class MembershipApplicationForm(StyledFormMixin, forms.ModelForm):
    interests = forms.ModelMultipleChoiceField(
        queryset=Interest.objects.all(), required=False,
        widget=forms.CheckboxSelectMultiple, label='Areas of interest')
    declaration = forms.BooleanField(
        label='I declare that the information furnished above is true to the best of my '
              'knowledge and I agree to abide by the rules of the organisation.')

    class Meta:
        model = MembershipApplication
        fields = ['full_name', 'email', 'phone', 'date_of_birth', 'address',
                  'department', 'interests', 'reason', 'photo']
        widgets = {
            'date_of_birth': forms.DateInput(attrs={'type': 'date'}),
            'address': forms.Textarea(attrs=AREA_ATTRS),
            'reason': forms.Textarea(attrs=AREA_ATTRS),
        }
        labels = {'full_name': 'Full name (as per records)'}
        help_texts = {
            'photo': 'Passport-size photograph, JPG or PNG, under 2 MB.',
            'reason': 'Tell us in a few lines why you would like to join.',
        }

    def clean_email(self):
        email = self.cleaned_data['email'].lower()
        pending = MembershipApplication.objects.filter(email=email, status='pending')
        if pending.exists():
            raise forms.ValidationError(
                'An application with this e-mail is already under review. '
                'Please contact the office for an update.')
        return email


class EventRegistrationForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = EventRegistration
        fields = ['full_name', 'email', 'phone', 'remarks']
        widgets = {'remarks': forms.Textarea(attrs={'class': 'gov-input', 'rows': 3})}
        labels = {'remarks': 'Remarks (optional)'}


class ContactForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = ContactMessage
        fields = ['name', 'email', 'phone', 'subject', 'message']
        widgets = {'message': forms.Textarea(attrs=AREA_ATTRS)}


class SignUpForm(StyledFormMixin, UserCreationForm):
    first_name = forms.CharField(max_length=60)
    last_name = forms.CharField(max_length=60, required=False)
    email = forms.EmailField()
    phone = forms.CharField(max_length=40, required=False)

    class Meta:
        model = User
        fields = ['username', 'first_name', 'last_name', 'email']

    def clean_email(self):
        email = self.cleaned_data['email'].lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError('An account with this e-mail already exists.')
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data['email']
        user.first_name = self.cleaned_data['first_name']
        user.last_name = self.cleaned_data.get('last_name', '')
        if commit:
            user.save()
            MemberProfile.objects.create(
                user=user, phone=self.cleaned_data.get('phone', ''), status='pending')
        return user


class GovAuthenticationForm(StyledFormMixin, AuthenticationForm):
    pass


class ProfileForm(StyledFormMixin, forms.ModelForm):
    first_name = forms.CharField(max_length=60)
    last_name = forms.CharField(max_length=60, required=False)
    email = forms.EmailField()
    interests = forms.ModelMultipleChoiceField(
        queryset=Interest.objects.all(), required=False,
        widget=forms.CheckboxSelectMultiple)

    class Meta:
        model = MemberProfile
        fields = ['phone', 'department', 'address', 'date_of_birth', 'photo', 'interests']
        widgets = {
            'date_of_birth': forms.DateInput(attrs={'type': 'date'}),
            'address': forms.Textarea(attrs={'class': 'gov-input', 'rows': 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.instance.user
        self.fields['first_name'].initial = user.first_name
        self.fields['last_name'].initial = user.last_name
        self.fields['email'].initial = user.email
        order = ['first_name', 'last_name', 'email', 'phone', 'department',
                 'date_of_birth', 'address', 'photo', 'interests']
        self.order_fields(order)

    def save(self, commit=True):
        profile = super().save(commit=False)
        user = profile.user
        user.first_name = self.cleaned_data['first_name']
        user.last_name = self.cleaned_data.get('last_name', '')
        user.email = self.cleaned_data['email']
        if commit:
            user.save()
            profile.save()
            self.save_m2m()
        return profile
