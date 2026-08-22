"""Template helpers used by the public templates."""
from django import template
from django.utils.http import urlencode

register = template.Library()


@register.filter
def initials(value, count=2):
    """"Rural Sports Meet" -> "RS" — used for image placeholders."""
    words = [w for w in str(value).replace('—', ' ').split() if w[:1].isalnum()]
    return ''.join(w[0].upper() for w in words[:count]) or '?'


@register.filter
def swatch(value):
    """A stable 0-5 palette index derived from the text, so a given item always
    gets the same placeholder colour."""
    return sum(ord(c) for c in str(value)) % 6


@register.simple_tag(takes_context=True)
def query_replace(context, **kwargs):
    """Rebuild the current query string with some parameters replaced.

    Used by pagination and filter links so filters survive page changes.
    """
    params = context['request'].GET.copy()
    for key, value in kwargs.items():
        if value in (None, ''):
            params.pop(key, None)
        else:
            params[key] = value
    if 'page' not in kwargs:
        params.pop('page', None)
    encoded = urlencode(params)
    return f'?{encoded}' if encoded else ''


@register.simple_tag(takes_context=True)
def page_link(context, page_number):
    params = context['request'].GET.copy()
    params['page'] = page_number
    return f'?{urlencode(params)}'


@register.filter
def is_active_path(request_path, url):
    if url == '/':
        return request_path == '/'
    return request_path.startswith(url)


@register.filter
def widget_type(field):
    """Lets templates lay checkbox groups out differently from text inputs."""
    return field.field.widget.__class__.__name__.lower()


@register.filter
def split_lines(value):
    return [line.strip() for line in str(value).splitlines() if line.strip()]
