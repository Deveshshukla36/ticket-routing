"""Validate (and optionally canonicalise) the independent holdout set.

The holdout is hand-written and independent of generate_dataset.py's templates; see
data/README.md for why it is not sampled from tickets_dataset.csv. This script never
adds, drops, or relabels examples: it only checks them and rewrites formatting.

Usage (from backend/):
    python data/build_holdout.py            # validate, exit 1 on any problem
    python data/build_holdout.py --write    # validate, then rewrite in canonical order
"""
import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml.classifier import ROUTING_TABLE  # noqa: E402
from ml.evaluation import (  # noqa: E402
    HOLDOUT_PATH,
    TRAINING_PATH,
    load_holdout,
    load_training_texts,
    validate_holdout,
)

SEED = 42


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--holdout", type=Path, default=HOLDOUT_PATH)
    parser.add_argument("--training", type=Path, default=TRAINING_PATH)
    parser.add_argument("--max-similarity", type=float, default=0.7,
                        help="fail if any holdout text has token Jaccard >= this with a training text")
    parser.add_argument("--write", action="store_true", help="rewrite the holdout in canonical order")
    args = parser.parse_args()

    labels = sorted(ROUTING_TABLE)
    examples = load_holdout(args.holdout)
    problems = validate_holdout(examples, labels, load_training_texts(args.training),
                                max_similarity=args.max_similarity)

    counts = {label: sum(ex.label == label for ex in examples) for label in labels}
    print(f"{len(examples)} examples: " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    if problems:
        print(f"{len(problems)} problem(s):", *problems, sep="\n  - ")
        return 1
    print("OK: valid, balanced, and no near-duplicates of training data")

    if args.write:
        # Group by label, then a seeded shuffle within each label: stable diffs, no ordering bias.
        rng = random.Random(SEED)
        ordered = []
        for label in labels:
            group = sorted((ex for ex in examples if ex.label == label), key=lambda ex: ex.text)
            rng.shuffle(group)
            ordered.extend(group)
        body = ",\n".join(json.dumps(ex.model_dump(), ensure_ascii=False) for ex in ordered)
        args.holdout.write_text(f"[\n{body}\n]\n", encoding="utf-8")
        print(f"wrote {args.holdout}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
