from typing import List, Optional

from pydantic import BaseModel, Field


class AIResponseRequest(BaseModel):
    ticket_text: str = Field(..., min_length=3)
    intent: Optional[str] = None
    sentiment: Optional[str] = None
    customer_name: Optional[str] = "Valued Customer"


class KnowledgeArticle(BaseModel):
    title: str
    intent: str
    summary: str
    suggested_steps: List[str]
    relevance_score: float


class AIResponseResult(BaseModel):
    suggested_response: str
    matched_knowledge: List[KnowledgeArticle]
    action_items: List[str]
    confidence_assessment: str
    source: str  # "RAG Knowledge Base (Offline)" or "LLM Provider"
