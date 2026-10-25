# Data

| File | What it is |
|---|---|
| `generate_dataset.py` | Generates the **synthetic** training set: 120 sentence templates (15 per category) × 8 slot-filled, lightly noised variants, plus 4% deliberately flipped labels. Seeded (`random.seed(42)`). |
| `tickets_dataset.csv` | Output of the generator: 960 rows, 673 unique texts, `text,label,template_id`. Used for training only. |
| `holdout.json` | **Independent evaluation set**: 200 hand-written tickets, 25 per category. Not used for training. |
| `holdout.schema.json` | JSON Schema for `holdout.json`. |
| `build_holdout.py` | Validates the holdout: schema, labels, ≥25 per category, ≥200 total, no duplicates, and no near-duplicates of training text. Optionally rewrites it in canonical order. |

## Why the holdout is not sampled from `tickets_dataset.csv`

Every row in the CSV comes from one of 120 templates. Any split of the CSV,
even one that removes exact duplicates, puts sentences built from the same
templates on both sides. In that case accuracy measures how well the model
remembers templates. These numbers for sklearn Variant A were measured on
2026-10-25:

| Evaluation | Accuracy |
|---|---|
| Original random 80/20 split (78 of 192 test rows appear word-for-word in training) | 92.2% |
| Random split with exact duplicates removed (templates still shared) | 98.6% |
| 5-fold split by template (templates never seen in training) | 55.8% ± 5.2% |
| **This holdout (independent hand-written tickets)** | **63.5%** |

The independent holdout is the number to report. It is the only one that
reflects how the model handles phrasing it has never seen.

## How the holdout was made

- The tickets were drafted by an AI assistant with no access to the
  generator templates during writing. The project maintainer then reviewed
  them. Each one was written to match a category's meaning, not its
  template wording.
- `build_holdout.py` enforces independence. It fails if any holdout text
  has token Jaccard similarity ≥ 0.7 with any training text. The current
  maximum is 0.41.
- Some labels are judgement calls at category boundaries: Bug Report vs
  Technical Issue, and Complaint vs whatever the complaint is about. That
  reflects real support traffic. Any label change must be a reviewed
  commit.

### Labelling guide

| Category | Means |
|---|---|
| Account Access | The person can't get into their account: login, password, 2FA/SSO, lockout, compromised account, ownership |
| Billing | Money: charges, invoices, refunds, payment methods, tax, pricing on a bill |
| Bug Report | The product works but gives a *wrong result*: wrong data, wrong behaviour, broken layout, reproducible defect |
| Technical Issue | The product *doesn't work*: outage, crash, won't load, errors, slowness, failed connection or sync |
| Cancellation | Ending, pausing or downgrading a subscription, contract or add-on |
| Complaint | Dissatisfaction with the service or support experience itself |
| Feature Request | Asking for a capability that doesn't exist yet |
| General Inquiry | Questions about the product, policies, plans or company, with no problem to fix |

## Commands (run from `backend/`)

```bash
python data/build_holdout.py          # validate; exit 1 on any problem
python data/build_holdout.py --write  # validate, then rewrite grouped by label (seeded order)
pytest -m accuracy                    # accuracy gates + confusion matrices
```
