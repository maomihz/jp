"""Boundary parser and validator converting raw JSON into immutable curriculum models."""

from __future__ import annotations

import json
import re
from pathlib import Path

from renshuu_n3.models import (
    EXPECTED_BRIDGE_IDS,
    EXPECTED_MATRIX_COLUMNS,
    EXPECTED_RENSHUU_TITLES,
    EXPECTED_UNIT_FILES,
    QUESTION_TYPE_VALUES,
    REGISTER_VALUES,
    STATUS_VALUES,
    ContrastRow,
    Curriculum,
    ExampleSentence,
    FormationRule,
    GrammarPoint,
    Lesson,
    LessonContrast,
    MinimalPair,
    QuestionType,
    QuizQuestion,
    Register,
    RenshuuStatus,
    SynonymMatrix,
    Unit,
)
from renshuu_n3.ruby import (
    ValidationError,
    check_balanced_delimiters,
    check_literal_field,
    check_ruby_field,
    strip_ruby_to_surface,
)

SLUG_PATTERN = re.compile(r"^[a-z0-9-]+$")
REGISTER_MAP: dict[str, Register] = {value: value for value in REGISTER_VALUES}
STATUS_MAP: dict[str, RenshuuStatus] = {value: value for value in STATUS_VALUES}
QUESTION_TYPE_MAP: dict[str, QuestionType] = {value: value for value in QUESTION_TYPE_VALUES}


def _require_str(
    mapping: dict[str, object],
    key: str,
    location: str,
    errors: list[ValidationError],
    *,
    min_length: int = 1,
    ruby_mode: str = "delimited",
) -> str:
    """Validate and extract a non-empty string with explicit ruby/literal rules."""
    raw_value = mapping.get(key)
    if not isinstance(raw_value, str) or not raw_value.strip():
        errors.append(ValidationError(location, f"Missing or empty string field '{key}'"))
        return ""
    if len(raw_value.strip()) < min_length:
        errors.append(
            ValidationError(
                location,
                f"Field '{key}' is too short ({len(raw_value.strip())} < {min_length} chars)",
            )
        )

    field_loc = f"{location}.{key}"
    if ruby_mode == "strict_ruby":
        check_ruby_field(raw_value, field_loc, True, errors)
    elif ruby_mode == "prose_ruby":
        check_ruby_field(raw_value, field_loc, False, errors)
    elif ruby_mode == "literal":
        check_literal_field(raw_value, field_loc, errors)
    else:
        check_balanced_delimiters(raw_value, field_loc, errors)
    return raw_value


def _is_strict_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_formation(
    raw_list: object,
    location: str,
    errors: list[ValidationError],
) -> tuple[FormationRule, ...]:
    if not isinstance(raw_list, list) or not raw_list:
        errors.append(ValidationError(location, "'formation' must be a non-empty list"))
        return ()

    rules: list[FormationRule] = []
    for idx, item in enumerate(raw_list):
        item_loc = f"{location}.formation[{idx}]"
        if not isinstance(item, dict):
            errors.append(ValidationError(item_loc, "Formation item must be an object"))
            continue
        pos = _require_str(item, "pos", item_loc, errors, ruby_mode="strict_ruby")
        rule = _require_str(item, "rule", item_loc, errors, ruby_mode="strict_ruby")
        rules.append(FormationRule(pos=pos, rule=rule))
    return tuple(rules)


def _parse_examples(
    raw_list: object,
    location: str,
    errors: list[ValidationError],
) -> tuple[ExampleSentence, ...]:
    if not isinstance(raw_list, list) or len(raw_list) < 3:
        errors.append(ValidationError(location, "'examples' must contain at least 3 entries"))
        return ()

    examples: list[ExampleSentence] = []
    for idx, item in enumerate(raw_list):
        ex_loc = f"{location}.examples[{idx}]"
        if not isinstance(item, dict):
            errors.append(ValidationError(ex_loc, "Example must be an object"))
            continue
        ja_ruby = _require_str(item, "ja_ruby", ex_loc, errors, ruby_mode="strict_ruby")
        note = _require_str(item, "structure_note", ex_loc, errors, ruby_mode="prose_ruby")
        en = _require_str(item, "en", ex_loc, errors, ruby_mode="literal")
        examples.append(ExampleSentence(ja_ruby=ja_ruby, en=en, structure_note=note))
    return tuple(examples)


def _parse_pitfalls(
    raw_list: object,
    location: str,
    errors: list[ValidationError],
) -> tuple[str, ...]:
    if not isinstance(raw_list, list) or len(raw_list) < 2:
        errors.append(ValidationError(location, "'pitfalls' must contain at least 2 items"))
        return ()

    pitfalls: list[str] = []
    for idx, item in enumerate(raw_list):
        p_loc = f"{location}.pitfalls[{idx}]"
        if not isinstance(item, str) or len(item.strip()) < 20:
            errors.append(ValidationError(p_loc, "Pitfall must be a string (>= 20 chars)"))
            continue
        check_ruby_field(item, p_loc, False, errors)
        pitfalls.append(item)
    return tuple(pitfalls)


def _parse_grammar_point(
    raw: object,
    location: str,
    seen_point_ids: set[str],
    errors: list[ValidationError],
) -> GrammarPoint | None:
    if not isinstance(raw, dict):
        errors.append(ValidationError(location, "Grammar point must be an object"))
        return None

    point_id = _require_str(raw, "id", location, errors, ruby_mode="literal")
    if point_id:
        if not SLUG_PATTERN.match(point_id):
            errors.append(
                ValidationError(location, f"Grammar id '{point_id}' must match ^[a-z0-9-]+$")
            )
        if point_id in seen_point_ids:
            errors.append(ValidationError(location, f"Duplicate grammar point id '{point_id}'"))
        seen_point_ids.add(point_id)

    pattern_plain = _require_str(raw, "pattern", location, errors, ruby_mode="literal")
    pattern_ruby = _require_str(raw, "pattern_ruby", location, errors, ruby_mode="strict_ruby")
    if pattern_plain and pattern_ruby and strip_ruby_to_surface(pattern_ruby) != pattern_plain:
        errors.append(
            ValidationError(
                location,
                f"pattern ({pattern_plain!r}) does not match surface of pattern_ruby ({pattern_ruby!r})",
            )
        )

    romaji = _require_str(raw, "romaji", location, errors, ruby_mode="literal")
    meaning_en = _require_str(raw, "meaning_en", location, errors, ruby_mode="literal")

    raw_register = raw.get("register")
    register = REGISTER_MAP.get(raw_register) if isinstance(raw_register, str) else None
    if register is None:
        errors.append(ValidationError(location, f"Invalid register {raw_register!r}"))
        register = "neutral"

    raw_status = raw.get("renshuu_status")
    status = STATUS_MAP.get(raw_status) if isinstance(raw_status, str) else None
    if status is None:
        errors.append(ValidationError(location, f"Invalid renshuu_status {raw_status!r}"))
        status = "canonical_n3"

    mental_model = _require_str(
        raw, "mental_model", location, errors, min_length=140, ruby_mode="prose_ruby"
    )
    formation = _parse_formation(raw.get("formation"), location, errors)
    examples = _parse_examples(raw.get("examples"), location, errors)
    pitfalls = _parse_pitfalls(raw.get("pitfalls"), location, errors)

    return GrammarPoint(
        id=point_id,
        pattern=pattern_plain,
        pattern_ruby=pattern_ruby,
        romaji=romaji,
        meaning_en=meaning_en,
        register=register,
        renshuu_status=status,
        mental_model=mental_model,
        formation=formation,
        examples=examples,
        pitfalls=pitfalls,
    )


def _parse_contrast(
    raw: object,
    location: str,
    errors: list[ValidationError],
) -> LessonContrast:
    c_loc = f"{location}.lesson_contrast"
    if not isinstance(raw, dict):
        errors.append(ValidationError(location, "'lesson_contrast' must be an object"))
        return LessonContrast(title="", explanation="", rows=())

    title = _require_str(raw, "title", c_loc, errors, ruby_mode="prose_ruby")
    explanation = _require_str(raw, "explanation", c_loc, errors, ruby_mode="prose_ruby")
    raw_rows = raw.get("rows")
    if not isinstance(raw_rows, list) or len(raw_rows) < 2:
        errors.append(ValidationError(c_loc, "'rows' must have at least 2 entries"))
        return LessonContrast(title=title, explanation=explanation, rows=())

    rows: list[ContrastRow] = []
    for idx, item in enumerate(raw_rows):
        r_loc = f"{c_loc}.rows[{idx}]"
        if not isinstance(item, dict):
            errors.append(ValidationError(r_loc, "Contrast row must be an object"))
            continue
        expr = _require_str(item, "expression", r_loc, errors, ruby_mode="strict_ruby")
        register = _require_str(item, "register", r_loc, errors, ruby_mode="literal")
        key_rule = _require_str(item, "key_rule", r_loc, errors, ruby_mode="prose_ruby")
        example_short = _require_str(item, "example_short", r_loc, errors, ruby_mode="strict_ruby")
        rows.append(
            ContrastRow(
                expression=expr,
                register=register,
                key_rule=key_rule,
                example_short=example_short,
            )
        )
    return LessonContrast(title=title, explanation=explanation, rows=tuple(rows))


def _parse_quiz(
    raw_list: object,
    location: str,
    seen_question_ids: set[str],
    errors: list[ValidationError],
) -> tuple[QuizQuestion, ...]:
    if not isinstance(raw_list, list) or len(raw_list) != 4:
        errors.append(ValidationError(location, "'practice_quiz' must contain exactly 4 questions"))
        return ()

    questions: list[QuizQuestion] = []
    for idx, item in enumerate(raw_list):
        q_loc = f"{location}.practice_quiz[{idx}]"
        if not isinstance(item, dict):
            errors.append(ValidationError(q_loc, "Quiz item must be an object"))
            continue

        qid = _require_str(item, "question_id", q_loc, errors, ruby_mode="literal")
        if qid:
            if qid in seen_question_ids:
                errors.append(ValidationError(q_loc, f"Duplicate question_id '{qid}'"))
            seen_question_ids.add(qid)

        raw_qtype = item.get("question_type")
        qtype = QUESTION_TYPE_MAP.get(raw_qtype) if isinstance(raw_qtype, str) else None
        if qtype is None:
            errors.append(ValidationError(q_loc, f"Invalid question_type {raw_qtype!r}"))
            qtype = "fill_blank"

        prompt = _require_str(item, "prompt_ja_ruby", q_loc, errors, ruby_mode="strict_ruby")
        context_en = _require_str(item, "context_en", q_loc, errors, ruby_mode="literal")

        choices_out: list[str] = []
        raw_choices = item.get("choices")
        if not isinstance(raw_choices, list) or len(raw_choices) != 4:
            errors.append(ValidationError(q_loc, "'choices' must have exactly 4 items"))
        else:
            seen_surfaces: set[str] = set()
            for c_idx, ch in enumerate(raw_choices):
                if not isinstance(ch, str) or not ch.strip():
                    errors.append(ValidationError(q_loc, f"Choice {c_idx} is empty"))
                    continue
                check_ruby_field(ch, f"{q_loc}.choices[{c_idx}]", True, errors)
                surface = strip_ruby_to_surface(ch.strip())
                if surface in seen_surfaces:
                    errors.append(ValidationError(q_loc, f"Duplicate choice surface: {surface!r}"))
                seen_surfaces.add(surface)
                choices_out.append(ch)

        raw_index = item.get("correct_index")
        if not _is_strict_int(raw_index) or not (0 <= raw_index <= 3):
            errors.append(ValidationError(q_loc, f"Invalid correct_index {raw_index!r}"))
            correct_index = 0
        else:
            correct_index = int(raw_index)

        explanation = _require_str(
            item, "explanation", q_loc, errors, min_length=100, ruby_mode="prose_ruby"
        )
        questions.append(
            QuizQuestion(
                question_id=qid,
                question_type=qtype,
                prompt_ja_ruby=prompt,
                context_en=context_en,
                choices=tuple(choices_out),
                correct_index=correct_index,
                explanation=explanation,
            )
        )
    return tuple(questions)


def _parse_lesson(
    raw: object,
    location: str,
    seen_lesson_ids: set[str],
    seen_point_ids: set[str],
    seen_question_ids: set[str],
    errors: list[ValidationError],
) -> Lesson | None:
    if not isinstance(raw, dict):
        errors.append(ValidationError(location, "Lesson must be an object"))
        return None

    lesson_id = _require_str(raw, "lesson_id", location, errors, ruby_mode="literal")
    if lesson_id:
        if lesson_id in seen_lesson_ids:
            errors.append(ValidationError(location, f"Duplicate lesson_id '{lesson_id}'"))
        seen_lesson_ids.add(lesson_id)

    raw_number = raw.get("lesson_number")
    if _is_strict_int(raw_number):
        lesson_number: int | str = int(raw_number)
    elif isinstance(raw_number, str) and raw_number.strip():
        lesson_number = raw_number
    else:
        errors.append(ValidationError(location, "Invalid 'lesson_number'"))
        lesson_number = 0

    renshuu_title = _require_str(raw, "renshuu_title", location, errors, ruby_mode="literal")

    raw_video = raw.get("has_video")
    if not isinstance(raw_video, bool):
        errors.append(ValidationError(location, "'has_video' must be a boolean"))
        has_video = False
    else:
        has_video = raw_video
        if isinstance(lesson_number, int) and lesson_number > 0:
            expected_video = 1 <= lesson_number <= 10
            if has_video != expected_video:
                errors.append(
                    ValidationError(
                        location,
                        f"Lesson {lesson_number} has_video={has_video}, expected {expected_video}",
                    )
                )
        elif isinstance(lesson_number, str) and has_video:
            errors.append(ValidationError(location, "Bridge lesson must have has_video=false"))

    summary = _require_str(raw, "summary", location, errors, min_length=40, ruby_mode="prose_ruby")
    study_tip = _require_str(
        raw, "study_tip", location, errors, min_length=30, ruby_mode="prose_ruby"
    )

    raw_points = raw.get("grammar_points")
    points: list[GrammarPoint] = []
    if not isinstance(raw_points, list) or len(raw_points) < 2:
        errors.append(ValidationError(location, "'grammar_points' must have at least 2 items"))
    else:
        for idx, item in enumerate(raw_points):
            gp = _parse_grammar_point(
                item, f"{location}.grammar_points[{idx}]", seen_point_ids, errors
            )
            if gp is not None:
                points.append(gp)

    contrast = _parse_contrast(raw.get("lesson_contrast"), location, errors)
    quiz = _parse_quiz(raw.get("practice_quiz"), location, seen_question_ids, errors)

    return Lesson(
        lesson_id=lesson_id,
        lesson_number=lesson_number,
        renshuu_title=renshuu_title,
        has_video=has_video,
        summary=summary,
        study_tip=study_tip,
        grammar_points=tuple(points),
        lesson_contrast=contrast,
        practice_quiz=quiz,
    )


def parse_unit_dict(
    raw: object,
    location: str,
    seen_lesson_ids: set[str],
    seen_point_ids: set[str],
    seen_question_ids: set[str],
    errors: list[ValidationError],
) -> Unit | None:
    """Validate and parse a decoded unit dictionary into an immutable Unit."""
    if not isinstance(raw, dict):
        errors.append(ValidationError(location, "Root must be a JSON object"))
        return None

    raw_unit_num = raw.get("unit_number")
    if not _is_strict_int(raw_unit_num) or not (1 <= raw_unit_num <= 12):
        errors.append(ValidationError(location, f"Invalid unit_number {raw_unit_num!r}"))
        unit_number = 0
    else:
        unit_number = int(raw_unit_num)

    unit_slug = _require_str(raw, "unit_slug", location, errors, ruby_mode="literal")
    unit_title = _require_str(raw, "unit_title", location, errors, ruby_mode="literal")
    unit_overview = _require_str(
        raw, "unit_overview", location, errors, min_length=60, ruby_mode="prose_ruby"
    )

    raw_lessons = raw.get("lessons")
    if not isinstance(raw_lessons, list) or not raw_lessons:
        errors.append(ValidationError(location, "'lessons' must be a non-empty list"))
        return None

    lessons: list[Lesson] = []
    for idx, item in enumerate(raw_lessons):
        parsed = _parse_lesson(
            item,
            f"{location}.lessons[{idx}]",
            seen_lesson_ids,
            seen_point_ids,
            seen_question_ids,
            errors,
        )
        if parsed is not None:
            lessons.append(parsed)

    return Unit(
        unit_number=unit_number,
        unit_slug=unit_slug,
        unit_title=unit_title,
        unit_overview=unit_overview,
        lessons=tuple(lessons),
    )


def _parse_minimal_pairs(
    raw_list: object,
    matrix_loc: str,
    errors: list[ValidationError],
) -> tuple[MinimalPair, ...]:
    if not isinstance(raw_list, list) or len(raw_list) < 2:
        errors.append(ValidationError(matrix_loc, "'minimal_pair_test' must have at least 2 items"))
        return ()

    pairs: list[MinimalPair] = []
    for idx, item in enumerate(raw_list):
        pair_loc = f"{matrix_loc}.minimal_pair_test[{idx}]"
        if not isinstance(item, dict):
            errors.append(ValidationError(pair_loc, "Minimal pair entry must be an object"))
            continue
        title = _require_str(item, "pair_title", pair_loc, errors, ruby_mode="literal")
        valid = _require_str(item, "sentence_valid", pair_loc, errors, ruby_mode="strict_ruby")
        contrast = _require_str(
            item, "sentence_contrast", pair_loc, errors, ruby_mode="strict_ruby"
        )
        explanation = _require_str(
            item, "explanation", pair_loc, errors, min_length=40, ruby_mode="prose_ruby"
        )
        pairs.append(
            MinimalPair(
                pair_title=title,
                sentence_valid=valid,
                sentence_contrast=contrast,
                explanation=explanation,
            )
        )
    return tuple(pairs)


def _parse_matrix_rows(
    raw_rows: object,
    matrix_loc: str,
    errors: list[ValidationError],
) -> tuple[tuple[str, ...], ...]:
    if not isinstance(raw_rows, list) or len(raw_rows) < 3:
        errors.append(ValidationError(matrix_loc, "'rows' must have at least 3 entries"))
        return ()

    rows: list[tuple[str, ...]] = []
    for r_idx, raw_row in enumerate(raw_rows):
        row_loc = f"{matrix_loc}.rows[{r_idx}]"
        if not isinstance(raw_row, list) or len(raw_row) != 5:
            errors.append(ValidationError(row_loc, "Row must be a list of 5 strings"))
            continue
        cells: list[str] = []
        for c_idx, cell in enumerate(raw_row):
            if not isinstance(cell, str) or not cell.strip():
                errors.append(ValidationError(row_loc, f"Cell {c_idx} is empty"))
                cells.append("")
                continue
            check_ruby_field(cell, f"{row_loc}[{c_idx}]", c_idx in (0, 4), errors)
            cells.append(cell)
        rows.append(tuple(cells))
    return tuple(rows)


def parse_matrices_dict(
    raw: object,
    location: str,
    errors: list[ValidationError],
) -> tuple[SynonymMatrix, ...]:
    """Validate and parse decoded synonym_matrices JSON into immutable models."""
    if not isinstance(raw, dict) or not isinstance(raw.get("matrices"), list):
        errors.append(ValidationError(location, "Root must be {'matrices': [...]}"))
        return ()

    raw_matrices = raw["matrices"]
    if len(raw_matrices) != 12:
        errors.append(ValidationError(location, f"Expected 12 matrices, found {len(raw_matrices)}"))

    seen_ids: set[str] = set()
    matrices: list[SynonymMatrix] = []
    for idx, item in enumerate(raw_matrices):
        m_loc = f"{location}.matrices[{idx}]"
        if not isinstance(item, dict):
            errors.append(ValidationError(m_loc, "Matrix must be an object"))
            continue

        mid = _require_str(item, "matrix_id", m_loc, errors, ruby_mode="literal")
        if mid:
            if mid in seen_ids:
                errors.append(ValidationError(m_loc, f"Duplicate matrix_id '{mid}'"))
            seen_ids.add(mid)

        title = _require_str(item, "title", m_loc, errors, ruby_mode="prose_ruby")
        theme = _require_str(item, "theme", m_loc, errors, ruby_mode="literal")
        heuristic = _require_str(
            item, "decision_heuristic", m_loc, errors, min_length=60, ruby_mode="prose_ruby"
        )

        raw_columns = item.get("columns")
        if raw_columns != list(EXPECTED_MATRIX_COLUMNS):
            errors.append(
                ValidationError(m_loc, f"Columns must equal {list(EXPECTED_MATRIX_COLUMNS)}")
            )
        columns = tuple(str(c) for c in raw_columns) if isinstance(raw_columns, list) else ()

        rows = _parse_matrix_rows(item.get("rows"), m_loc, errors)
        pairs = _parse_minimal_pairs(item.get("minimal_pair_test"), m_loc, errors)
        matrices.append(
            SynonymMatrix(
                matrix_id=mid,
                title=title,
                theme=theme,
                decision_heuristic=heuristic,
                columns=columns,
                rows=rows,
                minimal_pair_test=pairs,
            )
        )
    return tuple(matrices)


def validate_curriculum_file(path: Path) -> list[ValidationError]:
    """Validate a single curriculum unit or matrices JSON file."""
    errors: list[ValidationError] = []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [ValidationError(path.name, f"Failed to read/parse JSON: {exc}")]

    if path.name == "synonym_matrices.json":
        parse_matrices_dict(raw, path.name, errors)
    else:
        parse_unit_dict(raw, path.name, set(), set(), set(), errors)
    return errors


def _validate_syllabus_coverage(units: tuple[Unit, ...], errors: list[ValidationError]) -> None:
    renshuu_by_num: dict[int, Lesson] = {}
    bridge_lessons: list[Lesson] = []

    for unit in units:
        for lesson in unit.lessons:
            if isinstance(lesson.lesson_number, int):
                if lesson.lesson_number in renshuu_by_num:
                    errors.append(
                        ValidationError(
                            "ALL", f"Duplicate Renshuu lesson_number {lesson.lesson_number}"
                        )
                    )
                renshuu_by_num[lesson.lesson_number] = lesson
            else:
                bridge_lessons.append(lesson)

    for expected_num, expected_title in enumerate(EXPECTED_RENSHUU_TITLES, start=1):
        actual = renshuu_by_num.get(expected_num)
        if actual is None:
            errors.append(
                ValidationError("ALL", f"Missing Renshuu lesson #{expected_num} ({expected_title})")
            )
            continue
        expected_id = f"L{expected_num:02d}"
        if actual.lesson_id != expected_id:
            errors.append(
                ValidationError(
                    "ALL",
                    f"Lesson #{expected_num} has lesson_id={actual.lesson_id!r}, expected {expected_id!r}",
                )
            )
        if actual.renshuu_title != expected_title:
            errors.append(
                ValidationError(
                    "ALL",
                    f"Lesson #{expected_num} title mismatch: {actual.renshuu_title!r} != {expected_title!r}",
                )
            )

    actual_bridge_ids = tuple(lesson.lesson_id for lesson in bridge_lessons)
    if actual_bridge_ids != EXPECTED_BRIDGE_IDS:
        errors.append(
            ValidationError(
                "ALL", f"Bridge IDs mismatch: {actual_bridge_ids} != {EXPECTED_BRIDGE_IDS}"
            )
        )


def load_and_validate_curriculum(
    curriculum_dir: Path,
) -> tuple[Curriculum | None, list[ValidationError]]:
    """Validate all canonical files in curriculum_dir and return typed models if clean."""
    errors: list[ValidationError] = []
    seen_lesson_ids: set[str] = set()
    seen_point_ids: set[str] = set()
    seen_question_ids: set[str] = set()
    units: list[Unit] = []

    for filename in EXPECTED_UNIT_FILES:
        path = curriculum_dir / filename
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(ValidationError(filename, f"Failed to read/parse JSON: {exc}"))
            continue
        unit = parse_unit_dict(
            raw, filename, seen_lesson_ids, seen_point_ids, seen_question_ids, errors
        )
        if unit is not None:
            units.append(unit)

    matrices_path = curriculum_dir / "synonym_matrices.json"
    matrices: tuple[SynonymMatrix, ...] = ()
    try:
        raw_matrices = json.loads(matrices_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(ValidationError("synonym_matrices.json", f"Failed to read/parse JSON: {exc}"))
    else:
        matrices = parse_matrices_dict(raw_matrices, "synonym_matrices.json", errors)

    unit_tuple = tuple(units)
    _validate_syllabus_coverage(unit_tuple, errors)
    if errors:
        return None, errors
    return Curriculum(units=unit_tuple, matrices=matrices), []


def load_curriculum(curriculum_dir: Path) -> Curriculum:
    """Load and validate curriculum_dir or raise ValueError on any schema/ruby violation."""
    curriculum, errors = load_and_validate_curriculum(curriculum_dir)
    if curriculum is None or errors:
        preview = "\n".join(f"  [{err.location}] {err.message}" for err in errors[:40])
        raise ValueError(f"Curriculum validation failed with {len(errors)} error(s):\n{preview}")
    return curriculum
