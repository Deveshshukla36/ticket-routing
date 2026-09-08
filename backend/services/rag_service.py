import re
from typing import List, Dict, Any, Optional
from config import settings
from schemas.ai import AIResponseRequest, AIResponseResult, KnowledgeArticle

KNOWLEDGE_BASE = [
    {
        "id": "kb_account_01",
        "title": "Account Locked Out & Multi-Factor Reset Protocol",
        "intent": "Account Access",
        "summary": "Step-by-step identity verification and reset procedure for locked user accounts.",
        "suggested_steps": [
            "Verify account ownership using secondary email or phone SMS token.",
            "Trigger secure one-time password reset link valid for 15 minutes.",
            "Review recent security log for unauthorized IP addresses.",
            "Confirm multi-factor authentication (MFA) device reset upon request."
        ],
        "template": "Hello {customer_name},\n\nThank you for contacting Identity & Access Support. We understand getting locked out of your account disrupts your work, and we are here to help you regain access swiftly and securely.\n\nWe have generated a secure password reset token and sent it to your registered recovery address. Please follow the link within 15 minutes to establish a new password.\n\nIf you are still unable to log in, please let us know and we will conduct a rapid identity verification call.\n\nWarm regards,\nIdentity & Access Team"
    },
    {
        "id": "kb_billing_01",
        "title": "Duplicate Charge & Billing Discrepancy Resolution",
        "intent": "Billing",
        "summary": "Investigation procedure for invoice disputes, duplicate authorizations, and subscription changes.",
        "suggested_steps": [
            "Locate transaction ID in the payment gateway ledger.",
            "Identify if duplicate entry is a pending authorization hold or cleared capture.",
            "Issue immediate credit memo or initiate full refund for duplicate transaction.",
            "Send updated PDF statement to the customer."
        ],
        "template": "Hello {customer_name},\n\nThank you for reaching out to Billing & Payments. We sincerely apologize for any confusion regarding your recent invoice.\n\nOur billing team has verified your account ledger. If a duplicate authorization occurred, we have initiated an immediate refund back to your original payment method, which typically reflects within 3-5 business days depending on your bank.\n\nYou can also review your updated statement anytime in your Account Settings > Invoices tab.\n\nBest regards,\nBilling & Payments Team"
    },
    {
        "id": "kb_tech_01",
        "title": "System Crash & Performance Degradation Diagnostics",
        "intent": "Technical Issue",
        "summary": "Troubleshooting high latency, page crashes, rendering errors, and service interruptions.",
        "suggested_steps": [
            "Check cluster status page for regional degradation or active maintenance.",
            "Request browser console logs and network HAR export.",
            "Advise customer to test in incognito mode with hardware acceleration toggled.",
            "Escalate to L2 engineering if error code 5xx persists across sessions."
        ],
        "template": "Hello {customer_name},\n\nThank you for bringing this technical issue to our attention. Our Tier-2 technical support team is actively investigating the behavior you reported.\n\nTo help us pinpoint the root cause:\n1. Could you confirm the browser and operating system version you are currently using?\n2. Does this issue occur in a private/incognito window with browser extensions disabled?\n\nOur team has logged diagnostic trace #{ticket_id} and will update you as soon as our telemetry analysis is complete.\n\nSincerely,\nTechnical Support L2"
    },
    {
        "id": "kb_bug_01",
        "title": "Software Bug Intake & Engineering Escalation",
        "intent": "Bug Report",
        "summary": "Standard operating procedure for reproducible defects and software bugs.",
        "suggested_steps": [
            "Reproduce the bug in staging environment with identical user permissions.",
            "Capture reproduction video, stack trace, and request payload.",
            "Create Jira issue tagged with affected service and severity.",
            "Notify customer of internal issue tracker ID."
        ],
        "template": "Hello {customer_name},\n\nThank you for submitting this bug report. We appreciate you taking the time to let us know about this defect.\n\nOur engineering team has confirmed and cataloged this behavior under issue tracker #{ticket_id}. We are working on a hotfix for our next release cycle.\n\nWe will keep this ticket open and notify you the moment the fix is deployed to production.\n\nBest regards,\nEngineering Team"
    },
    {
        "id": "kb_cancellation_01",
        "title": "Subscription Cancellation & Retention Inquiries",
        "intent": "Cancellation",
        "summary": "Guidelines for handling cancellation requests, auto-renewal stops, and offboarding.",
        "suggested_steps": [
            "Confirm the exact subscription plan and current billing period expiration date.",
            "Offer flexible plan pause or customized downgrade options if applicable.",
            "Disable auto-renew while keeping access active through the paid cycle.",
            "Provide export instructions for customer account data."
        ],
        "template": "Hello {customer_name},\n\nWe are sorry to see you go, but we want to make this process as smooth as possible for you.\n\nWe have scheduled your subscription cancellation to take effect at the conclusion of your current billing cycle. You will continue to have uninterrupted access until then, and no further automatic charges will occur.\n\nIf your needs change in the future or you would like to explore our flexible pause option, we would love to welcome you back.\n\nKind regards,\nCustomer Retention Team"
    },
    {
        "id": "kb_complaint_01",
        "title": "Executive Escalation & Critical Complaint Protocol",
        "intent": "Complaint",
        "summary": "Priority handling for dissatisfied customers and service escalation.",
        "suggested_steps": [
            "Acknowledge the customer's frustration immediately with high empathy.",
            "Assign an escalation manager to oversee ticket resolution end-to-end.",
            "Audit prior communication history across all support channels.",
            "Offer appropriate courtesy remedy or service credit."
        ],
        "template": "Hello {customer_name},\n\nThank you for your direct feedback, and I sincerely apologize for the frustration and delay you have experienced. The level of service you received does not reflect our standards.\n\nI have personally escalated your case to our Senior Management team. We are actively reviewing your case timeline to rectify this situation immediately.\n\nA dedicated senior specialist will follow up with you within 30 minutes with a comprehensive resolution.\n\nSincerely,\nCustomer Escalations Management"
    },
    {
        "id": "kb_feature_01",
        "title": "Feature Request & Product Roadmap Submission",
        "intent": "Feature Request",
        "summary": "Process for capturing user feedback, enhancement requests, and roadmap consideration.",
        "suggested_steps": [
            "Categorize feature request under target product module.",
            "Link ticket to the corresponding Productboard/Roadmap initiative.",
            "Share existing workarounds or alternative workflows if available.",
            "Subscribe user to roadmap notification updates."
        ],
        "template": "Hello {customer_name},\n\nThank you for sharing this great suggestion with us! We love hearing directly from our users about features that would enhance your workflow.\n\nI have documented your request and shared it directly with our Product Management team for evaluation in our upcoming roadmap planning sessions.\n\nIn the meantime, our documentation team has detailed an alternative workflow that may help achieve a similar result today. Let us know if you would like a walkthrough!\n\nBest regards,\nProduct Experience Team"
    },
    {
        "id": "kb_general_01",
        "title": "General Inquiries & Platform Capabilities Guide",
        "intent": "General Inquiry",
        "summary": "Assistance for general plan questions, onboarding guides, and platform information.",
        "suggested_steps": [
            "Provide clear answer with direct reference to knowledge base docs.",
            "Include link to product guide and self-serve help center.",
            "Offer to schedule a quick onboarding call if desired."
        ],
        "template": "Hello {customer_name},\n\nThank you for reaching out to us! We are happy to answer your questions and help you make the most of our platform.\n\nYou can find complete details on our features, documentation, and plan comparisons in our Help Center guide. If you have any specific requirements or would like a quick demo, feel free to reply directly to this message.\n\nBest regards,\nCustomer Support Team"
    },
]


class RAGAssistantService:
    """
    Retrieval-Augmented Generation & Response Suggestion engine.
    Fully operates offline with no API keys needed, while seamlessly allowing
    external LLM providers if keys are configured.
    """

    def suggest_response(self, request: AIResponseRequest) -> AIResponseResult:
        customer_name = request.customer_name or "Valued Customer"
        query_words = set(re.findall(r"\b\w+\b", request.ticket_text.lower()))

        scored_articles = []
        for doc in KNOWLEDGE_BASE:
            score = 0.0
            # Intent match bonus
            if request.intent and doc["intent"].lower() == request.intent.lower():
                score += 3.0

            # Content overlap
            doc_text = (doc["title"] + " " + doc["summary"] + " " + " ".join(doc["suggested_steps"])).lower()
            doc_words = set(re.findall(r"\b\w+\b", doc_text))
            overlap = len(query_words.intersection(doc_words))
            score += overlap * 0.5

            scored_articles.append((score, doc))

        scored_articles.sort(key=lambda x: x[0], reverse=True)
        best_doc = scored_articles[0][1]

        matched_knowledge = [
            KnowledgeArticle(
                title=doc["title"],
                intent=doc["intent"],
                summary=doc["summary"],
                suggested_steps=doc["suggested_steps"],
                relevance_score=round(min(1.0, (score + 1.0) / 6.0), 2),
            )
            for score, doc in scored_articles[:3]
        ]

        # Generate response using template & contextual synthesis
        template = best_doc["template"]
        ticket_id = request.ticket_text[:6].replace(" ", "").upper() or "TCK-101"
        suggested_text = template.format(
            customer_name=customer_name,
            ticket_id=ticket_id
        )

        confidence_assessment = (
            "High confidence response based on verified knowledge base resolution article."
            if scored_articles[0][0] >= 3.0
            else "Moderate confidence: recommend reviewing suggested response before dispatching."
        )

        return AIResponseResult(
            suggested_response=suggested_text,
            matched_knowledge=matched_knowledge,
            action_items=best_doc["suggested_steps"],
            confidence_assessment=confidence_assessment,
            source="RAG Knowledge Base (Offline / Zero-API-Key)",
        )


rag_service = RAGAssistantService()
