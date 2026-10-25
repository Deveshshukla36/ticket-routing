from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class TicketModel(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(64), unique=True, index=True, nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class PredictionModel(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(64), index=True, nullable=False)
    text = Column(Text, nullable=False)
    predicted_intent = Column(String(100), index=True, nullable=False)
    confidence = Column(Float, nullable=False)
    top_k_json = Column(JSON, nullable=True)
    routed_team = Column(String(100), nullable=False)
    priority = Column(String(50), nullable=False)
    sentiment = Column(String(50), default="Neutral")
    sla_hours = Column(Float, default=4.0)
    requires_human_review = Column(Boolean, default=False)
    model_version = Column(String(50), nullable=False)
    latency_ms = Column(Float, default=0.0)
    variant = Column(String(10), default="A")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class FeedbackModel(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(64), index=True, nullable=True)
    text = Column(Text, nullable=False)
    predicted_intent = Column(String(100), nullable=False)
    correct_intent = Column(String(100), nullable=False)
    notes = Column(Text, nullable=True)
    reviewer = Column(String(100), default="Human Agent")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class RoutingHistoryModel(Base):
    __tablename__ = "routing_history"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(64), index=True, nullable=False)
    routed_team = Column(String(100), nullable=False)
    priority = Column(String(50), nullable=False)
    status = Column(String(50), default="Routed")  # Routed, Manual Review, Resolved, Closed
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ModelRegistryModel(Base):
    __tablename__ = "model_registry"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(50), unique=True, nullable=False)
    architecture = Column(String(150), nullable=False)
    accuracy = Column(Float, nullable=False)
    f1_score = Column(Float, nullable=False)
    is_active = Column(Boolean, default=False)
    metrics_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
