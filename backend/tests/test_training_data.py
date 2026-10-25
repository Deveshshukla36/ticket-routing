from ml.training_data import (
    LABELS,
    assert_holdout_independent,
    load_training_rows,
    template_disjoint_split,
    template_labels,
)

ROWS = load_training_rows()


def test_validation_is_template_and_text_disjoint_from_train():
    split = template_disjoint_split(ROWS)
    train_tids = {e.template_id for e in split.train}
    assert train_tids.isdisjoint(split.validation_templates)
    assert {e.text for e in split.train}.isdisjoint({e.text for e in split.validation})
    assert len(split.train) + sum(1 for r in ROWS if r.template_id in split.validation_templates) == len(ROWS)


def test_validation_is_stratified_and_uses_true_labels():
    split = template_disjoint_split(ROWS, val_templates_per_label=3)
    assert len(split.validation_templates) == 3 * len(LABELS)
    true_label = template_labels(ROWS)
    assert all(e.label == true_label[e.template_id] for e in split.validation)
    assert set(split.summary()["validation_per_label"]) == set(LABELS)


def test_split_is_deterministic_per_seed():
    a = template_disjoint_split(ROWS, seed=42).validation_templates
    assert a == template_disjoint_split(ROWS, seed=42).validation_templates
    assert a != template_disjoint_split(ROWS, seed=7).validation_templates


def test_holdout_is_independent_of_the_training_split():
    split = template_disjoint_split(ROWS)
    assert assert_holdout_independent([e.text for e in split.train]) == 200


def test_label_order_matches_the_api_client():
    from ml.roberta_client import INTENT_LABELS

    assert LABELS == INTENT_LABELS  # LABEL_<n> from the hub model maps through this order


def test_hub_uploader_expects_the_same_label_order():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "scripts" / "push_to_hub.py"
    spec = importlib.util.spec_from_file_location("push_to_hub", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.EXPECTED_LABELS == LABELS
