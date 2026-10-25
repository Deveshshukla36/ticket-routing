"""
Reference implementation: fine-tuning BERT / RoBERTa for intent classification.

This is the training path referenced in the project spec. It requires downloading
pretrained weights from the Hugging Face Hub and, practically, a GPU — neither of
which is available in this sandboxed build environment (no huggingface.co egress).
It is included so the transformer architecture, training loop, and evaluation are
fully specified and runnable as-is in a normal ML environment (Colab, SageMaker, etc).

The API in this repo serves `models/intent_classifier.joblib` (TF-IDF + linear SVM)
as the actual production model — see train.py and ml/classifier.py. Swapping this
transformer checkpoint in only requires changing ml/classifier.py's `.predict()` to call
`model(**tokenizer(text, return_tensors="pt"))` instead of `pipeline.predict_proba`.

Usage (outside this sandbox):
    pip install transformers torch datasets accelerate
    python train_transformer.py --model_name roberta-base --epochs 3
"""
import argparse
import json

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from torch.utils.data import Dataset


class TicketDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, label2id, max_len=128):
        self.encodings = tokenizer(list(texts), truncation=True, padding=True, max_length=max_len)
        self.labels = [label2id[lab] for lab in labels]

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=1)
    return {
        "accuracy": accuracy_score(labels, preds),
        "f1_weighted": f1_score(labels, preds, average="weighted"),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_name", default="bert-base-uncased",
                         choices=["bert-base-uncased", "roberta-base"])
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    args = parser.parse_args()

    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )

    df = pd.read_csv("data/tickets_dataset.csv")
    labels = sorted(df["label"].unique())
    label2id = {lab: i for i, lab in enumerate(labels)}
    id2label = {i: lab for lab, i in label2id.items()}

    train_df, test_df = train_test_split(df, test_size=0.2, stratify=df["label"], random_state=42)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name, num_labels=len(labels), id2label=id2label, label2id=label2id
    )

    train_ds = TicketDataset(train_df["text"], train_df["label"], tokenizer, label2id)
    test_ds = TicketDataset(test_df["text"], test_df["label"], tokenizer, label2id)

    training_args = TrainingArguments(
        output_dir="./checkpoints",
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1_weighted",
        logging_steps=10,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=test_ds,
        compute_metrics=compute_metrics,
    )

    trainer.train()
    metrics = trainer.evaluate()
    print(json.dumps(metrics, indent=2))

    model.save_pretrained(f"./models/{args.model_name}-intent-classifier")
    tokenizer.save_pretrained(f"./models/{args.model_name}-intent-classifier")


if __name__ == "__main__":
    main()
