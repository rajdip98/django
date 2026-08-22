# Django

[![1-click-deploy](https://raw.githubusercontent.com/DefangLabs/defang-assets/main/Logos/Buttons/SVG/deploy-with-defang.svg)](https://portal.defang.dev/redirect?url=https%3A%2F%2Fgithub.com%2Fnew%3Ftemplate_name%3Dsample-django-template%26template_owner%3DDefangSamples)

This repository contains a **club / organisation website** built with Django, in a
government-portal visual style, on top of the Defang Django sample. See
[Club website](#club-website) below for what it contains and how to run it.

The original sample is a simple Django to-do app that uses SQLite as the database, which will be reset every time you deploy. **It is not production-ready**. For production use cases, you should check out the Django + Postgres sample. The to-do sample now lives at `/todos/`; the club website is served at the site root.

## Club website

A database-driven website for a club, society or community organisation, styled after
a government portal: an authority strip with accessibility controls, an emblem
masthead, a sticky navigation bar with drop-downs, a scrolling "what's new" ticker,
breadcrumbs, notice-board panels, tabular listings and a four-column footer.

### Pages

| Route | What it does |
| --- | --- |
| `/` | Hero, statistics counters, about preview, upcoming events, activities, news, gallery, office bearers, testimonials |
| `/about/` | History, mission, vision, objectives, core values, timeline, achievements, message from the president |
| `/events/`, `/events/<slug>/`, `/events/<slug>/register/` | Listing with search, category filters and upcoming/past tabs; detail page; registration form with capacity and deadline checks |
| `/calendar/` | Month-by-month event calendar |
| `/activities/` | Activities grouped by category |
| `/gallery/` | Photo and video grid with album filters and a keyboard-navigable lightbox |
| `/team/` | Office bearers, executive committee, advisors, coordinators and volunteers |
| `/news/`, `/news/<slug>/` | Article listing with search and categories, featured article, detail page with related articles |
| `/membership/` | Benefits and the online application form; acknowledgement page issues a reference number |
| `/resources/` | Downloadable forms, reports, rules and brochures, with a download counter |
| `/contact/` | Enquiry form, office address and map |
| `/search/` | Site-wide search across events, news, team, gallery, resources, activities and pages |
| `/notifications/` | All active notices |
| `/register/`, `/login/`, `/password-reset/` | Portal account creation, sign-in and password reset |
| `/dashboard/`, `/profile/`, `/dashboard/events/`, `/dashboard/certificates/` | Member portal: membership card, registrations, certificates, documents, announcements |
| `/privacy/`, `/terms/` | Policy pages, edited from the admin |
| `/admin/` | Content management for every model above |

### Design and accessibility

Light, dark and high-contrast themes, and three text sizes, are selected from the top
strip and remembered per browser. There is a skip link, visible focus outlines, ARIA
labelling on the interactive controls, and `prefers-reduced-motion` support. The layout
is mobile-first and never scrolls horizontally. All CSS and JavaScript is hand-written
and self-contained — no CDNs, fonts or other external requests. Items without an
uploaded image fall back to a coloured placeholder derived from the title, so a fresh
install still looks complete.

### Running it locally

```bash
cd app
pip install -r requirements.txt
DEBUG=True python manage.py migrate
DEBUG=True python manage.py seed_demo      # realistic sample content
DEBUG=True python manage.py createsuperauto  # admin / admin
DEBUG=True python manage.py runserver
```

Then open http://localhost:8000/. Sign in to the member portal as `member` /
`member12345`, and to the admin console at `/admin/` as `admin` / `admin`.
`python manage.py seed_demo --reset` clears the club content and reloads it.

Run the tests with `DEBUG=True python manage.py test club`.

### Making it your own

All content is editable in the admin console — there is nothing to edit in the
templates. Start with **Site settings** (organisation name, emblem, contact details,
mission, privacy policy), then add categories, events, news, team members, gallery
items and resources. Uploaded files are written to `app/media/`, which Django serves
only when `DEBUG=True`; put them behind a web server or object storage for a real
deployment, and move off SQLite before going live.

The app includes a management command which is run on startup to create a superuser with the username `admin` and password `admin`. This means you can login to the admin interface at `/admin/` and see the Django admin interface without any additional steps. The `example_app` is already registered and the `Todo` model is already set up to be managed in the admin interface.

The Dockerfile and compose files are already set up for you and are ready to be deployed. Serving is done using [Gunicorn](https://gunicorn.org/) and uses [WhiteNoise](https://whitenoise.readthedocs.io/en/latest/) for static files. The `CSRF_TRUSTED_ORIGINS` setting is configured to allow the app to run on a `defang.dev` subdomain.

## Prerequisites

1. Download [Defang CLI](https://github.com/DefangLabs/defang)
2. (Optional) If you are using [Defang BYOC](https://docs.defang.io/docs/concepts/defang-byoc) authenticate with your cloud provider account
3. (Optional for local development) [Docker CLI](https://docs.docker.com/engine/install/)

## Development

To run the application locally, you can use the following command:

```bash
docker compose up --build
```

## Configuration

For this sample, you will not need to provide [configuration](https://docs.defang.io/docs/concepts/configuration). 

If you wish to provide configuration, see below for an example of setting a configuration for a value named `API_KEY`.

```bash
defang config set API_KEY
```

## Deployment

> [!NOTE]
> Download [Defang CLI](https://github.com/DefangLabs/defang)

### Defang Playground

Deploy your application to the Defang Playground by opening up your terminal and typing:
```bash
defang compose up
```

### BYOC (AWS)

If you want to deploy to your own cloud account, you can use Defang BYOC:

1. [Authenticate your AWS account](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html), and check that you have properly set your environment variables like `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`.
2. Make sure to update the `CSRF_TRUSTED_ORIGINS` setting in the `settings.py` file to include an appropriate domain.
3. Run in a terminal that has access to your AWS environment variables:
    ```bash
    defang --provider=aws compose up
    ```

---

Title: Django

Short Description: A simple Django app that uses SQLite as the database.

Tags: Django, SQLite, Python

Languages: python
