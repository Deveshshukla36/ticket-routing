from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from api.middleware import RequestContextMiddleware, capture_route_template
from api.routes_v1 import router as api_v1_router
from config import settings
from database.connection import init_db
from ml.classifier import get_classifier
from ml.model_router import ModelRouter, get_model_router
from schemas.ticket import FeedbackIn, RouteRequest, TicketIn
from services.request_metrics import request_metrics
from utils.logger import setup_logger
from utils.request_context import REQUEST_ID_HEADER

logger = setup_logger("intent-routing-api")
# Namespaces used across the backend (intentroute.http/api/roberta, intent-routing.db, ...).
setup_logger("intentroute")
setup_logger("intent-routing")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database schema...")
    init_db()
    logger.info("Preloading ML classifiers (Variants A and B)...")
    get_classifier("A")
    get_classifier("B")
    logger.info("Model backend: %s", get_model_router().backend)
    logger.info("Models A and B loaded and ready.")
    yield
    # Shutdown
    logger.info("Application shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    description="NLP-driven customer support intent classification & smart ticket routing platform",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    dependencies=[Depends(capture_route_template)],  # labels /api/v1/metrics by route template
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[REQUEST_ID_HEADER],  # let the dashboard read it for support/debugging
)
# Added last = outermost: every response (incl. CORS preflights and errors) gets an id.
app.add_middleware(RequestContextMiddleware, metrics=request_metrics)

# Mount primary /api/v1 endpoints (preserving full backward compatibility)
app.include_router(api_v1_router, prefix="/api/v1")


# Root aliases for standard API convenience requested in spec
@app.post("/predict", tags=["Root Aliases"], include_in_schema=True)
def root_predict(ticket: TicketIn, variant: str = "A", model_router: ModelRouter = Depends(get_model_router)):
    from api.routes_v1 import predict
    return predict(ticket, variant, model_router)


@app.post("/route", tags=["Root Aliases"], include_in_schema=True)
def root_route(request: RouteRequest, model_router: ModelRouter = Depends(get_model_router)):
    from api.routes_v1 import smart_route
    return smart_route(request, model_router)


@app.post("/feedback", tags=["Root Aliases"], include_in_schema=True)
def root_feedback(feedback: FeedbackIn):
    from api.routes_v1 import submit_feedback
    return submit_feedback(feedback)


@app.get("/metrics", tags=["Root Aliases"], include_in_schema=True)
def root_metrics(variant: str = "A"):
    from api.routes_v1 import model_metrics
    return model_metrics(variant)


@app.get("/models", tags=["Root Aliases"], include_in_schema=True)
def root_models():
    from api.routes_v1 import list_models
    return list_models()


@app.get("/health", tags=["Root Aliases"], include_in_schema=True)
def root_health(response: Response, model_router: ModelRouter = Depends(get_model_router)):
    from api.routes_v1 import health
    return health(response, model_router)


@app.get("/", tags=["Root"])
def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/api/v1/health",
        "models": "/models",
        "metrics": "/metrics",
    }
