"""Settings for the club / organisation website.

Everything that changes between your laptop and a real server is read from an
environment variable, so the same code runs in both places. The ones that
matter when you deploy:

    SECRET_KEY              long random string — set this
    DEBUG                   "True" only while developing; leave unset in production
    ALLOWED_HOSTS           your domain(s), comma separated, e.g. club.example.org
    CSRF_TRUSTED_ORIGINS    https://club.example.org — required for forms over HTTPS
    SECURE_COOKIES          "True" once the site is served over HTTPS
    DATABASE_URL            mysql://user:pass@host:3306/dbname, or postgres://…
                            (SQLite is used when this is unset)
    TIME_ZONE               e.g. Asia/Kolkata
    PANEL_DEFAULT_PASSWORD  first-login password for new panel accounts
    PANEL_ELEVATION_SECRET  secret an Admin enters for temporary Super Admin access

Any of these may be kept in the encrypted vault instead of the environment — see
tools/secretvault/README.md. DEPLOY.md walks through a full deployment.
"""

from pathlib import Path
from urllib.parse import unquote, urlparse
import os
import sys

from . import secrets


def env_list(name, default=''):
    """Read a comma-separated environment variable into a list."""
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(',') if item.strip()]


def env_flag(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in {'1', 'true', 'yes', 'on'}

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = secrets.get(
    'SECRET_KEY',
    'django-insecure-r(z^n29_r&ax*%(!la2i*cy@*$2q1h(ulie!%@qy)5j-i9kepw')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# Set ALLOWED_HOSTS to your domain in production, e.g.
#   ALLOWED_HOSTS=club.example.org,www.club.example.org
# The default accepts any host so the site still answers on a fresh server.
ALLOWED_HOSTS = env_list('ALLOWED_HOSTS', '*')


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'saas',
    'club',
    'staff',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise serves the collected static files; it belongs directly after
    # SecurityMiddleware so it answers before the session and auth work happens.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    # Decides which website the request is for; must run after auth so the panel
    # can compare the signed-in admin's tenant with the requested one.
    'club.middleware.TenantMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'club.context_processors.site',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.environ.get('SQLITE_PATH', BASE_DIR / 'db.sqlite3'),
    }
}

# --- MySQL / MariaDB / PostgreSQL ------------------------------------------
# Point DATABASE_URL at a server and it replaces SQLite:
#
#   mysql://user:password@127.0.0.1:3306/clubsite
#   postgres://user:password@127.0.0.1:5432/clubsite
#
# For MySQL install the driver first:  pip install -r requirements-mysql.txt
# The database itself must be created as utf8mb4, or the emoji used through the
# site will be rejected with "Incorrect string value":
#
#   CREATE DATABASE clubsite CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
DATABASE_URL = secrets.get('DATABASE_URL', '')
if DATABASE_URL:
    url = urlparse(DATABASE_URL)
    name = url.path.lstrip('/')
    common = {
        'NAME': name,
        'USER': unquote(url.username or ''),
        'PASSWORD': unquote(url.password or ''),
        'HOST': url.hostname or '127.0.0.1',
        'CONN_MAX_AGE': int(os.environ.get('CONN_MAX_AGE', '60')),
    }
    if url.scheme.startswith(('mysql', 'mariadb')):
        DATABASES['default'] = {
            'ENGINE': 'django.db.backends.mysql',
            'PORT': str(url.port or 3306),
            'OPTIONS': {
                'charset': 'utf8mb4',
                # Strict mode makes MySQL reject bad data instead of truncating it.
                'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
            },
            'TEST': {
                'CHARSET': 'utf8mb4',
                'COLLATION': 'utf8mb4_unicode_ci',
            },
            **common,
        }
    elif url.scheme.startswith('postgres'):
        DATABASES['default'] = {
            'ENGINE': 'django.db.backends.postgresql',
            'PORT': str(url.port or 5432),
            **common,
        }
    else:
        raise ValueError(
            f'DATABASE_URL uses an unsupported scheme: {url.scheme}. '
            f'Use mysql://…, postgres://… or leave it unset to stay on SQLite.')


# Password validation
# https://docs.djangoproject.com/en/5.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = os.environ.get('TIME_ZONE', 'UTC')

# Where django.contrib.auth sends users after login / logout.
LOGIN_URL = 'club:login'
LOGIN_REDIRECT_URL = 'club:dashboard'
LOGOUT_REDIRECT_URL = 'club:home'

# --- Administration panel -------------------------------------------------
# Shared bootstrap password issued to every new Super Admin and Admin. The
# account cannot do anything until it is changed at first sign-in. Override in
# deployment: anyone who can read this repository can read the fallback.
PANEL_DEFAULT_PASSWORD = secrets.get('PANEL_DEFAULT_PASSWORD', 'rajdip10')

# Secret an Admin may enter to borrow Super Admin access for 30 minutes. It is
# hashed into the database on first run; rotate it from Panel → Security, and
# override the fallback here for deployment.
PANEL_ELEVATION_SECRET = secrets.get('PANEL_ELEVATION_SECRET', 'rajdip2007')

# Password for the platform (SaaS) owner account, and the passphrase a site admin
# must supply to reach the platform panel at all. Override both in deployment.
PLATFORM_DEFAULT_PASSWORD = secrets.get('PLATFORM_DEFAULT_PASSWORD', 'rajdip@100')

# Password reset e-mails are printed to the console unless SMTP is configured.
EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'office@example.com')

# File upload limits for member photographs and documents.
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
# Hashed filenames give far better caching, but that storage refuses to render a
# page unless `collectstatic` has run — the cause of a blank 500 on a fresh
# deployment. Use it only when the manifest is actually there.
_STATIC_MANIFEST = os.path.join(STATIC_ROOT, 'staticfiles.json')
if 'test' in sys.argv:
    STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'
elif os.path.exists(_STATIC_MANIFEST):
    STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
else:
    STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'

# Serve static files straight from each app when they have not been collected, so
# the site is styled even if the deployment skipped `collectstatic`.
WHITENOISE_USE_FINDERS = not os.path.exists(_STATIC_MANIFEST)
WHITENOISE_AUTOREFRESH = DEBUG

# Uploaded content (logos, banners, event photos, member photographs, documents).
# MEDIA_ROOT must survive restarts: on a host with an ephemeral filesystem, point
# it at a mounted volume with MEDIA_ROOT=/data/media.
MEDIA_URL = 'media/'
MEDIA_ROOT = os.environ.get('MEDIA_ROOT', os.path.join(BASE_DIR, 'media'))

# Both directories must exist before WhiteNoise serves from them.
os.makedirs(MEDIA_ROOT, exist_ok=True)
os.makedirs(STATIC_ROOT, exist_ok=True)

# Default primary key field type
# https://docs.djangoproject.com/en/5.0/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Browsers only accept a form POST over HTTPS when the origin is listed here, so
# an unset CSRF_TRUSTED_ORIGINS is the usual cause of "CSRF verification failed"
# on a freshly deployed site. Set it to your own domain:
#   CSRF_TRUSTED_ORIGINS=https://club.example.org
CSRF_TRUSTED_ORIGINS = env_list(
    'CSRF_TRUSTED_ORIGINS',
    'http://localhost:8000,http://127.0.0.1:8000')

# Cookies marked "secure" are never sent over plain HTTP, which would leave you
# unable to sign in on an http:// site. Switch this on once HTTPS is in place:
#   SECURE_COOKIES=True
if env_flag('SECURE_COOKIES', False):
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# Honour the proxy's protocol header so Django knows a request arrived over
# HTTPS when it sits behind nginx, a load balancer or a PaaS router.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Requests arrive through the Java gateway, which puts the visitor's real host
# in X-Forwarded-Host. Tenant resolution and absolute URLs both depend on it.
#
# This is only safe because Django binds to localhost and the gateway is the
# only thing that can reach it. If you expose this process directly, a visitor
# could set the header themselves — bind it to 127.0.0.1 and keep it there.
USE_X_FORWARDED_HOST = True
X_FRAME_OPTIONS = 'DENY'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
