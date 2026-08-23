# Use an official Python runtime as a parent image
FROM python:3.11-slim

RUN apt-get update -qq \
  && apt-get install -y curl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set work directory
WORKDIR /code

# Install dependencies
COPY requirements.txt /code/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /code/

# Collect static files
RUN python manage.py collectstatic --noinput

# start.sh migrates, collects static files and creates the first Super Admin
# and the platform owner before starting Gunicorn. Set SEED_DEMO=True to also load the sample content.
CMD ["sh", "start.sh"]
