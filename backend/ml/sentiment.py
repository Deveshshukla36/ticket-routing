import re
from typing import Any, Dict, List

POSITIVE_WORDS = {
    "great", "excellent", "love", "awesome", "good", "thank", "thanks", "helpful",
    "appreciate", "pleased", "fantastic", "wonderful", "perfect", "glad", "fast"
}

NEGATIVE_WORDS = {
    "bad", "terrible", "horrible", "awful", "worst", "hate", "unacceptable",
    "useless", "broken", "failed", "freeze", "crash", "bug", "glitch", "error",
    "slow", "ridiculous", "poor", "frustrated", "disappointed", "angry", "annoyed"
}

URGENT_WORDS = {
    "immediately", "urgent", "emergency", "critical", "asap", "locked", "cannot access",
    "production down", "revenue", "loss", "deadline", "outage", "stuck", "escalate",
    "unauthorized", "stolen", "lawyer", "legal", "chargeback", "fraud"
}

NEGATION_TOKENS = {
    "not", "no", "never", "cannot", "cant", "can't", "wont", "won't",
    "dont", "don't", "isnt", "isn't", "hardly", "barely", "neither"
}

NEGATIVE_PHRASES = [
    "charged twice", "cannot log in", "cant log in", "locked out", "taking too long",
    "waste of money", "doesn't work", "does not work", "won't work", "stopped working",
    "data loss", "corrupted", "double charge", "unexpected charge"
]

URGENT_PHRASES = [
    "as soon as possible", "right away", "need help immediately", "production down",
    "system down", "widespread outage", "high priority", "shut down"
]


class SentimentAnalyzer:
    """
    Production-grade rule and lexicon sentiment & urgency analyzer.
    Features negation windowing (flipping negated positives to negative),
    phrase matching, and polite word dampening for urgent/frustrated tickets.
    """

    def analyze(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()
        tokens = re.findall(r"\b[\w'-]+\b", text_lower)

        pos_matches: List[str] = []
        neg_matches: List[str] = []
        urgent_matches: List[str] = []

        # Token-level scan with negation window of 3 tokens
        for idx, token in enumerate(tokens):
            norm_token = token.replace("'", "")
            # Check preceding 3 tokens for negations
            window_start = max(0, idx - 3)
            preceding = tokens[window_start:idx]
            is_negated = any(p in NEGATION_TOKENS or p.replace("'", "") in NEGATION_TOKENS for p in preceding)

            if token in POSITIVE_WORDS:
                if is_negated:
                    neg_matches.append(f"negated_{token}")
                else:
                    pos_matches.append(token)
            elif token in NEGATIVE_WORDS:
                neg_matches.append(token)
            elif norm_token in NEGATIVE_WORDS:
                neg_matches.append(norm_token)

            if token in URGENT_WORDS or norm_token in URGENT_WORDS:
                urgent_matches.append(token)

        # Multi-word phrase matching
        for phrase in NEGATIVE_PHRASES:
            if phrase in text_lower:
                neg_matches.append(f"phrase:{phrase}")

        for phrase in URGENT_PHRASES:
            if phrase in text_lower:
                urgent_matches.append(f"phrase:{phrase}")

        pos_count = len(pos_matches)
        neg_count = len(neg_matches)
        urgent_count = len(urgent_matches)

        # Politeness dampener: if strong negative/urgent indicators exist, pure politeness ("thanks")
        # should not overpower genuine customer frustration
        has_polite_only = set(pos_matches).issubset({"thank", "thanks", "appreciate", "please"})
        if (neg_count > 0 or urgent_count > 0) and has_polite_only:
            pos_count = 0

        # Classification decision
        if urgent_count >= 1 or (neg_count >= 2 and "!" in text):
            sentiment = "Urgent"
            score = -0.85
        elif neg_count > pos_count:
            sentiment = "Negative"
            score = round(-0.35 - (0.2 * min(neg_count, 3)), 2)
        elif pos_count > neg_count:
            sentiment = "Positive"
            score = round(0.35 + (0.2 * min(pos_count, 3)), 2)
        else:
            sentiment = "Neutral"
            score = 0.0

        return {
            "sentiment": sentiment,
            "score": score,
            "is_urgent": urgent_count > 0,
            "indicators": {
                "positive_count": pos_count,
                "negative_count": neg_count,
                "urgent_count": urgent_count,
            }
        }


sentiment_analyzer = SentimentAnalyzer()

