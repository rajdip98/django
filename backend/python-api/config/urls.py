"""URL configuration for the club / organisation website.

    /                     the public website
    /adminpanel/login     a website's own administrators sign in here
    /superadminpanel/login  the platform owner signs in here
    /admin/               Django's built-in console

Both panels are reachable by typing the address into a browser. The older
/panel/ and /platform/ addresses still work — they redirect — so any bookmark
or printed note keeps working.
"""
import os
import re

from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import RedirectView
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    # The two panels, at addresses that are easy to type and to remember.
    path('adminpanel/', include('staff.urls', namespace='staff')),
    path('superadminpanel/', include('saas.urls', namespace='saas')),

    # Older and near-miss addresses, kept working so nobody hits a 404.
    path('panel/', RedirectView.as_view(url='/adminpanel/', permanent=True)),
    path('panel/login/', RedirectView.as_view(url='/adminpanel/login/', permanent=True)),
    path('platform/', RedirectView.as_view(url='/superadminpanel/', permanent=True)),
    path('platform/login/', RedirectView.as_view(url='/superadminpanel/login/', permanent=True)),
    path('admin-panel/', RedirectView.as_view(url='/adminpanel/login/', permanent=False)),
    path('adminlogin/', RedirectView.as_view(url='/adminpanel/login/', permanent=False)),
    path('superadmin/', RedirectView.as_view(url='/superadminpanel/login/', permanent=False)),
    path('super-admin-panel/', RedirectView.as_view(url='/superadminpanel/login/', permanent=False)),
    path('', include('club.urls', namespace='club')),
]

# Uploaded files — logos, banners, photographs, documents — are served by Django
# itself, in production as well as in development, so a single-server deployment
# works with no extra configuration and new uploads appear immediately.
#
# django.conf.urls.static.static() is deliberately not used here: it returns an
# empty list whenever DEBUG is False, which is why an uploaded logo commonly
# 404s on a deployed site. The route below is registered either way.
#
# Put nginx or a CDN in front of MEDIA_ROOT for a busier site and set
# SERVE_MEDIA=False to drop this route.
if os.environ.get('SERVE_MEDIA', 'True').strip().lower() in {'1', 'true', 'yes', 'on'}:
    media_prefix = re.escape(settings.MEDIA_URL.lstrip('/'))
    urlpatterns += [
        re_path(r'^%s(?P<path>.*)$' % media_prefix, serve,
                {'document_root': settings.MEDIA_ROOT}),
    ]
