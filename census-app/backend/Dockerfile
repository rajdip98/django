# Single image that builds the PWA and serves it alongside the API.
#
# Stage 1 builds the React frontend; stage 2 is a slim Python runtime that
# serves both the API and the built app on one port — one container, one
# domain, no reverse-proxy configuration required.

FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    STATIC_DIR=/app/static

WORKDIR /app

COPY backend/requirements.txt backend/requirements-optional.txt ./
# Optional extras are included so MONGODB_URI, Twilio and the AI provider all
# work by setting environment variables — no image rebuild needed.
RUN pip install --no-cache-dir -r requirements-optional.txt

COPY backend/app ./app
COPY --from=frontend /build/dist ./static

RUN mkdir -p /data && useradd --system --uid 10001 census && chown -R census /data /app
USER census

EXPOSE 8000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
