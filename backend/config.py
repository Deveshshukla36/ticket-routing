import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

class Settings(BaseModel):
    # App Info
    APP_NAME: str = "Smart Ticket Routing API"
    APP_VERSION: str = "2.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")

    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{BASE_DIR / 'tickets.db'}"
    )

    # ML & Routing
    DEFAULT_MODEL_VARIANT: str = os.getenv("DEFAULT_MODEL_VARIANT", "A")
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.60"))
    MODEL_BACKEND: str = os.getenv("MODEL_BACKEND", "sklearn")  # sklearn | roberta
    MODELS_DIR: Path = BASE_DIR / "models"

    # RoBERTa via Hugging Face (see docs/adr/001-roberta-serving.md)
    HF_API_TOKEN: Optional[str] = os.getenv("HF_API_TOKEN") or None
    HF_MODEL_ID: Optional[str] = os.getenv("HF_MODEL_ID") or None
    HF_ENDPOINT_URL: Optional[str] = os.getenv("HF_ENDPOINT_URL") or None
    DATA_DIR: Path = BASE_DIR / "data"

    # AI & LLM Enhancement (Optional)
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY", None)
    ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY", None)
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "offline")  # offline, openai, anthropic

    # CORS
    CORS_ORIGINS: list[str] = ["*", "http://localhost:3000", "http://127.0.0.1:3000"]

settings = Settings()
