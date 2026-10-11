"""
ApplyReady AI — Training Script for Document Classifier
Run this script standalone to retrain and evaluate the classifier.

Usage (from ml-service/ directory, with venv312 active):
    .\\venv312\\Scripts\\python.exe train_classifier.py

Output:
    - models/vectorizer.pkl
    - models/classifier.pkl
    - Evaluation report printed to console

NOTE: This uses a small toy/demo dataset. Results are NOT production metrics.
"""

import os
import sys

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_predict
    from sklearn.metrics import (
        classification_report,
        confusion_matrix,
        accuracy_score,
    )
    import pickle
except (ImportError, Exception) as e:
    print(f"ERROR: scikit-learn is not available: {e}")
    print(
        "If you are on Windows with Application Control enabled, "
        "the murmurhash DLL may be blocked. Run on a different machine or WSL2."
    )
    sys.exit(1)

from classifier import TRAINING_DATA, _MODEL_DIR

MODEL_PATH = os.path.join(_MODEL_DIR, "classifier.pkl")
VEC_PATH = os.path.join(_MODEL_DIR, "vectorizer.pkl")


def train_and_evaluate():
    print("=" * 60)
    print("ApplyReady AI — Document Classifier Training")
    print("Dataset: Toy/Demo (18 samples, manually labelled)")
    print("Categories: resume, marksheet, certificate")
    print("=" * 60)

    texts = [d[0] for d in TRAINING_DATA]
    labels = [d[1] for d in TRAINING_DATA]

    print(f"\nDataset size: {len(texts)} samples")
    from collections import Counter
    dist = Counter(labels)
    for label, count in dist.items():
        print(f"  {label}: {count} samples")

    # ── Train final model ──────────────────────────────────────────────────
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        max_features=500,
        stop_words="english",
        sublinear_tf=True,
    )
    X = vectorizer.fit_transform(texts)

    clf = LogisticRegression(
        max_iter=200,
        random_state=42,
        class_weight="balanced",
        C=1.0,
    )
    clf.fit(X, labels)

    # ── Cross-validation evaluation ────────────────────────────────────────
    print("\n--- Cross-Validation Evaluation (StratifiedKFold, k=3) ---")
    print("NOTE: With only 18 samples, these metrics are illustrative only.")

    if len(texts) >= 6:
        cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
        # Use same pipeline for CV
        from sklearn.pipeline import Pipeline
        pipe = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=500,
                                      stop_words="english", sublinear_tf=True)),
            ("clf", LogisticRegression(max_iter=200, random_state=42,
                                       class_weight="balanced", C=1.0)),
        ])
        y_pred = cross_val_predict(pipe, texts, labels, cv=cv)
        print(f"\nAccuracy (CV): {accuracy_score(labels, y_pred):.2%}")
        print("\nClassification Report (CV):")
        print(classification_report(labels, y_pred, target_names=["certificate", "marksheet", "resume"]))
        print("Confusion Matrix (CV):")
        print(confusion_matrix(labels, y_pred, labels=["resume", "marksheet", "certificate"]))
        print("  Rows: actual, Columns: predicted  [resume, marksheet, certificate]")
    else:
        print("Too few samples for meaningful cross-validation.")

    # ── Save ──────────────────────────────────────────────────────────────
    os.makedirs(_MODEL_DIR, exist_ok=True)
    with open(VEC_PATH, "wb") as f:
        pickle.dump(vectorizer, f)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)

    print(f"\nModel saved: {MODEL_PATH}")
    print(f"Vectorizer saved: {VEC_PATH}")
    print("\n--- Top Features per Class ---")
    feature_names = vectorizer.get_feature_names_out()
    for i, class_name in enumerate(clf.classes_):
        top_indices = clf.coef_[i].argsort()[-8:][::-1]
        top_features = [feature_names[j] for j in top_indices]
        print(f"  {class_name}: {', '.join(top_features)}")

    print("\nTraining complete.")


if __name__ == "__main__":
    train_and_evaluate()
