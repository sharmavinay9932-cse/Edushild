import pickle
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .config import DATASET_PATH, MODEL_PATH

FACTOR_EXPLANATIONS = {
    "Attendance": (
        "Attendance pattern",
        "Attendance is one of the recorded areas associated with this analysis.",
        "Ask about schedule, transport, health, or engagement barriers before planning support.",
    ),
    "Internal marks": (
        "Internal assessment progress",
        "Internal assessment performance is associated with this analysis.",
        "Offer a subject-level check-in, tutoring, or help planning upcoming assessments.",
    ),
    "Previous GPA": (
        "Previous academic progress",
        "Previous academic progress is associated with this analysis.",
        "Discuss which subjects feel difficult and agree on a manageable study plan.",
    ),
    "Backlogs": (
        "Uncleared subjects",
        "Uncleared subjects are associated with this analysis.",
        "Review backlog subjects and identify a realistic catch-up plan with an adviser.",
    ),
    "Financial conditions": (
        "Financial context",
        "Recorded financial context is associated with this analysis.",
        "Offer confidential information about available financial support without making assumptions.",
    ),
}


class PredictionUnavailableError(RuntimeError):
    pass


class DropoutPredictor:
    def __init__(self, model_path: Path, dataset_path: Path):
        try:
            package = joblib.load(model_path)
        except FileNotFoundError as error:
            raise PredictionUnavailableError("The configured dropout model file was not found.") from error
        except (ImportError, AttributeError, EOFError, pickle.UnpicklingError, ValueError) as error:
            raise PredictionUnavailableError("The configured dropout model could not be loaded.") from error

        if not isinstance(package, dict):
            raise PredictionUnavailableError("The configured model is not a dropout classifier package.")

        self.model = package.get("model")
        self.model_name = str(package.get("model_name", "EduShield dropout model"))
        self.model_version = str(package.get("version", "unspecified"))
        try:
            self.threshold = float(package["threshold"])
            self.feature_columns = [str(column) for column in package["features"]]
            model_features = [str(column) for column in self.model.feature_names_in_]
            self.dropout_class_index = list(self.model.classes_).index(1)
        except (AttributeError, KeyError, TypeError, ValueError) as error:
            raise PredictionUnavailableError("The dropout model package is missing required metadata.") from error
        if (
            not 0 <= self.threshold <= 1
            or not self.feature_columns
            or self.feature_columns != model_features
            or set(self.feature_columns) != set(FACTOR_EXPLANATIONS)
            or package.get("target") not in (None, "dropout", "Dropout label")
        ):
            raise PredictionUnavailableError("The dropout model package contains invalid threshold or feature metadata.")
        if not callable(getattr(self.model, "predict_proba", None)):
            raise PredictionUnavailableError("The configured dropout model does not provide probabilities.")

        try:
            dataset = pd.read_csv(dataset_path, dtype={"Dataset ID": str})
        except (OSError, UnicodeDecodeError, ValueError, pd.errors.EmptyDataError, pd.errors.ParserError) as error:
            raise PredictionUnavailableError("The configured student dataset could not be read for prediction.") from error

        missing_columns = {"Dataset ID", *self.feature_columns} - set(dataset.columns)
        if missing_columns:
            raise PredictionUnavailableError("The student dataset is missing one or more model input columns.")
        dataset["Dataset ID"] = dataset["Dataset ID"].str.strip()
        if dataset["Dataset ID"].isna().any() or dataset["Dataset ID"].duplicated().any():
            raise PredictionUnavailableError("The student dataset contains missing or duplicate student IDs.")

        self.student_features = dataset.set_index("Dataset ID")[self.feature_columns]

    def _explain(self, features: pd.DataFrame, predicted_dropout: bool) -> tuple[str, list[dict]]:
        try:
            preprocessor = self.model.named_steps["preprocessing"]
            classifier = self.model.named_steps["classifier"]
            transformed = preprocessor.transform(features)
            transformed = transformed.toarray() if hasattr(transformed, "toarray") else np.asarray(transformed)
            feature_names = preprocessor.get_feature_names_out()
            coefficients = np.asarray(classifier.coef_)
            if (
                transformed.ndim != 2
                or transformed.shape[0] != 1
                or transformed.shape[1] != len(feature_names)
                or coefficients.shape != (1, len(feature_names))
                or len(classifier.classes_) != 2
                or not np.isfinite(transformed).all()
                or not np.isfinite(coefficients).all()
            ):
                raise ValueError("The classifier explanation metadata is incompatible.")

            direction = 1 if self.dropout_class_index == 1 else -1
            contributions = transformed[0] * coefficients[0] * direction
            grouped = {}
            for name, contribution in zip(feature_names, contributions):
                feature_name = str(name)
                if feature_name.startswith("numeric__"):
                    source_name = feature_name.removeprefix("numeric__")
                elif feature_name.startswith("categorical__Financial conditions_"):
                    source_name = "Financial conditions"
                else:
                    raise ValueError("A model feature has no explanation mapping.")
                if source_name not in FACTOR_EXPLANATIONS:
                    raise ValueError("A model feature has no explanation text.")
                grouped[source_name] = grouped.get(source_name, 0.0) + float(contribution)
            if not all(np.isfinite(value) for value in grouped.values()):
                raise ValueError("The classifier returned invalid explanation values.")
        except (AttributeError, IndexError, KeyError, TypeError, ValueError) as error:
            raise PredictionUnavailableError(
                "The dropout model could not produce a reliable factor analysis."
            ) from error

        contributing = sorted(
            ((name, value) for name, value in grouped.items() if value > 0),
            key=lambda item: item[1],
            reverse=True,
        )[:3]
        factors = [
            {
                "factor": FACTOR_EXPLANATIONS[name][0],
                "explanation": FACTOR_EXPLANATIONS[name][1],
                "support": FACTOR_EXPLANATIONS[name][2],
            }
            for name, _ in contributing
        ]

        if factors and predicted_dropout:
            analysis = (
                "The AI analysis suggests additional support may be helpful. "
                "The factors below are associated patterns, not confirmed causes."
            )
        elif factors:
            analysis = (
                "No elevated support concern was identified. The factors below "
                "may still guide a supportive check-in; they are not confirmed causes."
            )
        else:
            analysis = (
                "The available record did not show clear contributing factors for "
                "this assessment. A supportive conversation may reveal context "
                "that is not captured in the dataset."
            )
        support_plan = [
            "If the student is considering leaving, arrange a private, non-judgmental check-in and ask what is making them consider it.",
            *[factor["support"] for factor in factors],
            "Agree on one manageable next step with the student, connect them to the right campus support, and arrange a follow-up check-in.",
        ]
        return analysis, factors, support_plan

    def predict(self, student_id: str) -> dict:
        if student_id not in self.student_features.index:
            raise PredictionUnavailableError("No matching source-dataset row is available for this student.")
        features = self.student_features.loc[[student_id]]
        return self._predict_features(features, student_id)

    def predict_features(self, values: dict[str, object]) -> dict:
        if set(values) != set(self.feature_columns):
            raise PredictionUnavailableError("Manual prediction inputs do not match the model features.")
        features = pd.DataFrame(
            [{column: values[column] for column in self.feature_columns}],
            columns=self.feature_columns,
        )
        return self._predict_features(features, None)

    def _predict_features(self, features: pd.DataFrame, student_id: str | None) -> dict:
        try:
            probability = float(self.model.predict_proba(features)[0][self.dropout_class_index])
        except (IndexError, TypeError, ValueError) as error:
            raise PredictionUnavailableError("The dropout model could not process this student's dataset row.") from error
        if not np.isfinite(probability) or not 0 <= probability <= 1:
            raise PredictionUnavailableError("The dropout model returned an invalid probability.")

        predicted_dropout = probability >= self.threshold
        analysis, factors, support_plan = self._explain(features, predicted_dropout)
        return {
            "studentId": student_id,
            "predictedDropout": predicted_dropout,
            "probability": probability,
            "analysis": analysis,
            "factors": factors,
            "supportPlan": support_plan,
        }


@lru_cache(maxsize=1)
def get_dropout_predictor() -> DropoutPredictor:
    return DropoutPredictor(MODEL_PATH, DATASET_PATH)
