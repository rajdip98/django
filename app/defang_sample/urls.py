"""URL configuration for the project.

The club website is mounted at the site root; the original to-do sample is
kept at /todos/ so the Defang template still works as documented.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('panel/', include('staff.urls', namespace='staff')),
    path('todos/', include('example_app.urls', namespace='example_app')),
    path('', include('club.urls', namespace='club')),
]

# Uploaded media is served by Django in development; behind Gunicorn use the
# platform's object storage or a front-end web server instead.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
