import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from ml.classifier import get_classifier, ROUTING_TABLE
from ml.sentiment import sentiment_analyzer
from schemas.ticket import RouteRequest, RouteResult, IntentScore
from config import settings


class SmartRoutingEngine:
    """
    Enterprise smart routing engine.
    Combines:
    - Predicted Intent (8 classes)
    - Calibrated Classification Confidence
    - Sentiment & Urgency Analysis
    - Dynamic Priority & Team Calibration
    - Target SLA Calculation
    - Human Review Escalation
    """

    def route_ticket(self, request: RouteRequest) -> RouteResult:
        ticket_id = request.ticket_id or str(uuid.uuid4())[:8]
        clf = get_classifier(request.variant or "A")

        threshold = request.confidence_threshold if request.confidence_threshold is not None else settings.CONFIDENCE_THRESHOLD

        # 1. Intent Classification
        pred = clf.predict(request.text, top_k=3, threshold=threshold)
        intent = pred["predicted_intent"]
        confidence = pred["confidence"]
        base_priority = pred.get("base_priority", pred.get("priority", "Medium"))
        base_team = pred["routed_team"]
        latency_ms = pred["latency_ms"]
        model_version = pred["model_version"]
        top_k_scores = [IntentScore(label=item["label"], confidence=item["confidence"]) for item in pred.get("top_k", [])]

        # 2. Sentiment & Urgency Analysis
        s_result = sentiment_analyzer.analyze(request.text)
        sentiment = s_result["sentiment"]
        sentiment_score = s_result.get("score", 0.0)
        is_urgent = s_result["is_urgent"]

        # 3. Dynamic Priority & Team Calibration
        priority = base_priority
        routed_team = base_team
        reasons = []

        if confidence < threshold:
            requires_human_review = True
            priority = "Needs Manual Triage"
            routed_team = "Human Review Queue"
            reasons.append(f"Confidence {confidence*100:.1f}% below threshold ({threshold*100:.0f}%) -> routed to Human Review Queue")
            if is_urgent or sentiment == "Urgent":
                reasons.append("Urgent frustration/critical keywords detected; elevated triage priority")
        else:
            requires_human_review = False
            reasons.append(f"Intent classified as '{intent}' with {confidence*100:.1f}% confidence")

            # Escalation based on sentiment/urgency
            if is_urgent or sentiment == "Urgent":
                if priority in ("Low", "Medium"):
                    priority = "High"
                    reasons.append("Escalated priority to High due to detected urgency/frustration keywords")
                elif priority == "High":
                    priority = "Urgent"
                    reasons.append("Elevated to Urgent due to critical system/account impact keywords")
            elif sentiment == "Negative" and priority == "Low":
                priority = "Medium"
                reasons.append("Adjusted priority to Medium due to negative customer sentiment")

        # 4. SLA Calculation based on Intent + Priority + Sentiment + Triage status
        sla_hours, sla_label = self._calculate_sla(intent, priority, is_urgent, requires_human_review)

        return RouteResult(
            ticket_id=ticket_id,
            text=request.text,
            intent=intent,
            confidence=confidence,
            sentiment=sentiment,
            sentiment_score=sentiment_score,
            priority=priority,
            routed_team=routed_team,
            sla_hours=sla_hours,
            sla_label=sla_label,
            requires_human_review=requires_human_review,
            routing_reason=" | ".join(reasons),
            model_version=model_version,
            latency_ms=latency_ms,
            timestamp=datetime.now(timezone.utc),
            top_k=top_k_scores,
        )

    def _calculate_sla(self, intent: str, priority: str, is_urgent: bool, requires_human_review: bool) -> tuple[float, str]:
        if requires_human_review:
            if is_urgent or priority == "Urgent":
                return 0.5, "30 minutes (Urgent Triage Target)"
            return 1.0, "1 hour (Manual Triage Target)"

        if priority == "Urgent":
            return 0.5, "30 minutes (Urgent Escalation SLA)"
        elif priority == "High":
            if intent in ("Account Access", "Technical Issue"):
                return 2.0, "2 hours (Critical Technical SLA)"
            return 4.0, "4 hours (High Priority SLA)"
        elif priority == "Medium":
            if intent == "Cancellation":
                return 2.0, "2 hours (Customer Retention SLA)"
            return 8.0, "8 hours (Standard SLA)"
        else:  # Low
            if intent == "Feature Request":
                return 24.0, "24 hours (Product Review SLA)"
            return 12.0, "12 hours (Standard General SLA)"


smart_routing_engine = SmartRoutingEngine()
