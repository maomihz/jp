"""Strongly typed domain models and canonical syllabus constants."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

type Register = Literal["casual", "neutral", "formal", "written"]
type RenshuuStatus = Literal[
    "verified_renshuu", "canonical_n3", "n4_prerequisite", "exam_border_n2"
]
type QuestionType = Literal["fill_blank", "nuance_choice", "attachment_trap", "star_order"]

EXPECTED_RENSHUU_TITLES: tuple[str, ...] = (
    "Using 初めて",
    "Particles Expanded",
    "Noun Suffixes: に",
    "Noun Suffixes: に #2",
    "Noun Suffixes #3",
    "Sentence Links (Because)",
    "Sentence Links #2",
    "Sentence Links #3",
    "Conjunctions: でも",
    "Conjunctions: でも #2",
    "Using など・なんて・なんか",
    "Emphasis: こと",
    "Emphasis: Other",
    "Negation: ~ない",
    "ほど expanded",
    "Degree/Amount",
    "わけ",
    "Expectations",
    "Necessity",
    "Because",
    "Commands/Requests #1",
    "Commands/Requests #2",
    "Commands/Requests #3",
    "Commands/Requests #4",
    "Wishes & Hopes",
    "Wishes & Hopes #2",
    "Using ように",
    "Using ように #2",
    "Using もし",
    "Actions & Time: うち",
    "Actions & Time: Endings",
    "Actions & Time #3",
    "Nominalization",
    "Noun Reference: の",
    "Qualifiers",
    "Reporting Information",
    "Reporting Information #2",
    "Informal Sentence Endings",
    "More Questions",
    "Although",
    "Even Though",
    "Instead",
    "Comparisons",
    "(Not) Only",
    "も~ない",
    "Negative Verb Endings",
    "Giving Information",
    "Giving Examples",
    "Considering",
    "Using ~がる",
    "Using っぽい",
    "Seeming/Pretending",
    "Continuing Actions",
    "Completing Actions",
    "Completing Actions #2",
)

EXPECTED_BRIDGE_IDS: tuple[str, ...] = ("B01", "B02", "B03")

EXPECTED_UNIT_FILES: tuple[str, ...] = (
    "unit_01_lessons_01_05.json",
    "unit_02_lessons_06_10.json",
    "unit_03_lessons_11_15.json",
    "unit_04_lessons_16_20.json",
    "unit_05_lessons_21_26.json",
    "unit_06_lessons_27_32.json",
    "unit_07_lessons_33_39.json",
    "unit_08_lessons_40_45.json",
    "unit_09_lessons_46_49.json",
    "unit_10_lessons_50_52.json",
    "unit_11_lessons_53_55.json",
    "unit_12_exam_bridge.json",
)

UNIT_MARKDOWN_FILENAMES: dict[int, str] = {
    1: "unit-01-lessons-01-05.md",
    2: "unit-02-lessons-06-10.md",
    3: "unit-03-lessons-11-15.md",
    4: "unit-04-lessons-16-20.md",
    5: "unit-05-lessons-21-26.md",
    6: "unit-06-lessons-27-32.md",
    7: "unit-07-lessons-33-39.md",
    8: "unit-08-lessons-40-45.md",
    9: "unit-09-lessons-46-49.md",
    10: "unit-10-lessons-50-52.md",
    11: "unit-11-lessons-53-55.md",
    12: "unit-12-exam-bridge.md",
}

EXPECTED_MATRIX_COLUMNS: tuple[str, ...] = (
    "Pattern",
    "Formation Key",
    "Speaker Nuance",
    "Constraints",
    "Canonical Example",
)

MATRIX_RELATED_LESSONS: dict[str, tuple[str, ...]] = {
    "M01": ("L40", "L41", "L49"),
    "M02": ("L20", "B02"),
    "M03": ("L20", "L27", "L33", "L34"),
    "M04": ("L30", "L32"),
    "M05": ("L31", "L55"),
    "M06": ("L17", "L18", "L19", "L23", "L25", "B02"),
    "M07": ("L11", "L37", "L48"),
    "M08": ("L28", "L36", "L51", "L52"),
    "M09": ("L54", "L55"),
    "M10": ("L35", "L53"),
    "M11": ("L03", "L04", "L35"),
    "M12": ("L06", "L07", "L08"),
}

REGISTER_VALUES: tuple[Register, ...] = ("casual", "neutral", "formal", "written")
STATUS_VALUES: tuple[RenshuuStatus, ...] = (
    "verified_renshuu",
    "canonical_n3",
    "n4_prerequisite",
    "exam_border_n2",
)
QUESTION_TYPE_VALUES: tuple[QuestionType, ...] = (
    "fill_blank",
    "nuance_choice",
    "attachment_trap",
    "star_order",
)

REGISTER_LABELS: dict[Register, str] = {
    "casual": "Casual",
    "neutral": "Neutral",
    "formal": "Formal",
    "written": "Written",
}

STATUS_LABELS: dict[RenshuuStatus, str] = {
    "verified_renshuu": "Renshuu Verified",
    "canonical_n3": "Canonical N3",
    "n4_prerequisite": "N4 Prerequisite",
    "exam_border_n2": "Renshuu N2 / N3 Exam",
}

QUESTION_TYPE_LABELS: dict[QuestionType, str] = {
    "fill_blank": "Fill in the Blank",
    "nuance_choice": "Nuance Choice",
    "attachment_trap": "Attachment Trap",
    "star_order": "Star Order (並べ替え)",
}

BOOK_UUID = "urn:uuid:7c42b8e1-93a4-4f2b-9d12-8a4f6e30b5c1"

EXPECTED_GRAMMAR_POINT_KEYS: frozenset[str] = frozenset(
    {
        "id",
        "pattern",
        "pattern_ruby",
        "meaning_en",
        "register",
        "renshuu_status",
        "mental_model",
        "formation",
        "examples",
        "pitfalls",
    }
)


@dataclass(frozen=True, slots=True)
class FormationRule:
    """Part-of-speech attachment rule for a grammar point."""

    pos: str
    rule: str


@dataclass(frozen=True, slots=True)
class ExampleSentence:
    """Graded example sentence with furigana markup, translation, and structural note."""

    ja_ruby: str
    en: str
    structure_note: str


@dataclass(frozen=True, slots=True)
class ContrastRow:
    """Single entry in a per-lesson disambiguation contrast table."""

    expression: str
    register: str
    key_rule: str
    example_short: str


@dataclass(frozen=True, slots=True)
class LessonContrast:
    """Side-by-side contrast table comparing patterns within a lesson."""

    title: str
    explanation: str
    rows: tuple[ContrastRow, ...]


@dataclass(frozen=True, slots=True)
class QuizQuestion:
    """Four-choice diagnostic practice item for a lesson."""

    question_id: str
    question_type: QuestionType
    prompt_ja_ruby: str
    context_en: str
    choices: tuple[str, ...]
    correct_index: int
    explanation: str


@dataclass(frozen=True, slots=True)
class GrammarPoint:
    """Deep-dive card covering one JLPT N3 grammar pattern or pattern cluster."""

    id: str
    pattern: str
    pattern_ruby: str
    meaning_en: str
    register: Register
    renshuu_status: RenshuuStatus
    mental_model: str
    formation: tuple[FormationRule, ...]
    examples: tuple[ExampleSentence, ...]
    pitfalls: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Lesson:
    """Renshuu topic (#01-#55) or exam-bridge module (B1-B3)."""

    lesson_id: str
    lesson_number: int | str
    renshuu_title: str
    has_video: bool
    summary: str
    study_tip: str
    grammar_points: tuple[GrammarPoint, ...]
    lesson_contrast: LessonContrast
    practice_quiz: tuple[QuizQuestion, ...]

    def format_badge(self) -> str:
        """Return display badge (#01-#55 or B1-B3)."""
        if isinstance(self.lesson_number, int):
            return f"#{self.lesson_number:02d}"
        return str(self.lesson_number)


@dataclass(frozen=True, slots=True)
class Unit:
    """Grouped study unit containing sequential lessons."""

    unit_number: int
    unit_slug: str
    unit_title: str
    unit_overview: str
    lessons: tuple[Lesson, ...]


@dataclass(frozen=True, slots=True)
class MinimalPair:
    """Valid vs. contrasting sentence demonstrating an exact grammar boundary."""

    pair_title: str
    sentence_valid: str
    sentence_contrast: str
    explanation: str


@dataclass(frozen=True, slots=True)
class SynonymMatrix:
    """Cross-lesson disambiguation matrix with decision heuristic and minimal pairs."""

    matrix_id: str
    title: str
    theme: str
    decision_heuristic: str
    columns: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]
    minimal_pair_test: tuple[MinimalPair, ...]


@dataclass(frozen=True, slots=True)
class Curriculum:
    """Validated canonical curriculum bundle across all units and synonym matrices."""

    units: tuple[Unit, ...]
    matrices: tuple[SynonymMatrix, ...]

    @property
    def lessons(self) -> tuple[Lesson, ...]:
        return tuple(lesson for unit in self.units for lesson in unit.lessons)

    @property
    def total_grammar_points(self) -> int:
        return sum(len(lesson.grammar_points) for lesson in self.lessons)

    @property
    def total_questions(self) -> int:
        return sum(len(lesson.practice_quiz) for lesson in self.lessons)

    def lesson_unit_map(self) -> dict[str, tuple[Unit, Lesson]]:
        """Map each lesson_id to its enclosing (Unit, Lesson) pair."""
        return {lesson.lesson_id: (unit, lesson) for unit in self.units for lesson in unit.lessons}

    def related_lessons_for_matrix(self, matrix_id: str) -> tuple[Lesson, ...]:
        """Return ordered deep-dive lessons paired with a Synonym Matrix."""
        by_id = self.lesson_unit_map()
        lesson_ids = MATRIX_RELATED_LESSONS.get(matrix_id, ())
        return tuple(by_id[lid][1] for lid in lesson_ids if lid in by_id)

    def related_matrices_for_lesson(self, lesson_id: str) -> tuple[SynonymMatrix, ...]:
        """Return all Synonym Matrices referencing the given lesson."""
        return tuple(
            matrix
            for matrix in self.matrices
            if lesson_id in MATRIX_RELATED_LESSONS.get(matrix.matrix_id, ())
        )
