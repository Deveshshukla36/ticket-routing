"""Run the test suite against a throwaway SQLite file, never the developer's tickets.db.

config.Settings reads DATABASE_URL at import time, so this must run before any test
module imports the app; pytest loads conftest.py first.
"""
import os
import tempfile
from pathlib import Path

_TEST_DB = Path(tempfile.mkdtemp(prefix="intentroute-tests-")) / "tickets.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB.as_posix()}"
