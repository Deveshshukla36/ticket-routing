"""Holdout loading, leakage validation, and accuracy / confusion-matrix evaluation."""
import csv
import json
import re
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Sequence

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from schemas.prediction import IntentPrediction

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HOLDOUT_PATH = DATA_DIR / "holdout.json"
TRAINING_PATH = DATA_DIR / "tickets_dataset.csv"
_TOKEN = re.compile(r"[a-z0-9']+")


class HoldoutExample(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    text: str = Field(..., min_length=3, max_length=4000)
    label: str


class LabelMetrics(BaseModel):
    precision: float
    recall: float
    f1: float
    support: int


class EvaluationReport(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    backend: str
    model_versions: List[str]
    n: int
    accuracy: float
    fallback_count: int
    per_label: Dict[str, LabelMetrics]
    confusion: Dict[str, Dict[str, int]]  # confusion[true_label][predicted_label]


def load_holdout(path: Path = HOLDOUT_PATH) -> List[HoldoutExample]:
    with open(path, encoding="utf-8") as f:
        return TypeAdapter(List[HoldoutExample]).validate_python(json.load(f))


def load_training_texts(path: Path = TRAINING_PATH) -> List[str]:
    with open(path, encoding="utf-8") as f:
        return [row["text"] for row in csv.DictReader(f)]


def _tokens(text: str) -> frozenset[str]:
    return frozenset(_TOKEN.findall(text.lower()))


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    return len(a & b) / len(a | b) if a or b else 1.0


def max_training_similarity(text: str, training_tokens: Iterable[frozenset[str]]) -> float:
    toks = _tokens(text)
    return max((jaccard(toks, t) for t in training_tokens), default=0.0)


def validate_holdout(
    examples: Sequence[HoldoutExample],
    labels: Sequence[str],
    training_texts: Sequence[str],
    *,
    min_per_label: int = 25,
    min_total: int = 200,
    max_similarity: float = 0.7,
) -> List[str]:
    """Return a list of problems (empty == valid). Never mutates or filters the holdout."""
    problems: List[str] = []
    allowed = set(labels)
    counts = {label: 0 for label in labels}
    seen: Dict[frozenset[str], str] = {}
    training_tokens = {_tokens(t) for t in training_texts}

    for ex in examples:
        if ex.label not in allowed:
            problems.append(f"unknown label {ex.label!r}: {ex.text!r}")
            continue
        counts[ex.label] += 1
        toks = _tokens(ex.text)
        if toks in seen:
            problems.append(f"duplicate of {seen[toks]!r}: {ex.text!r}")
        seen[toks] = ex.text
        sim = max_training_similarity(ex.text, training_tokens)
        if sim >= max_similarity:
            problems.append(f"too similar to training data (jaccard={sim:.2f}): {ex.text!r}")

    if len(examples) < min_total:
        problems.append(f"holdout has {len(examples)} examples, need >= {min_total}")
    problems.extend(
        f"label {label!r} has {n} examples, need >= {min_per_label}"
        for label, n in counts.items() if n < min_per_label
    )
    return problems


def evaluate(
    backend: str,
    predict_batch: Callable[[List[str]], List[IntentPrediction]],
    examples: Sequence[HoldoutExample],
    labels: Sequence[str],
) -> EvaluationReport:
    preds = predict_batch([ex.text for ex in examples])
    confusion = {t: {p: 0 for p in labels} for t in labels}
    for ex, pred in zip(examples, preds):
        confusion[ex.label][pred.intent] = confusion[ex.label].get(pred.intent, 0) + 1

    per_label: Dict[str, LabelMetrics] = {}
    for label in labels:
        tp = confusion[label][label]
        support = sum(confusion[label].values())
        predicted = sum(confusion[t].get(label, 0) for t in labels)
        precision = tp / predicted if predicted else 0.0
        recall = tp / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_label[label] = LabelMetrics(precision=round(precision, 4), recall=round(recall, 4),
                                        f1=round(f1, 4), support=support)

    correct = sum(confusion[label][label] for label in labels)
    return EvaluationReport(
        backend=backend,
        model_versions=sorted({p.model_version for p in preds}),
        n=len(examples),
        accuracy=round(correct / len(examples), 4) if examples else 0.0,
        fallback_count=sum(1 for p in preds if p.fallback_reason is not None),
        per_label=per_label,
        confusion=confusion,
    )


def format_report(report: EvaluationReport, threshold: Optional[float] = None) -> str:
    labels = list(report.confusion)
    abbr = [label[:3] for label in labels]
    width = max(len(label) for label in labels)
    gate = f" (gate >= {threshold:.2f})" if threshold is not None else " (report only)"
    lines = [
        f"backend={report.backend} models={','.join(report.model_versions)} n={report.n} "
        f"accuracy={report.accuracy:.4f}{gate} fallbacks={report.fallback_count}",
        "confusion matrix (rows = true, cols = predicted):",
        " " * (width + 2) + " ".join(f"{a:>4}" for a in abbr) + "  recall  prec    f1",
    ]
    for label in labels:
        m = report.per_label[label]
        cells = " ".join(f"{report.confusion[label].get(p, 0):>4}" for p in labels)
        lines.append(f"{label:<{width}}  {cells}  {m.recall:6.2f} {m.precision:5.2f} {m.f1:5.2f}")
    lines.append("legend: " + ", ".join(f"{a}={label}" for a, label in zip(abbr, labels)))
    return "\n".join(lines)
