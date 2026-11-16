import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml, renderRubyHtml, stripRubySurface, toSearchableText } from "../../web/js/ruby.js";
import {
  createInitialState,
  formatHashRoute,
  parseHashRoute,
  recordQuizAnswer,
  resetLessonQuiz,
  toggleLessonStar,
} from "../../web/js/state.js";
import {
  countStarredRenshuuLessons,
  lessonBadge,
  renderLessonHtml,
  renderOverviewHtml,
  renderSearchResultsHtml,
  renderSidebarHtml,
} from "../../web/js/views.js";

function makeSyntheticManifest() {
  return {
    total_renshuu_lessons: 1,
    total_lessons: 2,
    total_grammar_points: 2,
    total_questions: 1,
    units: [
      {
        unit_number: 1,
        unit_slug: "unit-01-sample",
        unit_title: "Unit 1: Sample Foundations",
        unit_file: "units/unit_01.json",
        lessons: [
          {
            lesson_id: "L01",
            lesson_number: 1,
            renshuu_title: "Sample Lesson One",
            has_video: true,
            summary: "Sample {山|やま} orientation.",
            unit_number: 1,
            grammar_index: [
              {
                id: "sample-one",
                pattern: "〜て山",
                pattern_ruby: "〜て{山|やま}",
                romaji: "~te yama",
                meaning_en: "mountain sample",
                mental_model_search: "climb peak yama",
              },
            ],
          },
          {
            lesson_id: "B01",
            lesson_number: "B1",
            renshuu_title: "Bridge Sample",
            has_video: false,
            summary: "Sample bridge summary.",
            unit_number: 1,
            grammar_index: [],
          },
        ],
      },
    ],
    matrices: [
      {
        matrix_id: "M01",
        title: "{山|やま} vs {川|かわ} — Landscape",
        theme: "Landscape",
        decision_heuristic_search: "check height versus flow",
      },
    ],
  };
}

function makeSyntheticLessonPayload() {
  return {
    unit: { unit_number: 1, unit_title: "Unit 1: Sample Foundations" },
    lesson: {
      lesson_id: "L01",
      lesson_number: 1,
      renshuu_title: "Sample Lesson One",
      has_video: true,
      summary: "Sample {山|やま} orientation.",
      study_tip: "Check particle links.",
      grammar_points: [
        {
          id: "sample-one",
          pattern: "〜て山",
          pattern_ruby: "〜て{山|やま}",
          romaji: "~te yama",
          meaning_en: "mountain sample",
          register: "neutral",
          renshuu_status: "canonical_n3",
          mental_model: "Picture climbing a trail.",
          formation: [{ pos: "{名詞|めいし}", rule: "{山|やま}＋だ" }],
          examples: [
            { ja_ruby: "{山|やま}へ{行|い}く。", en: "Go to the mountain.", structure_note: "directional he" },
          ],
          pitfalls: ["Watch attachment rules cleanly."],
        },
      ],
      lesson_contrast: {
        title: "Comparison",
        explanation: "Short note.",
        rows: [
          { expression: "〜て{山|やま}", register: "Neutral", key_rule: "sample rule", example_short: "{山|やま}だ" },
        ],
      },
      practice_quiz: [
        {
          question_id: "L01-Q1",
          question_type: "fill_blank",
          prompt_ja_ruby: "{山|やま}へ（　）。",
          context_en: "Going to the mountain.",
          choices: ["{行|い}く", "{来|く}る", "{見|み}る", "{聞|き}く"],
          correct_index: 0,
          explanation: "Explanation for {行|い}く.",
        },
      ],
    },
  };
}

test("ruby helpers escape HTML and format furigana tags cleanly", () => {
  assert.equal(escapeHtml('<a & "b">'), "&lt;a &amp; &quot;b&quot;&gt;");
  assert.equal(
    renderRubyHtml("{山|やま} & <b>"),
    "<ruby>山<rp>(</rp><rt>やま</rt><rp>)</rp></ruby> &amp; &lt;b&gt;",
  );
  assert.equal(stripRubySurface("{富士山|ふじさん}"), "富士山");
  assert.equal(toSearchableText("{富士山|ふじさん}"), "富士山 ふじさん");
});

test("state and hash routing preserve immutability and star counts", () => {
  assert.deepEqual(parseHashRoute("#lesson/L01/gp-sample"), {
    view: "lesson",
    activeId: "L01",
    anchorId: "gp-sample",
  });
  assert.deepEqual(parseHashRoute("#matrix/M03"), {
    view: "matrix",
    activeId: "M03",
    anchorId: null,
  });
  assert.equal(formatHashRoute("lesson", "L02", "gp-abc"), "#lesson/L02/gp-abc");

  const stars = toggleLessonStar(new Set(), "L01");
  assert.equal(stars.has("L01"), true);
  assert.equal(toggleLessonStar(stars, "L01").has("L01"), false);

  const initial = createInitialState();
  const answered = recordQuizAnswer(initial, "L01-Q1", 2);
  assert.equal(initial.quizAnswers["L01-Q1"], undefined);
  assert.equal(answered.quizAnswers["L01-Q1"], 2);
  const reset = resetLessonQuiz(answered, ["L01-Q1"]);
  assert.equal(reset.quizAnswers["L01-Q1"], undefined);
});

test("view renderers build sidebar, overview, search hits, and graded lesson HTML", () => {
  const manifest = makeSyntheticManifest();
  const starred = new Set(["L01", "B01"]);
  assert.equal(countStarredRenshuuLessons(manifest, starred), 1);
  assert.equal(lessonBadge(manifest.units[0].lessons[0]), "#01");
  assert.equal(lessonBadge(manifest.units[0].lessons[1]), "B1");

  const state = { ...createInitialState(), filter: "starred" };
  const sidebar = renderSidebarHtml(manifest, state, starred);
  assert.match(sidebar, /data-nav="lesson:L01"/);
  assert.doesNotMatch(sidebar, /data-nav="lesson:B01"/);

  const overview = renderOverviewHtml(manifest, starred);
  assert.match(overview, /data-open-lesson="L01"/);
  assert.match(overview, /data-open-matrix="M01"/);

  const searchHtml = renderSearchResultsHtml(manifest, "yama");
  assert.match(searchHtml, /1 grammar point\(s\)/);
  assert.match(searchHtml, /data-jump="L01::gp-sample-one"/);

  const { unit, lesson } = makeSyntheticLessonPayload();
  const gradedState = recordQuizAnswer(createInitialState(), "L01-Q1", 0);
  const lessonHtml = renderLessonHtml(lesson, unit, manifest, gradedState, starred);
  assert.match(lessonHtml, /<ruby>山<rp>\(<\/rp><rt>やま<\/rt><rp>\)<\/rp><\/ruby>/);
  assert.match(lessonHtml, /choice-btn correct/);
  assert.match(lessonHtml, /1 \/ 1 Answered, 1 Correct/);
});
