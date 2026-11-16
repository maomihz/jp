# Repository Engineering Invariants

## Strict Zero-Romaji Ban
- **Ban romaji everywhere:** Never include romanized Japanese words, grammar patterns, inflections, particles, readings, or romanized identifiers/slugs in `curriculum/`, `renshuu_n3/`, `web/`, `tests/`, documentation, UI labels, search indices, or compiled `dist/` outputs.
- **Required representation:** Write all Japanese grammar patterns, words, readings, inflections (`て-form`, `た-form`, `ない-form`, `ます-stem`, `ば-form`, `V-dictionary`, `V-る`, `V-た`, `V-ない`, `V-ます`, `い-adjective`, `な-adjective`, `{五段|ごだん}`, `{一段|いちだん}`, `{敬語|けいご}`), and particle references in native Japanese script (`漢字` with inline `{Base|Reading}` hiragana furigana, `ひらがな`, or `カタカナ`) paired with natural English prose.
- **Identifiers:** Use structural identifiers exclusively (`unit-01-*`–`unit-12-*` English topic slugs, `L01`–`L55`, `B01`–`B03`, `l01-g01`, `L01-Q1`, `M01`–`M12`) rather than romanized slugs.
- **Permitted English lexicon:** Standard English words, English script names (`kanji`, `kana`, `hiragana`, `katakana`, `furigana`), and conventional English proper nouns in translations (`JLPT`, `Renshuu`, `Tokyo`, `Kyoto`, `Hokkaido`, `Mount Fuji`) are permitted outside banned romaji patterns.
- **Enforcement boundary:** `renshuu_n3/ruby.py` (`check_script_purity`), `renshuu_n3/curriculum_loader.py`, and `renshuu_n3/verifier.py` enforce schema purity and reject any romaji at validation and build verification time; tests verify this contract directly rather than weakening assertions.

## Single-Source & Verification Gate
- **Canonical source:** Edit `curriculum/*.json` as the sole source of truth and compile deliverables into gitignored `dist/` via `python3 -m renshuu_n3 build`.
- **Okurigana & ruby boundaries:** Keep all okurigana and prefix/suffix kana outside `{Base|Reading}` braces unless explicitly listed in `JUKUJIKUN_ALLOWLIST`, and keep `{Base|Reading}` tokens out of strict literal fields (`renshuu_title`, `unit_title`, `unit_slug`, `theme`, `examples[*].en`).
- **Pre-commit gate:** All checks must pass cleanly after edits: `ruff check .`, `ruff format --check .`, `python3 -m unittest discover -s tests -v`, `node --test tests/unit/web_frontend.test.mjs`, and `python3 -m renshuu_n3 validate` + `build` + `verify`.
