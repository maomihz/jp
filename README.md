# Renshuu JLPT N3 Grammar Companion

Modular curriculum source, boundary validator, and multi-format study guide compiler paired 1-to-1 with all **55 lessons** of Renshuu's `Intermediate/JLPT N3 Grammar` deck (`#01`–`#55`), extended with **3 Exam-Bridge modules** (`B1`–`B3`, `220` total grammar entries, `232` 4-choice diagnostic questions) and **12 Synonym Disambiguation Matrices** (`M01`–`M12`).

## Architecture

- `AGENTS.md` — Repository engineering invariants, native Japanese script policy, and quality gates.
- `curriculum/` — Single canonical source of truth (`unit_01_lessons_01_05.json` .. `unit_12_exam_bridge.json` and `synonym_matrices.json`) using inline `{Base|Reading}` furigana notation and structural IDs (`l01-g01` .. `b03-g04`).
- `renshuu_n3/` — Zero-dependency Python 3.12+ package:
  - `models.py` — Immutable domain dataclasses (`Curriculum`, `Unit`, `Lesson`, `GrammarPoint`, `SynonymMatrix`) and canonical Renshuu syllabus constants.
  - `ruby.py` — Furigana syntax validator, kana-leak checker, literal-field guard, and HTML/Markdown renderers.
  - `curriculum_loader.py` — Single-pass boundary parser and schema validator.
  - `markdown_builder.py`, `epub_builder.py`, `web_builder.py` — Synchronized format compilers.
  - `verifier.py` & `cli.py` — End-to-end build verification (including `epubcheck` and `node --check`) and local HTTP dev server.
- `web/` — Unbundled modular frontend (`index.html`, `styles/main.css`, and ES modules `js/{app,data,ruby,state,views}.js`) consuming a lightweight `manifest.json` index plus lazy-loaded per-unit JSON payloads.
- `tests/` — In-memory Python + Node unit tests (`tests/unit/`) and end-to-end pipeline + HTTP loopback integration tests (`tests/integration/`).
- `dist/` — Gitignored build output directory containing compiled deliverables (`dist/site/`, `dist/renshuu-n3-companion.epub`, `dist/guide/`).

## Quickstart

Validate curriculum integrity, compile all three study formats into `dist/`, and verify every output:

```bash
python3 -m renshuu_n3 validate
python3 -m renshuu_n3 build
python3 -m renshuu_n3 verify
```

Serve the modular web study guide over local HTTP (auto-builds `dist/site/` if absent):

```bash
python3 -m renshuu_n3 serve --port 8000
```

Then open `http://127.0.0.1:8000/` in any browser for instant global `/` search, furigana toggle (`On` / `Hover` / `Off`), active-recall translation blur, Renshuu `#01`–`#55` star tracking (`localStorage`), Dark/Light themes, and self-grading quizzes.

### Offline Reading Formats (`dist/`)

- **E-Reader Book:** `dist/renshuu-n3-companion.epub` (EPUB 3.3 with native `<ruby>` furigana, linked two-level TOC, and reader-controlled themes).
- **GitHub-Flavored Markdown:** `dist/guide/00-master-index.md` linking unit guides `unit-01-lessons-01-05.md` .. `unit-12-exam-bridge.md` and `13-synonym-matrices.md` (`漢字【かんじ】` notation and collapsible `<details>` quiz answers).

## Development Checks

```bash
ruff check .
ruff format --check .
python3 -m unittest discover -s tests -v
node --test tests/unit/web_frontend.test.mjs
```
