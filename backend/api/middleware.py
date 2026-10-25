"""ASGI middleware: X-Request-ID propagation, per-request timing, and an access log line."""
import logging
import re
import time
from contextvars import ContextVar
from typing import Dict, Optional

from fastapi import Request
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from services.request_metrics import RequestMetrics
from utils.request_context import REQUEST_ID_HEADER, normalize_request_id, request_id_var

logger = logging.getLogger("intentroute.http")

UNMATCHED = "unmatched"
_CONVERTER = re.compile(r"{(\w+):\w+}")
# The middleware owns a fresh dict per request; the dependency below writes into it.
_route_label: ContextVar[Optional[Dict[str, str]]] = ContextVar("route_label", default=None)


def capture_route_template(request: Request) -> None:
    """App-wide dependency: record the matched route template ("/api/v1/model/info").

    Metrics are labelled by template, never by raw path, so unknown or parameterised URLs
    can't grow the metrics table without bound. Included routers report their path without
    the prefix, so the prefix is recovered from the real request path.
    """
    holder = _route_label.get()
    route = request.scope.get("route")
    template = getattr(route, "path", None)
    if holder is None or not template:
        return
    template = _CONVERTER.sub(r"{\1}", template)
    try:
        rendered = template.format(**request.path_params)
    except (KeyError, IndexError, ValueError):
        holder["route"] = template
        return
    path = request.url.path
    holder["route"] = path[: len(path) - len(rendered)] + template if path.endswith(rendered) else template


class RequestContextMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware) so the request id contextvar reaches every handler."""

    def __init__(self, app: ASGIApp, metrics: RequestMetrics) -> None:
        self.app = app
        self.metrics = metrics

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = normalize_request_id(Headers(scope=scope).get(REQUEST_ID_HEADER))
        rid_token = request_id_var.set(request_id)
        holder = {"route": UNMATCHED}
        route_token = _route_label.set(holder)
        status = 500
        start = time.perf_counter()

        async def send_with_request_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            latency_ms = (time.perf_counter() - start) * 1000
            self.metrics.record_request(scope["method"], holder["route"], status, latency_ms)
            logger.info("%s %s -> %d in %.1fms", scope["method"], scope["path"], status, latency_ms)
            _route_label.reset(route_token)
            request_id_var.reset(rid_token)
