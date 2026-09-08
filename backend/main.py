import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from utils.logger import setup_logger
from database.connection import init_db
from ml.classifier import get_classifier
from api.routes_v1 import router as api_v1_router
from schemas.ticket import TicketIn, RouteRequest, FeedbackIn

logger = setup_logger("intent-routing-api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database schema...")
    init_db()
    logger.info("Preloading ML classifiers (Variants A and B)...")
    get_classifier("A")
    get_classifier("B")
    logger.info("Models A and B loaded and ready.")
    yield
    # Shutdown
    logger.info("Application shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    description="NLP-driven customer support intent classification & smart ticket routing platform",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount primary /api/v1 endpoints (preserving full backward compatibility)
app.include_router(api_v1_router, prefix="/api/v1")


# Root aliases for standard API convenience requested in spec
@app.post("/predict", tags=["Root Aliases"], include_in_schema=True)
def root_predict(ticket: TicketIn, variant: str = "A"):
    from api.routes_v1 import predict
    return predict(ticket, variant)


@app.post("/route", tags=["Root Aliases"], include_in_schema=True)
def root_route(request: RouteRequest):
    from api.routes_v1 import smart_route
    return smart_route(request)


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
def root_health():
    from api.routes_v1 import health
    return health()


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
