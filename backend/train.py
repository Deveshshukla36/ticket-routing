"""
Trains the production intent-classification model.

Architecture: TF-IDF vectorizer + calibrated linear SVM.
This is the model actually served by the API in this environment (fast, dependency-light,
fully reproducible offline). `train_transformer.py` documents the BERT/RoBERTa fine-tuning
path referenced in the project spec for environments with model-hub access + a GPU.
"""
import json
import time

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

DATA_PATH = "data/tickets_dataset.csv"
MODEL_PATH = "models/intent_classifier.joblib"
METRICS_PATH = "models/metrics.json"

MODEL_B_PATH = "models/intent_classifier_b.joblib"
METRICS_B_PATH = "models/metrics_b.json"

def train_variant(X_train, y_train, X_test, y_test, kind="svm"):
    from sklearn.naive_bayes import MultinomialNB
    if kind == "svm":
        pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
            ("clf", CalibratedClassifierCV(LinearSVC(C=1.0, class_weight="balanced"), cv=3)),
        ])
        arch = "TF-IDF + Calibrated LinearSVC"
        version = "v1.0.0"
    else:
        pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 1), min_df=1)),
            ("clf", MultinomialNB(alpha=0.3)),
        ])
        arch = "TF-IDF (unigram) + Multinomial Naive Bayes"
        version = "v1.1.0-challenger"

    t0 = time.time()
    pipeline.fit(X_train, y_train)
    train_time = time.time() - t0
    preds = pipeline.predict(X_test)
    acc = accuracy_score(y_test, preds)
    f1 = f1_score(y_test, preds, average="weighted")
    report = classification_report(y_test, preds, output_dict=True)
    return pipeline, {
        "model_version": version,
        "architecture": arch,
        "accuracy": round(acc, 4),
        "f1_weighted": round(f1, 4),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "train_time_seconds": round(train_time, 3),
        "labels": sorted(set(y_train) | set(y_test)),
        "per_class": {k: v for k, v in report.items() if k in set(y_train)},
    }


def main():
    df = pd.read_csv(DATA_PATH)
    splitter = StratifiedShuffleSplit(test_size=0.2, random_state=42)
    train_idx, test_idx = next(splitter.split(df["text"], df["label"]))
    train_df, test_df = df.iloc[train_idx], df.iloc[test_idx]
    X_train, y_train = train_df["text"], train_df["label"]
    X_test, y_test = test_df["text"], test_df["label"]

    # Model A: production model (TF-IDF + calibrated linear SVM)
    pipeline_a, metrics_a = train_variant(X_train, y_train, X_test, y_test, kind="svm")
    joblib.dump(pipeline_a, MODEL_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics_a, f, indent=2)
    print(f"[Model A] Accuracy: {metrics_a['accuracy']:.4f}  F1: {metrics_a['f1_weighted']:.4f}")

    # Model B: challenger model (Naive Bayes) for A/B comparison in the dashboard
    pipeline_b, metrics_b = train_variant(X_train, y_train, X_test, y_test, kind="nb")
    joblib.dump(pipeline_b, MODEL_B_PATH)
    with open(METRICS_B_PATH, "w") as f:
        json.dump(metrics_b, f, indent=2)
    print(f"[Model B] Accuracy: {metrics_b['accuracy']:.4f}  F1: {metrics_b['f1_weighted']:.4f}")

    print(f"Saved models to {MODEL_PATH} and {MODEL_B_PATH}")

if __name__ == "__main__":
    main()
