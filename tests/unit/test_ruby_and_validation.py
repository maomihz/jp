"""In-memory unit tests for ruby rendering and schema/linguistic boundary checks."""

from __future__ import annotations

import unittest

from renshuu_n3.curriculum_loader import parse_matrices_dict, parse_unit_dict
from renshuu_n3.models import EXPECTED_MATRIX_COLUMNS
from renshuu_n3.ruby import (
    ValidationError,
    check_literal_field,
    check_ruby_field,
    check_script_purity,
    escape_markdown_cell,
    render_ruby_html,
    render_ruby_markdown,
    strip_ruby_to_surface,
)


def make_synthetic_unit() -> dict[str, object]:
    """Return a minimal schema-valid synthetic unit payload using non-identifying test fixtures."""
    filler_text = "x " * 75
    return {
        "unit_number": 1,
        "unit_slug": "unit-01-sample",
        "unit_title": "Unit 1: Sample Grammar",
        "unit_overview": filler_text.strip(),
        "lessons": [
            {
                "lesson_id": "L01",
                "lesson_number": 1,
                "renshuu_title": "Sample Lesson",
                "has_video": True,
                "summary": filler_text.strip(),
                "study_tip": filler_text.strip(),
                "grammar_points": [
                    {
                        "id": "l01-g01",
                        "pattern": "〜て山",
                        "pattern_ruby": "〜て{山|やま}",
                        "meaning_en": "sample first pattern",
                        "register": "neutral",
                        "renshuu_status": "canonical_n3",
                        "mental_model": filler_text.strip(),
                        "formation": [{"pos": "{名詞|めいし}", "rule": "{山|やま}＋だ"}],
                        "examples": [
                            {
                                "ja_ruby": "{山|やま}に{登|のぼ}る。",
                                "structure_note": "{名詞|めいし}の例",
                                "en": "Climb a mountain.",
                            },
                            {
                                "ja_ruby": "{川|かわ}を{見|み}る。",
                                "structure_note": "basic transitive verb",
                                "en": "Look at a river.",
                            },
                            {
                                "ja_ruby": "{空|そら}が{青|あお}い。",
                                "structure_note": "simple い-adjective",
                                "en": "The sky is blue.",
                            },
                        ],
                        "pitfalls": [
                            "Sample pitfall explaining attachment constraint cleanly.",
                            "Second sample pitfall explaining semantic constraint cleanly.",
                        ],
                    },
                    {
                        "id": "l01-g02",
                        "pattern": "〜から川",
                        "pattern_ruby": "〜から{川|かわ}",
                        "meaning_en": "sample second pattern",
                        "register": "formal",
                        "renshuu_status": "canonical_n3",
                        "mental_model": filler_text.strip(),
                        "formation": [{"pos": "{名詞|めいし}", "rule": "{川|かわ}＋だ"}],
                        "examples": [
                            {
                                "ja_ruby": "{川|かわ}まで{歩|ある}く。",
                                "structure_note": "motion to destination",
                                "en": "Walk to the river.",
                            },
                            {
                                "ja_ruby": "{木|き}の{下|した}で{休|やす}む。",
                                "structure_note": "location marker で",
                                "en": "Rest under the tree.",
                            },
                            {
                                "ja_ruby": "{雨|あめ}が{降|ふ}る。",
                                "structure_note": "intransitive verb",
                                "en": "Rain falls.",
                            },
                        ],
                        "pitfalls": [
                            "Sample pitfall two A with sufficient length for validation.",
                            "Sample pitfall two B with sufficient length for validation.",
                        ],
                    },
                ],
                "lesson_contrast": {
                    "title": "Mountain vs River",
                    "explanation": "Compare the two sample patterns.",
                    "rows": [
                        {
                            "expression": "〜て{山|やま}",
                            "register": "Neutral",
                            "key_rule": "First sample rule",
                            "example_short": "{山|やま}だ。",
                        },
                        {
                            "expression": "〜から{川|かわ}",
                            "register": "Formal",
                            "key_rule": "Second sample rule",
                            "example_short": "{川|かわ}だ。",
                        },
                    ],
                },
                "practice_quiz": [
                    {
                        "question_id": "L01-Q1",
                        "question_type": "fill_blank",
                        "prompt_ja_ruby": "{山|やま}へ（　）。",
                        "context_en": "Going to the mountain.",
                        "choices": ["{行|い}く", "{来|く}る", "{見|み}る", "{聞|き}く"],
                        "correct_index": 0,
                        "explanation": "Explanation " + ("detail " * 20),
                    },
                    {
                        "question_id": "L01-Q2",
                        "question_type": "nuance_choice",
                        "prompt_ja_ruby": "{川|かわ}を（　）。",
                        "context_en": "Looking at the river.",
                        "choices": ["{見|み}る", "{歩|ある}く", "{走|はし}る", "{泳|およ}ぐ"],
                        "correct_index": 1,
                        "explanation": "Explanation " + ("detail " * 20),
                    },
                    {
                        "question_id": "L01-Q3",
                        "question_type": "attachment_trap",
                        "prompt_ja_ruby": "{空|そら}が（　）。",
                        "context_en": "Sky state.",
                        "choices": ["{青|あお}い", "{白|しろ}い", "{黒|くろ}い", "{赤|あか}い"],
                        "correct_index": 2,
                        "explanation": "Explanation " + ("detail " * 20),
                    },
                    {
                        "question_id": "L01-Q4",
                        "question_type": "star_order",
                        "prompt_ja_ruby": "{今日|きょう}は　＿　＿　★　＿　だ。",
                        "context_en": "Weather star puzzle.",
                        "choices": ["{晴|は}れ", "とても", "{静|しず}かな", "{朝|あさ}"],
                        "correct_index": 3,
                        "explanation": "Explanation " + ("detail " * 20),
                    },
                ],
            }
        ],
    }


class RubyEngineTests(unittest.TestCase):
    def test_render_ruby_html_escapes_unsafe_markup(self) -> None:
        raw = "{山|やま} & <script>alert(1)</script>"
        rendered = render_ruby_html(raw)
        self.assertEqual(
            rendered,
            "<ruby>山<rp>(</rp><rt>やま</rt><rp>)</rp></ruby> &amp; &lt;script&gt;alert(1)&lt;/script&gt;",
        )

    def test_render_ruby_markdown_and_pipe_escaping(self) -> None:
        self.assertEqual(render_ruby_markdown("{山|やま}を{見|み}る"), "山【やま】を見【み】る")
        self.assertEqual(escape_markdown_cell("A|B {山|やま}\nnext"), "A\\|B 山【やま】 next")
        self.assertEqual(strip_ruby_to_surface("{富士山|ふじさん}"), "富士山")

    def test_check_ruby_field_rejects_kana_leaks_and_bare_kanji(self) -> None:
        leaked_trailing: list[ValidationError] = []
        check_ruby_field("{食べ|たべ}る", "test", True, leaked_trailing)
        self.assertTrue(any("Kana characters" in e.message for e in leaked_trailing))

        leaked_internal: list[ValidationError] = []
        check_ruby_field("お{寺|てら} vs {お寺|おてら}", "test", True, leaked_internal)
        self.assertTrue(any("Kana characters" in e.message for e in leaked_internal))

        bad_katakana: list[ValidationError] = []
        check_ruby_field("{山|ヤマ}", "test", True, bad_katakana)
        self.assertTrue(any("pure hiragana" in e.message for e in bad_katakana))

        bare_kanji: list[ValidationError] = []
        check_ruby_field("山に{登|のぼ}る", "test", True, bare_kanji)
        self.assertTrue(any("Unannotated kanji" in e.message for e in bare_kanji))

        jukujikun_ok: list[ValidationError] = []
        check_ruby_field("{今日|きょう}は{大人|おとな}だ", "test", True, jukujikun_ok)
        self.assertEqual(jukujikun_ok, [])

    def test_check_literal_field_rejects_raw_ruby_braces(self) -> None:
        errors: list[ValidationError] = []
        check_literal_field("Testing {山|やま} attachment", "examples[0].en", errors)
        self.assertEqual(len(errors), 1)

    def test_check_script_purity_enforces_japanese_script_invariants(self) -> None:
        rejected_samples = (
            "Search by romaji or romanji",
            "Use keigo here",
            "Regular godan verb",
            "Attach te-form directly",
            "A na-adjective takes な",
            "Use V-ru before の",
            "Read as gen'in",
            "Compare with ~hodo",
            "Adjective fuan before の",
        )
        for sample in rejected_samples:
            sample_errors: list[ValidationError] = []
            check_script_purity(sample, "purity", sample_errors)
            self.assertTrue(sample_errors, f"Expected script purity rejection for {sample!r}")

        accepted_sample = (
            "{敬語|けいご} and {五段|ごだん} verbs use て-form, な-adjective, V-dict, "
            "while ~ing in Tokyo with furigana."
        )
        accepted_errors: list[ValidationError] = []
        check_script_purity(accepted_sample, "purity", accepted_errors)
        self.assertEqual(accepted_errors, [])


class BoundaryLoaderTests(unittest.TestCase):
    def test_parse_unit_dict_accepts_valid_fixture_and_rejects_quiz_defects(self) -> None:
        valid_errors: list[ValidationError] = []
        unit = parse_unit_dict(
            make_synthetic_unit(), "unit_01.json", set(), set(), set(), valid_errors
        )
        self.assertIsNotNone(unit)
        self.assertEqual(valid_errors, [])

        bad_payload = make_synthetic_unit()
        lessons = bad_payload["lessons"]
        assert isinstance(lessons, list)
        lesson0 = lessons[0]
        assert isinstance(lesson0, dict)
        gps = lesson0["grammar_points"]
        assert isinstance(gps, list)
        gp0 = gps[0]
        assert isinstance(gp0, dict)
        gp0["id"] = "custom-slug"
        gp0["romaji"] = "~te yama"
        examples = gp0["examples"]
        assert isinstance(examples, list)
        ex0 = examples[0]
        assert isinstance(ex0, dict)
        ex0["en"] = "Translation with {山|やま} leak"
        quiz = lesson0["practice_quiz"]
        assert isinstance(quiz, list)
        q0 = quiz[0]
        assert isinstance(q0, dict)
        q0["choices"] = ["{行|い}く", "{行|おこな}く", "{見|み}る", "{聞|き}く"]
        q0["correct_index"] = 5

        errors: list[ValidationError] = []
        parse_unit_dict(bad_payload, "unit_01.json", set(), set(), set(), errors)
        messages = [e.message for e in errors]
        self.assertTrue(any("Duplicate choice surface" in m for m in messages))
        self.assertTrue(any("Invalid correct_index" in m for m in messages))
        self.assertTrue(any("must not contain ruby braces" in m for m in messages))
        self.assertTrue(any("Unexpected keys in grammar point" in m for m in messages))
        self.assertTrue(any("must equal structural id" in m for m in messages))

    def test_parse_matrices_dict_enforces_exact_column_contract(self) -> None:
        raw = {
            "matrices": [
                {
                    "matrix_id": "M01",
                    "title": "Sample Matrix",
                    "theme": "Sample Theme",
                    "decision_heuristic": "1. " + ("criterion " * 10),
                    "columns": list(EXPECTED_MATRIX_COLUMNS),
                    "rows": [
                        ["{山|やま}", "N", "nuance", "none", "{山|やま}だ"],
                        ["{川|かわ}", "N", "nuance", "none", "{川|かわ}だ"],
                        ["{空|そら}", "N", "nuance", "none", "{空|そら}だ"],
                    ],
                    "minimal_pair_test": [
                        {
                            "pair_title": "Pair A",
                            "sentence_valid": "{山|やま}だ。",
                            "sentence_contrast": "× {川|かわ}だ。",
                            "explanation": "Clear explanation " * 4,
                        },
                        {
                            "pair_title": "Pair B",
                            "sentence_valid": "{空|そら}だ。",
                            "sentence_contrast": "× {海|うみ}だ。",
                            "explanation": "Clear explanation " * 4,
                        },
                    ],
                }
            ]
        }
        errors: list[ValidationError] = []
        matrices = parse_matrices_dict(raw, "synonym_matrices.json", errors)
        self.assertEqual(len(matrices), 1)
        self.assertTrue(any("Expected 12 matrices" in e.message for e in errors))
        non_count_errors = [e for e in errors if "Expected 12 matrices" not in e.message]
        self.assertEqual(non_count_errors, [])


if __name__ == "__main__":
    unittest.main()
