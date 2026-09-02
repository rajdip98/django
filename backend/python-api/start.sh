#!/usr/bin/env sh
# Production start-up: apply migrations, publish static files, make sure the
# first Super Admin exists, then hand over to Gunicorn.
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py bootstrap_platform
python manage.py bootstrap_panel

# Load the demonstration content only when asked for (SEED_DEMO=True).
if [ "${SEED_DEMO:-False}" = "True" ]; then
  python manage.py seed_demo
fi

exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-3}" \
  --timeout "${GUNICORN_TIMEOUT:-60}" \
  --access-logfile - \
  --error-logfile -
