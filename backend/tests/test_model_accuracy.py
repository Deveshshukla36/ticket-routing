"""Accuracy gate on the independent holdout set (data/holdout.json).

Gates: sklearn >= 0.90, RoBERTa >= 0.92 (docs/adr/001-roberta-serving.md). Thresholds are
deliberately not configurable here: changing a gate must be a reviewed code change.
Set ACCURACY_REPORT_DIR to also write each report as JSON (CI uploads these).
"""
import os
from pathlib import Path
from typing import Callable, List, Optional

import pytest

from config import settings
from ml.classifier import ROUTING_TABLE
from ml.evaluation import (
    EvaluationReport,
    evaluate,
    format_report,
    load_holdout,
    load_training_texts,
    validate_holdout,
)
from ml.model_router import ModelRouter
from schemas.prediction import IntentPrediction

LABELS = sorted(ROUTING_TABLE)
HOLDOUT = load_holdout()

BatchFn = Callable[[List[str]], List[IntentPrediction]]


def _sklearn(variant: str) -> BatchFn:
    router = ModelRouter(backend="sklearn")
    return lambda texts: [router.classify_ab(t, variant) for t in texts]


def _roberta() -> BatchFn:
    from ml.roberta_client import RoBERTaClassifier

    client = RoBERTaClassifier.from_settings()
    return client.predict_batch


ROBERTA_READY = bool(settings.HF_API_TOKEN and (settings.HF_MODEL_ID or settings.HF_ENDPOINT_URL))
CASES = [
    pytest.param("sklearn", lambda: _sklearn("A"), 0.90, id="sklearn"),
    pytest.param("roberta", _roberta, 0.92, id="roberta", marks=pytest.mark.skipif(
        not ROBERTA_READY, reason="HF_API_TOKEN and HF_MODEL_ID/HF_ENDPOINT_URL not set; RoBERTa gate skipped")),
    pytest.param("sklearn-b", lambda: _sklearn("B"), None, id="sklearn-b-report-only"),
]


def _emit(report: EvaluationReport, threshold: Optional[float], capsys: pytest.CaptureFixture) -> None:
    with capsys.disabled():
        print("\n" + format_report(report, threshold))
    out_dir = os.getenv("ACCURACY_REPORT_DIR")
    if out_dir:
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        (Path(out_dir) / f"accuracy-{report.backend}.json").write_text(report.model_dump_json(indent=2))


def test_holdout_is_valid_and_independent_of_training_data():
    problems = validate_holdout(HOLDOUT, LABELS, load_training_texts())
    assert not problems, "\n".join(problems)


@pytest.mark.accuracy
@pytest.mark.parametrize("backend, make_predictor, threshold", CASES)
def test_holdout_accuracy(backend: str, make_predictor: Callable[[], BatchFn],
                          threshold: Optional[float], capsys: pytest.CaptureFixture):
    report = evaluate(backend, make_predictor(), HOLDOUT, LABELS)
    _emit(report, threshold, capsys)

    if backend == "roberta":
        # A fallback answer is a sklearn answer; counting it would misreport RoBERTa accuracy.
        assert report.fallback_count == 0, f"{report.fallback_count} predictions fell back to sklearn"
    if threshold is not None:
        assert report.accuracy >= threshold, (
            f"{backend} holdout accuracy {report.accuracy:.4f} is below the {threshold:.2f} gate")
