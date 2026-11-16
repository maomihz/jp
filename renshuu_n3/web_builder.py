"""Emit modular static web frontend assets and lazy per-unit JSON payloads."""

from __future__ import annotations

import json
import shutil
from dataclasses import asdict
from pathlib import Path

from renshuu_n3.models import Curriculum, SynonymMatrix, Unit
from renshuu_n3.ruby import RUBY_TOKEN_PATTERN

WEB_STATIC_FILES: tuple[str, ...] = (
    "index.html",
    "styles/main.css",
    "js/app.js",
    "js/data.js",
    "js/ruby.js",
    "js/state.js",
    "js/views.js",
)


def _to_searchable_plain(text: str) -> str:
    return RUBY_TOKEN_PATTERN.sub(r"\1 \2", text).lower()


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def _build_manifest_payload(curriculum: Curriculum) -> dict[str, object]:
    renshuu_count = sum(1 for lesson in curriculum.lessons if isinstance(lesson.lesson_number, int))
    manifest_units: list[dict[str, object]] = []
    for unit in curriculum.units:
        unit_file = f"units/unit_{unit.unit_number:02d}.json"
        lesson_entries: list[dict[str, object]] = []
        for lesson in unit.lessons:
            grammar_index = [
                {
                    "id": gp.id,
                    "pattern": gp.pattern,
                    "pattern_ruby": gp.pattern_ruby,
                    "meaning_en": gp.meaning_en,
                    "mental_model_search": _to_searchable_plain(gp.mental_model),
                }
                for gp in lesson.grammar_points
            ]
            lesson_entries.append(
                {
                    "lesson_id": lesson.lesson_id,
                    "lesson_number": lesson.lesson_number,
                    "renshuu_title": lesson.renshuu_title,
                    "has_video": lesson.has_video,
                    "summary": lesson.summary,
                    "unit_number": unit.unit_number,
                    "grammar_index": grammar_index,
                }
            )
        manifest_units.append(
            {
                "unit_number": unit.unit_number,
                "unit_slug": unit.unit_slug,
                "unit_title": unit.unit_title,
                "unit_file": unit_file,
                "lessons": lesson_entries,
            }
        )

    manifest_matrices = [
        {
            "matrix_id": matrix.matrix_id,
            "title": matrix.title,
            "theme": matrix.theme,
            "decision_heuristic_search": _to_searchable_plain(matrix.decision_heuristic),
        }
        for matrix in curriculum.matrices
    ]

    return {
        "total_renshuu_lessons": renshuu_count,
        "total_lessons": len(curriculum.lessons),
        "total_grammar_points": curriculum.total_grammar_points,
        "total_questions": curriculum.total_questions,
        "units": manifest_units,
        "matrices": manifest_matrices,
    }


def _serialize_unit(unit: Unit) -> dict[str, object]:
    return asdict(unit)


def _serialize_matrices(matrices: tuple[SynonymMatrix, ...]) -> dict[str, list[dict[str, object]]]:
    return {"matrices": [asdict(matrix) for matrix in matrices]}


def build_web_site(curriculum: Curriculum, web_src_dir: Path, site_out_dir: Path) -> None:
    """Copy static frontend modules and emit split manifest + per-unit JSON datasets."""
    site_out_dir.mkdir(parents=True, exist_ok=True)
    for rel_path in WEB_STATIC_FILES:
        src = web_src_dir / rel_path
        dst = site_out_dir / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    data_dir = site_out_dir / "data"
    _write_json(data_dir / "manifest.json", _build_manifest_payload(curriculum))
    _write_json(data_dir / "matrices.json", _serialize_matrices(curriculum.matrices))
    for unit in curriculum.units:
        unit_path = data_dir / "units" / f"unit_{unit.unit_number:02d}.json"
        _write_json(unit_path, _serialize_unit(unit))
