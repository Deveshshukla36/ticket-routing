"""Torch-free data preparation for the RoBERTa fine-tune (unit-tested in CI).

Three disjoint sets, each with one job:
  train       tickets_dataset.csv minus the validation templates  -> fit the weights
  validation  whole templates held out of train (template-disjoint) -> pick the epoch
  holdout     data/holdout.json, hand-written, never seen in training -> report accuracy

The old script split rows at random, so every validation/test sentence came from a
template also present in training, and it chose the checkpoint by test-set F1. Here
validation shares no template (and no text) with train, the checkpoint is chosen by
validation loss, and the holdout is only touched once, after training.
"""
import csv
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Sequence, Set

from ml.classifier import ROUTING_TABLE
from ml.evaluation import TRAINING_PATH, load_holdout, validate_holdout

LABELS: List[str] = sorted(ROUTING_TABLE)  # label order == id order in the model config


@dataclass(frozen=True)
class Example:
    text: str
    label: str
    template_id: int


@dataclass(frozen=True)
class Split:
    train: List[Example]
    validation: List[Example]
    validation_templates: List[int] = field(default_factory=list)

    def summary(self) -> Dict[str, object]:
        return {
            "train_rows": len(self.train),
            "train_templates": len({e.template_id for e in self.train}),
            "validation_rows": len(self.validation),
            "validation_templates": len(self.validation_templates),
            "validation_per_label": dict(sorted(Counter(e.label for e in self.validation).items())),
        }


def load_training_rows(path: Path = TRAINING_PATH) -> List[Example]:
    with open(path, encoding="utf-8") as f:
        return [Example(r["text"], r["label"], int(r["template_id"])) for r in csv.DictReader(f)]


def template_labels(rows: Sequence[Example]) -> Dict[int, str]:
    """Majority label per template. The generator flips ~4% of labels on purpose; a
    template's majority label is its true label."""
    votes: Dict[int, Counter[str]] = defaultdict(Counter)
    for r in rows:
        votes[r.template_id][r.label] += 1
    return {tid: c.most_common(1)[0][0] for tid, c in votes.items()}


def template_disjoint_split(rows: Sequence[Example], val_templates_per_label: int = 3, seed: int = 42) -> Split:
    """Hold out whole templates for validation (stratified by label, seeded)."""
    true_label = template_labels(rows)
    by_label: Dict[str, List[int]] = defaultdict(list)
    for tid, label in sorted(true_label.items()):
        by_label[label].append(tid)

    rng = random.Random(seed)
    val_tids: Set[int] = set()
    for label in sorted(by_label):
        tids = by_label[label]
        if len(tids) <= val_templates_per_label:
            raise ValueError(f"label {label!r} has only {len(tids)} templates; cannot hold out {val_templates_per_label}")
        val_tids.update(rng.sample(tids, val_templates_per_label))

    # Training keeps the recorded labels (noise included). Validation uses each template's
    # true label and drops repeated sentences, so it measures generalisation, not noise.
    train = [r for r in rows if r.template_id not in val_tids]
    validation: List[Example] = []
    seen: Set[str] = set()
    for r in rows:
        if r.template_id in val_tids and r.text not in seen:
            seen.add(r.text)
            validation.append(Example(r.text, true_label[r.template_id], r.template_id))

    overlap = {e.text for e in train} & {e.text for e in validation}
    if overlap:
        raise AssertionError(f"{len(overlap)} validation texts also appear in train")
    return Split(train=train, validation=validation, validation_templates=sorted(val_tids))


def assert_holdout_independent(train_texts: Sequence[str]) -> int:
    """Fail loudly if the holdout is malformed or near-duplicates any training text."""
    holdout = load_holdout()
    problems = validate_holdout(holdout, LABELS, list(train_texts))
    if problems:
        raise AssertionError("holdout is not independent of the training data:\n  " + "\n  ".join(problems))
    return len(holdout)
