"""Compile typed curriculum models into GitHub-Flavored Markdown study guides."""

from __future__ import annotations

from pathlib import Path

from renshuu_n3.models import (
    QUESTION_TYPE_LABELS,
    REGISTER_LABELS,
    STATUS_LABELS,
    UNIT_MARKDOWN_FILENAMES,
    Curriculum,
    GrammarPoint,
    Lesson,
    SynonymMatrix,
    Unit,
)
from renshuu_n3.ruby import escape_markdown_cell, render_ruby_markdown

CHOICE_LETTERS = ("A", "B", "C", "D")


def build_syllabus_table_rows(curriculum: Curriculum) -> list[str]:
    """Build clickable Markdown table rows covering all 55 Renshuu lessons + 3 bridge modules."""
    rows = [
        "| # | Lesson Title | Video | Focus Patterns | Guide Link |",
        "| :-: | :--- | :-: | :--- | :--- |",
    ]
    for unit in curriculum.units:
        md_file = UNIT_MARKDOWN_FILENAMES[unit.unit_number]
        for lesson in unit.lessons:
            badge = lesson.format_badge()
            video = "Video" if lesson.has_video else "—"
            patterns = ", ".join(gp.pattern for gp in lesson.grammar_points).replace("|", "/")
            anchor = lesson.lesson_id.lower()
            rows.append(
                f"| `{badge}` | {lesson.renshuu_title} | {video} | {patterns} | [Open {lesson.lesson_id}]({md_file}#{anchor}) |"
            )
    return rows


def render_master_index_markdown(curriculum: Curriculum) -> str:
    """Render 00-master-index.md linking all units, lessons, and synonym matrices."""
    lines = [
        "# Master Index & JLPT N3 Study Roadmap",
        "",
        (
            f"This guide pairs 1-to-1 with every lesson in Renshuu's **Intermediate/JLPT N3 Grammar** "
            f"curriculum (`#01`–`#55`) and adds **3 Exam-Bridge modules** (`B1`–`B3`) plus "
            f"**12 Synonym Disambiguation Matrices** (`M01`–`M12`) totaling "
            f"**{curriculum.total_grammar_points} grammar entries** and "
            f"**{curriculum.total_questions} practice questions**."
        ),
        "",
        "## How to Pair This Guide with Renshuu",
        "",
        "1. **Preview before queuing:** Read the unit summary, mental models, and formation rules before unlocking the matching lesson on Renshuu.",
        "2. **Use the contrast tables:** Every lesson highlights the subtle boundary that Renshuu sentence-scramble and fill-in-the-blank quizzes test most frequently.",
        "3. **Test active recall:** Complete the 4 diagnostic questions at the end of each lesson (or open the interactive web app with `Recall` blur enabled).",
        "4. **Close exam gaps with Unit 12:** For the official JLPT N3 exam, complete Bridge modules **B1** (N4 voice and honorific speech prerequisites), **B2** (high-frequency N3 exam patterns deferred to Renshuu N2), and **B3** (star-puzzle word order and discourse grammar).",
        "",
        "## Unit Directory",
        "",
    ]
    for unit in curriculum.units:
        md_name = UNIT_MARKDOWN_FILENAMES[unit.unit_number]
        lines.append(
            f"- [{unit.unit_title}]({md_name}) — {render_ruby_markdown(unit.unit_overview)}"
        )

    lines.extend(
        [
            "- [12 Synonym Disambiguation Matrices](13-synonym-matrices.md) — Side-by-side comparison grids and minimal-pair proofs.",
            "",
            "## Complete Lesson Syllabus (`#01`–`#55` & `B1`–`B3`)",
            "",
            *build_syllabus_table_rows(curriculum),
            "",
            "## Synonym Disambiguation Matrices (`M01`–`M12`)",
            "",
            "| ID | Matrix Title | Theme | Link |",
            "| :-: | :--- | :--- | :--- |",
        ]
    )
    for matrix in curriculum.matrices:
        anchor = matrix.matrix_id.lower()
        lines.append(
            f"| `{matrix.matrix_id}` | {escape_markdown_cell(matrix.title)} | {matrix.theme} | [Open {matrix.matrix_id}](13-synonym-matrices.md#{anchor}) |"
        )
    lines.append("")
    return "\n".join(lines)


def _render_grammar_point_markdown(gp: GrammarPoint) -> list[str]:
    reg = REGISTER_LABELS[gp.register]
    st = STATUS_LABELS[gp.renshuu_status]
    lines = [
        f"### {render_ruby_markdown(gp.pattern_ruby)}",
        "",
        f"- **Meaning:** {render_ruby_markdown(gp.meaning_en)}",
        f"- **Register / Status:** {reg} / {st}",
        "",
        "**Formation:**",
        "",
        "| Part of Speech | Attachment Rule |",
        "| :--- | :--- |",
    ]
    for rule in gp.formation:
        lines.append(f"| {escape_markdown_cell(rule.pos)} | {escape_markdown_cell(rule.rule)} |")

    lines.extend(
        [
            "",
            f"**Mental Model:** {render_ruby_markdown(gp.mental_model)}",
            "",
            "**Examples:**",
            "",
        ]
    )
    for idx, ex in enumerate(gp.examples, start=1):
        lines.append(f"{idx}. {render_ruby_markdown(ex.ja_ruby)}")
        lines.append(f"   - *Translation:* {ex.en}")
        lines.append(f"   - *Structure:* {render_ruby_markdown(ex.structure_note)}")

    lines.extend(["", "**Watch-Out Pitfalls:**", ""])
    for pitfall in gp.pitfalls:
        lines.append(f"- {render_ruby_markdown(pitfall)}")
    lines.append("")
    return lines


def _render_lesson_markdown(
    lesson: Lesson, related_matrices: tuple[SynonymMatrix, ...] = ()
) -> list[str]:
    anchor = lesson.lesson_id.lower()
    badge = lesson.format_badge()
    video_tag = " *(Includes Renshuu Video Lesson)*" if lesson.has_video else ""
    lines = [
        f'<a id="{anchor}"></a>',
        f"## {badge}: {lesson.renshuu_title}{video_tag}",
        "",
        f"**Orientation:** {render_ruby_markdown(lesson.summary)}",
        "",
        f"> **Renshuu Study Tip:** {render_ruby_markdown(lesson.study_tip)}",
        "",
    ]
    if related_matrices:
        matrix_links = ", ".join(
            f"[{matrix.matrix_id}: {matrix.theme}](13-synonym-matrices.md#{matrix.matrix_id.lower()})"
            for matrix in related_matrices
        )
        lines.extend([f"**Related Synonym Matrices:** {matrix_links}", ""])
    lines.extend(
        [
            "### Lesson Snapshot",
            "",
            "| Pattern | Meaning | Register | Status |",
            "| :--- | :--- | :--- | :--- |",
        ]
    )
    for gp in lesson.grammar_points:
        reg = REGISTER_LABELS[gp.register]
        st = STATUS_LABELS[gp.renshuu_status]
        lines.append(
            f"| {escape_markdown_cell(gp.pattern_ruby)} | {escape_markdown_cell(gp.meaning_en)} | {reg} | {st} |"
        )
    lines.append("")

    for gp in lesson.grammar_points:
        lines.extend(_render_grammar_point_markdown(gp))

    contrast = lesson.lesson_contrast
    lines.extend(
        [
            f"### Contrast: {render_ruby_markdown(contrast.title)}",
            "",
            render_ruby_markdown(contrast.explanation),
            "",
            "| Expression | Register | Key Rule | Short Example |",
            "| :--- | :--- | :--- | :--- |",
        ]
    )
    for row in contrast.rows:
        lines.append(
            f"| {escape_markdown_cell(row.expression)} | {escape_markdown_cell(row.register)} | {escape_markdown_cell(row.key_rule)} | {escape_markdown_cell(row.example_short)} |"
        )

    lines.extend(["", "### Practice Checkup", ""])
    for q_idx, q in enumerate(lesson.practice_quiz, start=1):
        qlabel = QUESTION_TYPE_LABELS[q.question_type]
        lines.extend(
            [
                f"**Q{q_idx} ({qlabel}):** {render_ruby_markdown(q.prompt_ja_ruby)}",
                "",
                f"*Context:* {render_ruby_markdown(q.context_en)}",
                "",
            ]
        )
        for c_idx, choice in enumerate(q.choices):
            lines.append(f"- **{CHOICE_LETTERS[c_idx]}.** {render_ruby_markdown(choice)}")

        correct_choice = render_ruby_markdown(q.choices[q.correct_index])
        lines.extend(
            [
                "",
                "<details>",
                f"<summary>Check Answer ({q.question_id})</summary>",
                "",
                f"**Correct Answer: {CHOICE_LETTERS[q.correct_index]} — {correct_choice}**",
                "",
                render_ruby_markdown(q.explanation),
                "",
                "</details>",
                "",
            ]
        )
    lines.extend(["---", ""])
    return lines


def render_unit_markdown(unit: Unit, curriculum: Curriculum | None = None) -> str:
    """Render one validated Unit into a standalone Markdown guide."""
    lines = [
        f"# {unit.unit_title}",
        "",
        render_ruby_markdown(unit.unit_overview),
        "",
        "[Back to Master Index](00-master-index.md) | [Synonym Matrices](13-synonym-matrices.md)",
        "",
        "---",
        "",
    ]
    for lesson in unit.lessons:
        related_matrices = (
            curriculum.related_matrices_for_lesson(lesson.lesson_id)
            if curriculum is not None
            else ()
        )
        lines.extend(_render_lesson_markdown(lesson, related_matrices))
    return "\n".join(lines)


def render_matrices_markdown(
    matrices: tuple[SynonymMatrix, ...], curriculum: Curriculum | None = None
) -> str:
    """Render all 12 synonym disambiguation matrices to Markdown."""
    by_id = curriculum.lesson_unit_map() if curriculum is not None else {}
    lines = [
        "# JLPT N3 Synonym Disambiguation Matrices (M01–M12)",
        "",
        "[Back to Master Index](00-master-index.md)",
        "",
        "High-confusion intermediate expressions grouped side-by-side with decision heuristics and minimal-pair tests.",
        "",
        "---",
        "",
    ]
    for matrix in matrices:
        lines.extend(
            [
                f'<a id="{matrix.matrix_id.lower()}"></a>',
                f"## {matrix.matrix_id}: {render_ruby_markdown(matrix.title)}",
                "",
                f"**Theme:** {matrix.theme}",
                "",
            ]
        )
        if curriculum is not None:
            related_lessons = curriculum.related_lessons_for_matrix(matrix.matrix_id)
            if related_lessons:
                lesson_links = ", ".join(
                    f"[{ls.format_badge()}: {ls.renshuu_title}]"
                    f"({UNIT_MARKDOWN_FILENAMES[by_id[ls.lesson_id][0].unit_number]}#{ls.lesson_id.lower()})"
                    for ls in related_lessons
                    if ls.lesson_id in by_id
                )
                lines.extend([f"**Related Lessons:** {lesson_links}", ""])
        lines.extend(
            [
                f"> **Decision Heuristic:** {render_ruby_markdown(matrix.decision_heuristic)}",
                "",
                "| " + " | ".join(matrix.columns) + " |",
                "| " + " | ".join(":---" for _ in matrix.columns) + " |",
            ]
        )
        for row in matrix.rows:
            lines.append("| " + " | ".join(escape_markdown_cell(cell) for cell in row) + " |")
        lines.extend(["", "### Minimal-Pair Proofs", ""])
        for pair in matrix.minimal_pair_test:
            lines.extend(
                [
                    f"- **{render_ruby_markdown(pair.pair_title)}**",
                    f"  - Natural: {render_ruby_markdown(pair.sentence_valid)}",
                    f"  - Contrast: {render_ruby_markdown(pair.sentence_contrast)}",
                    f"  - Why: {render_ruby_markdown(pair.explanation)}",
                ]
            )
        lines.extend(["", "---", ""])
    return "\n".join(lines)


def build_markdown_guides(curriculum: Curriculum, guide_dir: Path) -> None:
    """Write 00-master-index.md, 12 unit guides, and 13-synonym-matrices.md into guide_dir."""
    guide_dir.mkdir(parents=True, exist_ok=True)
    (guide_dir / "00-master-index.md").write_text(
        render_master_index_markdown(curriculum), encoding="utf-8"
    )
    for unit in curriculum.units:
        md_name = UNIT_MARKDOWN_FILENAMES[unit.unit_number]
        (guide_dir / md_name).write_text(render_unit_markdown(unit, curriculum), encoding="utf-8")
    (guide_dir / "13-synonym-matrices.md").write_text(
        render_matrices_markdown(curriculum.matrices, curriculum), encoding="utf-8"
    )
