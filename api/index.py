"""
Vercel Python Serverless entry point for the FastAPI backend.

Vercel looks for an `app` (ASGI) variable at module level and invokes it
for every request routed to this function (i.e. all /api/* paths).
"""
import sys
import os

# -- Path bootstrap --
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.dirname(_API_DIR)
_BACKEND_DIR = os.path.join(_ROOT_DIR, "backend")

sys.path.insert(0, _BACKEND_DIR)
sys.path.insert(0, _ROOT_DIR)

# -- Environment defaults --
# Vercel function filesystem is read-only; /tmp is the only writable location.
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/tickets.db")
os.environ.setdefault("ENVIRONMENT", "production")

# -- Import FastAPI application --
# `app` must be a module-level name so Vercel Python runtime can discover it.
from main import app  # noqa: E402

__all__ = ["app"]
