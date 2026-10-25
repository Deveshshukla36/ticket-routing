"""Per-request correlation id, available to any code (and log record) handling the request."""
import logging
import re
import uuid
from contextvars import ContextVar
from typing import Optional

REQUEST_ID_HEADER = "X-Request-ID"
# Accept client-supplied ids only if they are short and log-safe (no spaces/newlines).
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    return request_id_var.get()


def normalize_request_id(incoming: Optional[str]) -> str:
    """Reuse the caller's id when it is safe to log, otherwise mint a UUID4."""
    if incoming and _VALID_REQUEST_ID.match(incoming):
        return incoming
    return str(uuid.uuid4())


class RequestIdFilter(logging.Filter):
    """Adds `request_id` to every record so formatters can include it."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True
