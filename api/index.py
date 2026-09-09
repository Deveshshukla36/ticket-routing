"""
Vercel Python Serverless entry point for the FastAPI backend.

Vercel looks for an `app` (ASGI) variable at module level and invokes it
for every request routed to this function (i.e. all /api/* paths).
"""
import sys
import os
from contextlib import asynccontextmanager

# -- Path bootstrap --
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.dirname(_API_DIR)
_BACKEND_DIR = os.path.join(_ROOT_DIR, "backend")

sys.path.insert(0, _BACKEND_DIR)
sys.path.insert(0, _ROOT_DIR)

# -- Environment defaults --
# Vercel function filesystem is read-only; /tmp is the only writable location.
# DATABASE_URL should be set as an environment variable in the Vercel dashboard
# (e.g. Neon PostgreSQL connection string). Falls back to ephemeral SQLite in /tmp.
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/tickets.db")
os.environ.setdefault("ENVIRONMENT", "production")

# -- Lazy lifespan (skip eager model preload on cold start) --
# Models are cached in-memory on first request via get_classifier().
# This keeps cold-start time fast on Vercel serverless.
@asynccontextmanager
async def vercel_lifespan(app):
    from database.connection import init_db
    init_db()
    yield

# -- Import FastAPI application and patch its lifespan --
# `app` must be a module-level name so Vercel Python runtime can discover it.
from main import app  # noqa: E402
app.router.lifespan_context = vercel_lifespan  # override eager preload lifespan

__all__ = ["app"]
