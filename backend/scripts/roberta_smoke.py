"""One live RoBERTa call through the production client; exits non-zero unless RoBERTa answered.

Usage (from backend/): HF_API_TOKEN=... HF_MODEL_ID=org/model python scripts/roberta_smoke.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml.roberta_client import RoBERTaClassifier  # noqa: E402

SAMPLE = ("I was charged twice for the same invoice this month", "Billing")


def main() -> int:
    client = RoBERTaClassifier.from_settings()
    if not client.is_configured:
        print("RoBERTa not configured (HF_API_TOKEN and HF_MODEL_ID/HF_ENDPOINT_URL); nothing to smoke-test")
        return 1
    pred = client.predict(SAMPLE[0])
    print(f"backend={pred.backend} intent={pred.intent} confidence={pred.confidence:.3f} "
          f"latency_ms={pred.latency_ms:.0f} fallback_reason={pred.fallback_reason}")
    if pred.backend != "roberta":
        print("FAIL: RoBERTa did not answer; the prediction came from the sklearn fallback")
        return 1
    if pred.intent != SAMPLE[1]:
        print(f"FAIL: expected {SAMPLE[1]!r}")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
