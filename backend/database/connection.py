import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from config import settings

from .models import Base

logger = logging.getLogger("intent-routing.db")

# Some providers hand out postgres:// URLs; SQLAlchemy 2 only accepts postgresql://.
DATABASE_URL = settings.DATABASE_URL
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,
    # Neon closes idle connections and Render free instances sleep; re-check before use.
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initializes tables and populates base model registry entries if empty."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized.")


def get_db():
    """FastAPI dependency for DB session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_health() -> bool:
    """Simple connection health probe."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False
