"""Compile typed curriculum models into a validated EPUB 3.3 archive."""

from __future__ import annotations

import html
import xml.etree.ElementTree as ET
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from renshuu_n3.models import (
    BOOK_UUID,
    QUESTION_TYPE_LABELS,
    REGISTER_LABELS,
    STATUS_LABELS,
    Curriculum,
    GrammarPoint,
    Lesson,
    SynonymMatrix,
    Unit,
)
from renshuu_n3.ruby import render_ruby_html, strip_ruby_to_surface

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
CHOICE_LETTERS = ("A", "B", "C", "D")


def _validate_xml_string(xml_text: str, label: str) -> bytes:
    """Parse XML strictly to guarantee well-formed output before writing the archive."""
    raw = xml_text.encode("utf-8")
    try:
        ET.fromstring(raw)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid XML generated for {label}: {exc}") from exc
    return raw


def _wrap_xhtml(title: str, css_href: str, body_inner: str) -> str:
    escaped_title = html.escape(title, quote=False)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!DOCTYPE html>\n"
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">\n'
        "<head>\n"
        f"  <title>{escaped_title}</title>\n"
        f'  <link rel="stylesheet" type="text/css" href="{css_href}" />\n'
        "</head>\n"
        "<body>\n"
        f"{body_inner}\n"
        "</body>\n"
        "</html>\n"
    )


def _render_intro_xhtml(curriculum: Curriculum) -> str:
    parts = [
        '<section id="intro" epub:type="frontmatter">',
        "<h1>Renshuu JLPT N3 Grammar Companion Study Guide</h1>",
        "<p>A complete companion study guide paired 1-to-1 with all <strong>55 Renshuu Intermediate/JLPT N3 Grammar lessons</strong>, supplemented by <strong>3 JLPT N3 Exam-Bridge modules</strong> and <strong>12 Synonym Disambiguation Matrices</strong>.</p>",
        '<div class="callout"><p><strong>How to Use:</strong> Preview each lesson before starting Renshuu sentence quizzes, study the attachment rules and watch-out pitfalls, then verify comprehension with the 4 diagnostic checkup questions.</p></div>',
        "<h2>Master Syllabus</h2>",
        "<table><thead><tr><th>#</th><th>Topic</th><th>Grammar Points</th></tr></thead><tbody>",
    ]
    for unit in curriculum.units:
        href_base = f"unit_{unit.unit_number:02d}.xhtml"
        for lesson in unit.lessons:
            lid = html.escape(lesson.lesson_id)
            badge = html.escape(lesson.format_badge())
            title = html.escape(lesson.renshuu_title)
            patterns = ", ".join(render_ruby_html(gp.pattern_ruby) for gp in lesson.grammar_points)
            parts.append(
                f'<tr><td><a href="{href_base}#{lid}">{badge}</a></td>'
                f'<td><a href="{href_base}#{lid}">{title}</a></td>'
                f"<td>{patterns}</td></tr>"
            )
    parts.extend(["</tbody></table>", "</section>"])
    return _wrap_xhtml("Renshuu JLPT N3 Grammar Companion", "../styles/guide.css", "\n".join(parts))


def _render_grammar_card_xhtml(gp: GrammarPoint) -> list[str]:
    gid = html.escape(gp.id)
    reg = html.escape(REGISTER_LABELS[gp.register])
    st = html.escape(STATUS_LABELS[gp.renshuu_status])
    parts = [
        f'<article id="gp-{gid}" class="grammar-card">',
        f"<h3>{render_ruby_html(gp.pattern_ruby)}</h3>",
        f'<p class="meta"><strong>Meaning:</strong> {render_ruby_html(gp.meaning_en)} | <strong>Register:</strong> {reg} | <strong>Status:</strong> {st}</p>',
        "<table><thead><tr><th>Part of Speech</th><th>Attachment Rule</th></tr></thead><tbody>",
    ]
    for rule in gp.formation:
        parts.append(
            f"<tr><td>{render_ruby_html(rule.pos)}</td><td>{render_ruby_html(rule.rule)}</td></tr>"
        )
    parts.extend(
        [
            "</tbody></table>",
            f"<p><strong>Mental Model:</strong> {render_ruby_html(gp.mental_model)}</p>",
            "<h4>Examples</h4>",
            "<ol>",
        ]
    )
    for ex in gp.examples:
        parts.append(
            "<li>"
            f'<p class="jp">{render_ruby_html(ex.ja_ruby)}</p>'
            f'<p>{html.escape(ex.en)}<br/><span class="note"><em>Structure:</em> {render_ruby_html(ex.structure_note)}</span></p>'
            "</li>"
        )
    parts.extend(["</ol>", "<h4>Watch-Out Pitfalls</h4>", "<ul>"])
    for pitfall in gp.pitfalls:
        parts.append(f"<li>{render_ruby_html(pitfall)}</li>")
    parts.extend(["</ul>", "</article>"])
    return parts


def _render_lesson_xhtml(lesson: Lesson) -> list[str]:
    lid = html.escape(lesson.lesson_id)
    badge = html.escape(lesson.format_badge())
    video_badge = ' <span class="badge">Video Lesson</span>' if lesson.has_video else ""
    parts = [
        f'<section id="{lid}" class="lesson">',
        f"<h2>{badge}: {html.escape(lesson.renshuu_title)}{video_badge}</h2>",
        f"<p><strong>Orientation:</strong> {render_ruby_html(lesson.summary)}</p>",
        f'<div class="callout"><p><strong>Study Tip:</strong> {render_ruby_html(lesson.study_tip)}</p></div>',
        "<h3>Lesson Snapshot</h3>",
        "<table><thead><tr><th>Pattern</th><th>Meaning</th><th>Register</th><th>Status</th></tr></thead><tbody>",
    ]
    for gp in lesson.grammar_points:
        reg = html.escape(REGISTER_LABELS[gp.register])
        st = html.escape(STATUS_LABELS[gp.renshuu_status])
        parts.append(
            "<tr>"
            f'<td><a href="#gp-{html.escape(gp.id)}">{render_ruby_html(gp.pattern_ruby)}</a></td>'
            f"<td>{render_ruby_html(gp.meaning_en)}</td>"
            f"<td>{reg}</td>"
            f"<td>{st}</td>"
            "</tr>"
        )
    parts.append("</tbody></table>")

    for gp in lesson.grammar_points:
        parts.extend(_render_grammar_card_xhtml(gp))

    contrast = lesson.lesson_contrast
    parts.extend(
        [
            f"<h3>Contrast: {render_ruby_html(contrast.title)}</h3>",
            f"<p>{render_ruby_html(contrast.explanation)}</p>",
            "<table><thead><tr><th>Expression</th><th>Register</th><th>Key Rule</th><th>Short Example</th></tr></thead><tbody>",
        ]
    )
    for row in contrast.rows:
        parts.append(
            "<tr>"
            f"<td>{render_ruby_html(row.expression)}</td>"
            f"<td>{html.escape(row.register)}</td>"
            f"<td>{render_ruby_html(row.key_rule)}</td>"
            f"<td>{render_ruby_html(row.example_short)}</td>"
            "</tr>"
        )
    parts.extend(["</tbody></table>", "<h3>Practice Checkup</h3>"])

    for q_idx, q in enumerate(lesson.practice_quiz, start=1):
        qlabel = html.escape(QUESTION_TYPE_LABELS[q.question_type])
        parts.extend(
            [
                '<div class="quiz-item">',
                f"<p><strong>Q{q_idx} ({qlabel}):</strong> {render_ruby_html(q.prompt_ja_ruby)}</p>",
                f"<p><em>Context:</em> {render_ruby_html(q.context_en)}</p>",
                "<ul>",
            ]
        )
        for c_idx, choice in enumerate(q.choices):
            parts.append(
                f"<li><strong>{CHOICE_LETTERS[c_idx]}.</strong> {render_ruby_html(choice)}</li>"
            )
        correct_choice = render_ruby_html(q.choices[q.correct_index])
        parts.extend(
            [
                "</ul>",
                '<div class="answer-box">',
                f"<p><strong>Answer ({html.escape(q.question_id)}): {CHOICE_LETTERS[q.correct_index]} — {correct_choice}</strong></p>",
                f"<p>{render_ruby_html(q.explanation)}</p>",
                "</div>",
                "</div>",
            ]
        )
    parts.append("</section>")
    return parts


def _render_unit_xhtml(unit: Unit) -> str:
    parts = [
        f'<section id="unit-{unit.unit_number:02d}" epub:type="chapter">',
        f"<h1>{html.escape(unit.unit_title)}</h1>",
        f"<p>{render_ruby_html(unit.unit_overview)}</p>",
    ]
    for lesson in unit.lessons:
        parts.extend(_render_lesson_xhtml(lesson))
    parts.append("</section>")
    return _wrap_xhtml(unit.unit_title, "../styles/guide.css", "\n".join(parts))


def _render_matrices_xhtml(matrices: tuple[SynonymMatrix, ...]) -> str:
    parts = [
        '<section id="synonym-matrices" epub:type="chapter">',
        "<h1>JLPT N3 Synonym Disambiguation Matrices (M01–M12)</h1>",
        "<p>Side-by-side comparison matrices and minimal-pair proofs for high-confusion intermediate grammar.</p>",
    ]
    for matrix in matrices:
        mid = html.escape(matrix.matrix_id)
        parts.extend(
            [
                f'<section id="{mid}" class="matrix">',
                f"<h2>{mid}: {render_ruby_html(matrix.title)}</h2>",
                f"<p><strong>Theme:</strong> {html.escape(matrix.theme)}</p>",
                f'<div class="callout"><p><strong>Decision Heuristic:</strong> {render_ruby_html(matrix.decision_heuristic)}</p></div>',
                "<table><thead><tr>",
                "".join(f"<th>{html.escape(col)}</th>" for col in matrix.columns),
                "</tr></thead><tbody>",
            ]
        )
        for row in matrix.rows:
            cells = "".join(f"<td>{render_ruby_html(cell)}</td>" for cell in row)
            parts.append(f"<tr>{cells}</tr>")
        parts.extend(["</tbody></table>", "<h3>Minimal-Pair Proofs</h3>", "<ul>"])
        for pair in matrix.minimal_pair_test:
            parts.append(
                "<li>"
                f"<p><strong>{render_ruby_html(pair.pair_title)}</strong></p>"
                f"<p><em>Natural:</em> {render_ruby_html(pair.sentence_valid)}<br/>"
                f"<em>Contrast:</em> {render_ruby_html(pair.sentence_contrast)}<br/>"
                f"<em>Why:</em> {render_ruby_html(pair.explanation)}</p>"
                "</li>"
            )
        parts.extend(["</ul>", "</section>"])
    parts.append("</section>")
    return _wrap_xhtml("Synonym Disambiguation Matrices", "../styles/guide.css", "\n".join(parts))


def build_epub(curriculum: Curriculum, epub_path: Path) -> None:
    """Assemble and validate a spec-compliant EPUB 3.3 archive at epub_path."""
    guide_css = (ASSETS_DIR / "epub.css").read_text(encoding="utf-8")
    container_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
        "  <rootfiles>\n"
        '    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>\n'
        "  </rootfiles>\n"
        "</container>\n"
    )

    nav_items = [
        '<li><a href="text/ch00_intro.xhtml#intro">Overview &amp; Master Syllabus</a></li>'
    ]
    play_order = 1
    ncx_points = [
        f'    <navPoint id="np-{play_order}" playOrder="{play_order}">'
        "<navLabel><text>Overview &amp; Master Syllabus</text></navLabel>"
        '<content src="text/ch00_intro.xhtml"/>'
        "</navPoint>"
    ]
    play_order += 1

    manifest_items = [
        '<item id="css" href="styles/guide.css" media-type="text/css"/>',
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="ch-intro" href="text/ch00_intro.xhtml" media-type="application/xhtml+xml"/>',
    ]
    spine_items = ['<itemref idref="ch-intro"/>']
    chapter_files: dict[str, bytes] = {
        "EPUB/text/ch00_intro.xhtml": _validate_xml_string(
            _render_intro_xhtml(curriculum), "ch00_intro.xhtml"
        )
    }

    for unit in curriculum.units:
        href = f"text/unit_{unit.unit_number:02d}.xhtml"
        item_id = f"ch-unit-{unit.unit_number:02d}"
        manifest_items.append(
            f'<item id="{item_id}" href="{href}" media-type="application/xhtml+xml"/>'
        )
        spine_items.append(f'<itemref idref="{item_id}"/>')
        chapter_files[f"EPUB/{href}"] = _validate_xml_string(_render_unit_xhtml(unit), href)

        unit_title_esc = html.escape(unit.unit_title, quote=False)
        sub_nav: list[str] = []
        sub_ncx: list[str] = []
        unit_po = play_order
        play_order += 1
        for lesson in unit.lessons:
            lid = html.escape(lesson.lesson_id)
            badge = html.escape(lesson.format_badge())
            ltitle = html.escape(lesson.renshuu_title, quote=False)
            sub_nav.append(f'<li><a href="{href}#{lid}">{badge}: {ltitle}</a></li>')
            sub_ncx.append(
                f'      <navPoint id="np-{play_order}" playOrder="{play_order}">'
                f"<navLabel><text>{badge}: {ltitle}</text></navLabel>"
                f'<content src="{href}#{lid}"/>'
                "</navPoint>"
            )
            play_order += 1

        nav_items.append(
            f'<li><a href="{href}">{unit_title_esc}</a><ol>{"".join(sub_nav)}</ol></li>'
        )
        ncx_points.append(
            f'    <navPoint id="np-{unit_po}" playOrder="{unit_po}">'
            f"<navLabel><text>{unit_title_esc}</text></navLabel>"
            f'<content src="{href}"/>\n' + "\n".join(sub_ncx) + "\n    </navPoint>"
        )

    manifest_items.append(
        '<item id="ch-matrices" href="text/matrices.xhtml" media-type="application/xhtml+xml"/>'
    )
    spine_items.append('<itemref idref="ch-matrices"/>')
    spine_items.append('<itemref idref="nav" linear="no"/>')
    chapter_files["EPUB/text/matrices.xhtml"] = _validate_xml_string(
        _render_matrices_xhtml(curriculum.matrices), "matrices.xhtml"
    )

    m_sub_nav: list[str] = []
    m_sub_ncx: list[str] = []
    m_unit_po = play_order
    play_order += 1
    for matrix in curriculum.matrices:
        mid = html.escape(matrix.matrix_id)
        mtitle = html.escape(strip_ruby_to_surface(matrix.title), quote=False)
        m_sub_nav.append(f'<li><a href="text/matrices.xhtml#{mid}">{mid}: {mtitle}</a></li>')
        m_sub_ncx.append(
            f'      <navPoint id="np-{play_order}" playOrder="{play_order}">'
            f"<navLabel><text>{mid}: {mtitle}</text></navLabel>"
            f'<content src="text/matrices.xhtml#{mid}"/>'
            "</navPoint>"
        )
        play_order += 1

    nav_items.append(
        f'<li><a href="text/matrices.xhtml">Synonym Disambiguation Matrices (M01–M12)</a><ol>{"".join(m_sub_nav)}</ol></li>'
    )
    ncx_points.append(
        f'    <navPoint id="np-{m_unit_po}" playOrder="{m_unit_po}">'
        "<navLabel><text>Synonym Disambiguation Matrices (M01–M12)</text></navLabel>"
        '<content src="text/matrices.xhtml"/>\n' + "\n".join(m_sub_ncx) + "\n    </navPoint>"
    )

    nav_body = (
        '<nav epub:type="toc" id="toc">\n'
        "  <h1>Table of Contents</h1>\n"
        f"  <ol>{''.join(nav_items)}</ol>\n"
        "</nav>\n"
        '<nav epub:type="landmarks" id="landmarks" hidden="">\n'
        "  <h2>Landmarks</h2>\n"
        "  <ol>\n"
        '    <li><a epub:type="toc" href="nav.xhtml#toc">Table of Contents</a></li>\n'
        '    <li><a epub:type="bodymatter" href="text/unit_01.xhtml">Unit 1</a></li>\n'
        "  </ol>\n"
        "</nav>"
    )
    nav_xhtml = _wrap_xhtml("Table of Contents", "styles/guide.css", nav_body)

    toc_ncx = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
        "  <head>\n"
        f'    <meta name="dtb:uid" content="{BOOK_UUID}"/>\n'
        '    <meta name="dtb:depth" content="2"/>\n'
        '    <meta name="dtb:totalPageCount" content="0"/>\n'
        '    <meta name="dtb:maxPageNumber" content="0"/>\n'
        "  </head>\n"
        "  <docTitle><text>Renshuu JLPT N3 Grammar Companion</text></docTitle>\n"
        "  <navMap>\n" + "\n".join(ncx_points) + "\n  </navMap>\n"
        "</ncx>\n"
    )

    modified_iso = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    package_opf = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">\n'
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        f'    <dc:identifier id="bookid">{BOOK_UUID}</dc:identifier>\n'
        "    <dc:title>Renshuu JLPT N3 Grammar Companion Study Guide</dc:title>\n"
        "    <dc:language>en</dc:language>\n"
        "    <dc:language>ja</dc:language>\n"
        "    <dc:creator>JLPT N3 Grammar Curriculum Reference</dc:creator>\n"
        f'    <meta property="dcterms:modified">{modified_iso}</meta>\n'
        "  </metadata>\n"
        "  <manifest>\n    " + "\n    ".join(manifest_items) + "\n  </manifest>\n"
        '  <spine toc="ncx">\n    ' + "\n    ".join(spine_items) + "\n  </spine>\n"
        "</package>\n"
    )

    validated_entries = {
        "META-INF/container.xml": _validate_xml_string(container_xml, "container.xml"),
        "EPUB/package.opf": _validate_xml_string(package_opf, "package.opf"),
        "EPUB/nav.xhtml": _validate_xml_string(nav_xhtml, "nav.xhtml"),
        "EPUB/toc.ncx": _validate_xml_string(toc_ncx, "toc.ncx"),
        "EPUB/styles/guide.css": guide_css.encode("utf-8"),
        **chapter_files,
    }

    epub_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(epub_path, "w") as archive:
        archive.writestr("mimetype", b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for arcname, payload in validated_entries.items():
            archive.writestr(arcname, payload, compress_type=zipfile.ZIP_DEFLATED)
