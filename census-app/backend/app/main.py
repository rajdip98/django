"""India Census 2026-27 API.

Serves the JSON API and, when a built frontend is present, the app itself — so a
single `uvicorn app.main:app` gives you the whole product on one port and one
domain.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import APP_VERSION, Settings, get_settings
from .deps import settings_dep
from .models import HealthOut, now_iso
from .routers import admin, ai_routes, auth, households
from .store import build_store


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    store = build_store(settings.mongodb_uri, settings.mongodb_db, settings.data_dir)
    await store.connect()
    app.state.store = store
    app.state.settings = settings

    print(
        f"census: API v{APP_VERSION} ready "
        f"(storage={store.kind}, sms={'on' if settings.sms_enabled else 'off'}, "
        f"ai={'on' if settings.ai_enabled else 'off'})"
    )
    if settings.static_dir:
        print(f"census: serving the app from {settings.static_dir}")
    else:
        print("census: no built frontend found — API only (run `npm run build` in frontend/)")

    try:
        yield
    finally:
        await store.close()


def mount_frontend(application: FastAPI, settings: Settings) -> None:
    """Serve the built PWA from the same origin as the API.

    Mounted last so it never shadows an API route. The app uses hash routing, so
    `html=True` (which falls back to index.html) is all the SPA support needed —
    there are no server-side paths to rewrite.
    """
    if settings.static_dir is None:
        return
    application.mount(
        "/",
        StaticFiles(directory=str(settings.static_dir), html=True),
        name="app",
    )


def create_app() -> FastAPI:
    """Build the application. A factory so tests can spin up isolated instances."""
    settings = get_settings()

    application = FastAPI(
        title="India Census 2026-27 API",
        version=APP_VERSION,
        description=(
            "Household data collection for the Census of India 2026-27: OTP authentication, "
            "offline sync, supervisor review, analytics and export."
        ),
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

    application.include_router(auth.router)
    application.include_router(households.router)
    application.include_router(admin.router)
    application.include_router(ai_routes.router)

    @application.get("/api/health", response_model=HealthOut, tags=["meta"])
    async def health(  # noqa: D401 - endpoint
        current: Annotated[Settings, Depends(settings_dep)],
    ) -> HealthOut:
        store = getattr(application.state, "store", None)
        return HealthOut(
            status="ok",
            version=APP_VERSION,
            database=getattr(store, "kind", "embedded"),
            smsEnabled=current.sms_enabled,
            aiEnabled=current.ai_enabled,
            serverTime=now_iso(),
        )

    @application.get("/api", include_in_schema=False)
    async def api_root() -> JSONResponse:
        return JSONResponse(
            {
                "name": "India Census 2026-27 API",
                "version": APP_VERSION,
                "docs": "/docs",
                "health": "/api/health",
            }
        )

    mount_frontend(application, settings)
    return application


app = create_app()
