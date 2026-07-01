import csv
import hashlib
import json
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.repositories import get_db_session
from app.schemas.dashboard import BenchmarkComparisonSummary, BenchmarkMismatchRow, BenchmarkSplitMetrics
from app.services.campaign_service import campaign_service


class BenchmarkEvaluationService:
    """On-demand professor benchmark comparison for workflow/campaign result dashboards."""

    def __init__(self, db_session_factory=get_db_session, benchmark_path: Path | None = None):
        self.db_session_factory = db_session_factory
        self.benchmark_path = benchmark_path or Path(__file__).resolve().parents[3] / "Updates" / "Test - Summary of all laws.csv"

    def _read_professor_benchmark(self) -> list[dict[str, str]]:
        if not self.benchmark_path.exists():
            raise HTTPException(status_code=404, detail=f"Professor benchmark CSV not found at {self.benchmark_path}")
        with self.benchmark_path.open(newline="", encoding="utf-8-sig") as handle:
            return list(csv.DictReader(handle))

    @staticmethod
    def _basename(value: str) -> str:
        return Path(str(value or "").strip()).name.lower()

    @staticmethod
    def _parse_bool(value: Any) -> bool | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"true", "t", "yes", "y", "1"}:
            return True
        if text in {"false", "f", "no", "n", "0"}:
            return False
        return None

    @staticmethod
    def _parse_rank(value: Any) -> int | None:
        if value is None or value == "":
            return None
        try:
            number = float(str(value).strip())
        except (TypeError, ValueError):
            return None
        if number.is_integer() and 0 <= int(number) <= 4:
            return int(number)
        return None

    @staticmethod
    def _pick_rationale(coded_values: dict[str, Any], workflow_context: dict[str, Any] | None) -> str | None:
        candidates = [
            coded_values.get("discretion_rank_reasoning"),
            coded_values.get("discretion_rationale"),
            coded_values.get("rank_evidence"),
        ]
        context = workflow_context or {}
        for key in (
            "discretion_rank.discretion_rationale",
            "discretion_rank.rank_evidence",
            "discretion.discretion_rationale",
            "discretion.discretion_rank_rationale",
        ):
            candidates.append(context.get(key))
        for value in candidates:
            if value is None or value == "":
                continue
            if isinstance(value, (dict, list)):
                return json.dumps(value, ensure_ascii=False)
            return str(value)
        return None

    @staticmethod
    def _mismatch_reason(
        expected_delegate: bool | None,
        predicted_delegate: bool | None,
        expected_rank: int | None,
        predicted_rank: int | None,
    ) -> str:
        if predicted_delegate is None and predicted_rank is None:
            return "missing_prediction"
        if expected_delegate is not None and predicted_delegate is not None and expected_delegate != predicted_delegate:
            return "delegation_mismatch"
        if expected_rank is None or predicted_rank is None:
            return "missing_rank"
        if predicted_rank > expected_rank:
            return "model_over_ranking"
        if predicted_rank < expected_rank:
            return "model_under_ranking"
        return "matched"

    @staticmethod
    def _percent(matches: int, total: int) -> float | None:
        if total <= 0:
            return None
        return round((matches / total) * 100, 1)

    def _split_for_filename(self, filename: str) -> str:
        """Stable 70/30 calibration/holdout split by benchmark filename."""
        digest = hashlib.sha256(self._basename(filename).encode("utf-8")).hexdigest()
        bucket = int(digest[:8], 16) % 10
        return "holdout" if bucket >= 7 else "calibration"

    def _finalize_split_metrics(self, raw: dict[str, dict[str, Any]]) -> dict[str, BenchmarkSplitMetrics]:
        finalized: dict[str, BenchmarkSplitMetrics] = {}
        for split_name in ("calibration", "holdout"):
            data = raw.get(split_name, {"matched_rows": 0, "rank_total": 0, "exact": 0, "within_one": 0, "errors": []})
            errors = data.get("errors") or []
            rank_total = int(data.get("rank_total") or 0)
            exact = int(data.get("exact") or 0)
            within_one = int(data.get("within_one") or 0)
            finalized[split_name] = BenchmarkSplitMetrics(
                matched_rows=int(data.get("matched_rows") or 0),
                rank_total=rank_total,
                exact_rank_matches=exact,
                exact_rank_accuracy=self._percent(exact, rank_total),
                within_one_rank_matches=within_one,
                within_one_rank_accuracy=self._percent(within_one, rank_total),
                mean_absolute_error=round(sum(errors) / len(errors), 3) if errors else None,
            )
        return finalized

    def compare_professor_benchmark(self, dashboard_id: str) -> BenchmarkComparisonSummary:
        benchmark_rows = self._read_professor_benchmark()
        benchmark_by_filename = {
            self._basename(row.get("Filename", "")): row
            for row in benchmark_rows
            if row.get("Filename")
        }

        with self.db_session_factory() as session:
            dashboard = session.dashboards.get_by_id(dashboard_id)
        if not dashboard:
            raise HTTPException(status_code=404, detail="Dashboard not found.")

        documents = campaign_service.list_campaign_documents(dashboard_id)
        matched_rows = []
        missing_dashboard_rows = 0

        delegate_total = 0
        delegate_matches = 0
        rank_total = 0
        exact_rank_matches = 0
        within_one_rank_matches = 0
        absolute_errors: list[int] = []
        mismatches: list[BenchmarkMismatchRow] = []
        confusion_matrix: dict[str, dict[str, int]] = {str(i): {str(j): 0 for j in range(5)} for i in range(5)}
        split_raw: dict[str, dict[str, Any]] = {
            "calibration": {"matched_rows": 0, "rank_total": 0, "exact": 0, "within_one": 0, "errors": []},
            "holdout": {"matched_rows": 0, "rank_total": 0, "exact": 0, "within_one": 0, "errors": []},
        }

        for doc in documents:
            benchmark = benchmark_by_filename.get(self._basename(doc.filename))
            if not benchmark:
                missing_dashboard_rows += 1
                continue
            matched_rows.append(doc)
            split = self._split_for_filename(benchmark.get("Filename") or doc.filename)
            split_raw[split]["matched_rows"] += 1

            coded = doc.coded_values or {}
            expected_delegate = self._parse_bool(benchmark.get("DelegationLaw (Y/N)"))
            predicted_delegate = self._parse_bool(coded.get("delegate_law"))
            expected_rank = self._parse_rank(
                benchmark.get("RG_Discretion_Rank") or 
                benchmark.get("Discretion_Rank") or 
                benchmark.get("discretion_rank")
            )
            predicted_rank = self._parse_rank(coded.get("discretion_rank"))

            if expected_delegate is not None and predicted_delegate is not None:
                delegate_total += 1
                if expected_delegate == predicted_delegate:
                    delegate_matches += 1

            rank_difference = None
            exact_match = False
            within_one = False
            if expected_rank is not None and predicted_rank is not None:
                rank_total += 1
                rank_difference = predicted_rank - expected_rank
                exact_match = rank_difference == 0
                within_one = abs(rank_difference) <= 1
                exact_rank_matches += 1 if exact_match else 0
                within_one_rank_matches += 1 if within_one else 0
                absolute_errors.append(abs(rank_difference))
                confusion_matrix[str(expected_rank)][str(predicted_rank)] += 1
                split_raw[split]["rank_total"] += 1
                split_raw[split]["exact"] += 1 if exact_match else 0
                split_raw[split]["within_one"] += 1 if within_one else 0
                split_raw[split]["errors"].append(abs(rank_difference))

            reason = self._mismatch_reason(expected_delegate, predicted_delegate, expected_rank, predicted_rank)
            if reason != "matched":
                mismatches.append(
                    BenchmarkMismatchRow(
                        document_id=doc.document_id,
                        filename=doc.filename,
                        split=split,
                        expected_delegate_law=expected_delegate,
                        predicted_delegate_law=predicted_delegate,
                        expected_discretion_rank=expected_rank,
                        predicted_discretion_rank=predicted_rank,
                        rank_difference=rank_difference,
                        exact_rank_match=exact_match,
                        within_one_rank=within_one,
                        model_rationale=self._pick_rationale(coded, doc.workflow_context),
                        likely_mismatch_reason=reason,
                    )
                )

        source_warning = (
            "Professor benchmark labels were created from CQ summaries / major-provisions text. "
            "Use these metrics only for summary-aligned dashboard rows; full statutory text runs should be treated as exploratory."
        )
        source_alignment = "summary_required_unverified"
        if dashboard.get("dashboard_type") == "workflow":
            source_alignment = "workflow_dashboard_summary_required_unverified"

        return BenchmarkComparisonSummary(
            benchmark_name="Professor CQ summary benchmark",
            benchmark_rows=len(benchmark_rows),
            dashboard_rows=len(documents),
            matched_rows=len(matched_rows),
            missing_dashboard_rows=missing_dashboard_rows,
            source_set="CQ summaries / major-provisions benchmark",
            source_alignment=source_alignment,
            source_warning=source_warning,
            delegate_total=delegate_total,
            delegate_matches=delegate_matches,
            delegate_accuracy=self._percent(delegate_matches, delegate_total),
            rank_total=rank_total,
            exact_rank_matches=exact_rank_matches,
            exact_rank_accuracy=self._percent(exact_rank_matches, rank_total),
            within_one_rank_matches=within_one_rank_matches,
            within_one_rank_accuracy=self._percent(within_one_rank_matches, rank_total),
            mean_absolute_error=round(sum(absolute_errors) / len(absolute_errors), 3) if absolute_errors else None,
            split_metrics=self._finalize_split_metrics(split_raw),
            confusion_matrix=confusion_matrix,
            mismatches=mismatches,
        )


benchmark_evaluation_service = BenchmarkEvaluationService()
