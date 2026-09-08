# Backward compatibility shim
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))

from ml.classifier import (
    IntentClassifier,
    get_classifier,
    ROUTING_TABLE,
    MODEL_PATH,
    METRICS_PATH,
    MODEL_B_PATH,
    METRICS_B_PATH,
)

__all__ = [
    "IntentClassifier",
    "get_classifier",
    "ROUTING_TABLE",
    "MODEL_PATH",
    "METRICS_PATH",
    "MODEL_B_PATH",
    "METRICS_B_PATH",
]
