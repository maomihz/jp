import assert from "node:assert/strict";
import test from "node:test";

import { createCurriculumStore } from "../../web/js/data.js";
import { escapeHtml, renderRubyHtml, stripRubySurface, toSearchableText } from "../../web/js/ruby.js";
import {
  createInitialState,
  formatHashRoute,
  loadSavedPrefs,
  loadSavedQuizAnswers,
  loadSavedStars,
  parseHashRoute,
  recordQuizAnswer,
  resetLessonQuiz,
  savePrefs,
  saveQuizAnswers,
  saveStars,
  setQuery,
  toggleLessonStar,
} from "../../web/js/state.js";
import {
  countStarredBridgeLessons,
  countStarredRenshuuLessons,
  formatProgressLabel,
  lessonBadge,
  renderLessonHtml,
  renderMatrixHtml,
  renderOverviewHtml,
  renderSearchResultsHtml,
  renderSidebarHtml,
  searchCurriculum,
} from "../../web/js/views.js";

function createMemoryStorage() {
  const backing = new Map();
  return {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
  };
}

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
            summary: "Sample {山|やま} orientation. See Lesson 12 later.",
            unit_number: 1,
            related_matrices: ["M01"],
            grammar_index: [
              {
                id: "l01-g01",
                pattern: "〜に対して",
                pattern_ruby: "〜に{対|たい}して",
                meaning_en: "mountain sample contrast",
                mental_model_search: "climb peak やま",
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
            related_matrices: [],
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
        related_lessons: ["L01"],
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
      related_matrices: ["M01"],
      grammar_points: [
        {
          id: "l01-g01",
          pattern: "〜に対して",
          pattern_ruby: "〜に{対|たい}して",
          meaning_en: "mountain sample",
          register: "neutral",
          renshuu_status: "canonical_n3",
          mental_model: "Picture *climbing* a **steep** trail.",
          formation: [{ pos: "{名詞|めいし}", rule: "{山|やま}＋`だ`" }],
          examples: [
            { ja_ruby: "{山|やま}へ{行|い}く。", en: "Go to the mountain.", structure_note: "directional particle へ" },
          ],
          pitfalls: ["Watch attachment rules cleanly."],
        },
      ],
      lesson_contrast: {
        title: "Comparison",
        explanation: "Short note.",
        rows: [
          { expression: "〜に{対|たい}して", register: "Neutral", key_rule: "sample rule", example_short: "{山|やま}だ" },
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
          explanation: "Correct: A ({行|い}く).",
        },
      ],
    },
  };
}

function makeSyntheticMatrixPayload() {
  return {
    matrix_id: "M01",
    title: "{山|やま} vs {川|かわ} — Landscape",
    theme: "Landscape",
    decision_heuristic: "Pick {山|やま} for peaks.",
    related_lessons: ["L01"],
    columns: ["Pattern", "Formation Key", "Speaker Nuance", "Constraints", "Canonical Example"],
    rows: [
      ["〜に対して", "N + に対して", "Targeted attitude nuance.", "Use before verbs.", "{山|やま}へ。"],
    ],
    minimal_pair_test: [
      {
        pair_title: "Peak vs valley",
        sentence_valid: "{山|やま}だ。",
        sentence_contrast: "× {川|かわ}だ。",
        explanation: "Mountains rise above plains.",
      },
    ],
  };
}

test("ruby helpers escape HTML, format emphasis, and build contiguous search text", () => {
  assert.equal(escapeHtml('<a & "b">'), "&lt;a &amp; &quot;b&quot;&gt;");
  assert.equal(
    renderRubyHtml("{山|やま} & <b> *peak* **high** `に`"),
    "<ruby>山<rp>(</rp><rt>やま</rt><rp>)</rp></ruby> &amp; &lt;b&gt; <em>peak</em> <strong>high</strong> <code>に</code>",
  );
  assert.equal(stripRubySurface("{富士山|ふじさん}"), "富士山");
  assert.equal(toSearchableText("{富士山|ふじさん}"), "富士山 ふじさん");
  assert.equal(toSearchableText("〜に{対|たい}して"), "〜に対して 〜にたいして");
});

test("state, search routing, and persistence helpers preserve immutability", () => {
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
  assert.deepEqual(parseHashRoute("#search/%E3%82%8F%E3%81%91"), {
    view: "search",
    activeId: "search",
    anchorId: null,
    query: "わけ",
  });
  assert.equal(formatHashRoute("lesson", "L02", "gp-abc"), "#lesson/L02/gp-abc");
  assert.equal(formatHashRoute("search", "search", null, "わけ"), "#search/%E3%82%8F%E3%81%91");

  const stars = toggleLessonStar(new Set(), "L01");
  assert.equal(stars.has("L01"), true);
  assert.equal(toggleLessonStar(stars, "L01").has("L01"), false);

  const storage = createMemoryStorage();
  savePrefs({ theme: "light", ruby: "hover", recall: "blur", filter: "bridge" }, storage);
  assert.deepEqual(loadSavedPrefs(storage), {
    theme: "light",
    ruby: "hover",
    recall: "blur",
    filter: "bridge",
  });

  const initial = createInitialState();
  const answered = recordQuizAnswer(initial, "L01-Q1", 2);
  assert.equal(initial.quizAnswers["L01-Q1"], undefined);
  assert.equal(answered.quizAnswers["L01-Q1"], 2);
  saveQuizAnswers(answered.quizAnswers, storage);
  assert.deepEqual(loadSavedQuizAnswers(storage), { "L01-Q1": 2 });
  const reset = resetLessonQuiz(answered, ["L01-Q1"]);
  assert.equal(reset.quizAnswers["L01-Q1"], undefined);

  const searchState = createInitialState(parseHashRoute("#search/%E3%82%8F%E3%81%91"));
  assert.deepEqual(
    setQuery(searchState, "", { view: "lesson", activeId: "L01", anchorId: "gp-l01-g01" }),
    {
      view: "lesson",
      activeId: "L01",
      anchorId: "gp-l01-g01",
      filter: "all",
      query: "",
      quizAnswers: {},
    },
  );
  assert.deepEqual(
    setQuery(createInitialState(), "わけ", { view: "overview", activeId: "overview", anchorId: null }),
    {
      view: "search",
      activeId: "search",
      anchorId: null,
      filter: "all",
      query: "わけ",
      quizAnswers: {},
    },
  );
});

test("view renderers support filters, search edge cases, cross-links, and quiz states", () => {
  const manifest = makeSyntheticManifest();
  const starred = new Set(["L01", "B01"]);
  assert.equal(countStarredRenshuuLessons(manifest, starred), 1);
  assert.equal(countStarredBridgeLessons(manifest, starred), 1);
  assert.equal(formatProgressLabel(manifest, starred), "★ 1 / 1 (+1 Bridge)");
  assert.equal(lessonBadge(manifest.units[0].lessons[0]), "#01");
  assert.equal(lessonBadge(manifest.units[0].lessons[1]), "B1");

  const starredState = { ...createInitialState(), filter: "starred" };
  const sidebarStarred = renderSidebarHtml(manifest, starredState, starred);
  assert.match(sidebarStarred, /data-nav="lesson:L01"/);
  assert.match(sidebarStarred, /data-nav="lesson:B01"/);

  const emptyStarredSidebar = renderSidebarHtml(manifest, starredState, new Set());
  assert.match(emptyStarredSidebar, /data-reset-filter/);

  const overview = renderOverviewHtml(manifest, starred);
  assert.match(overview, /data-open-lesson="L01"/);
  assert.match(overview, /data-star="L01"/);
  assert.match(overview, /data-open-matrix="M01"/);

  assert.equal(searchCurriculum(manifest, "たいして").matchedPoints.length, 1);
  assert.equal(searchCurriculum(manifest, "~に対して").matchedPoints.length, 1);
  assert.equal(searchCurriculum(manifest, "mountain contrast").matchedPoints.length, 1);
  assert.deepEqual(
    searchCurriculum(manifest, "01").matchedLessons.map((ls) => ls.lesson_id),
    ["L01"],
  );
  assert.deepEqual(
    searchCurriculum(manifest, "B1").matchedLessons.map((ls) => ls.lesson_id),
    ["B01"],
  );

  const searchHtml = renderSearchResultsHtml(manifest, "たいして");
  assert.match(searchHtml, /1 grammar point\(s\)/);
  assert.match(searchHtml, /data-jump="L01::gp-l01-g01"/);

  const { unit, lesson } = makeSyntheticLessonPayload();
  const wrongState = recordQuizAnswer(createInitialState(), "L01-Q1", 1);
  const lessonWrongHtml = renderLessonHtml(lesson, unit, manifest, wrongState, starred);
  assert.match(lessonWrongHtml, /<em>climbing<\/em>/);
  assert.match(lessonWrongHtml, /<strong>steep<\/strong>/);
  assert.match(lessonWrongHtml, /data-open-matrix="M01"/);
  assert.match(lessonWrongHtml, /<span class="recall-target">sample rule<\/span>/);
  assert.match(lessonWrongHtml, /quiz-expl wrong/);

  const correctState = recordQuizAnswer(createInitialState(), "L01-Q1", 0);
  const lessonCorrectHtml = renderLessonHtml(lesson, unit, manifest, correctState, starred);
  assert.match(lessonCorrectHtml, /<ruby>山<rp>\(<\/rp><rt>やま<\/rt><rp>\)<\/rp><\/ruby>/);
  assert.doesNotMatch(lessonCorrectHtml, /Romaji/i);
  assert.match(lessonCorrectHtml, /choice-btn correct/);
  assert.match(lessonCorrectHtml, /quiz-expl correct/);
  assert.match(lessonCorrectHtml, /1 \/ 1 Answered, 1 Correct/);

  const matrix = makeSyntheticMatrixPayload();
  const matrixHtml = renderMatrixHtml(matrix, [matrix], manifest);
  assert.match(matrixHtml, /data-open-lesson="L01"/);
  assert.match(matrixHtml, /<span class="recall-target">Targeted attitude nuance\.<\/span>/);
});

test("curriculum store preserves global fetch receiver, caches payloads, and reports HTTP errors", async () => {
  const originalFetch = globalThis.fetch;
  const manifest = makeSyntheticManifest();
  const { unit, lesson } = makeSyntheticLessonPayload();
  const unitPayload = { ...unit, lessons: [lesson] };
  const matrixPayload = { matrices: [makeSyntheticMatrixPayload()] };
  const callCounts = new Map();

  globalThis.fetch = async function (url) {
    if (this !== globalThis) {
      throw new TypeError("Illegal invocation");
    }
    const target = String(url);
    callCounts.set(target, (callCounts.get(target) ?? 0) + 1);
    if (target === "./data/manifest.json") {
      return { ok: true, status: 200, json: async () => manifest };
    }
    if (target === "./data/units/unit_01.json") {
      return { ok: true, status: 200, json: async () => unitPayload };
    }
    if (target === "./data/matrices.json") {
      return { ok: true, status: 200, json: async () => matrixPayload };
    }
    if (target === "./err/manifest.json") {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  try {
    const store = createCurriculumStore("./data");
    const first = await store.loadLesson("L01");
    assert.equal(first?.lesson.lesson_id, "L01");
    assert.equal(first?.unit.unit_number, 1);

    const second = await store.loadLesson("L01");
    assert.equal(second?.lesson.lesson_id, "L01");
    assert.equal(callCounts.get("./data/manifest.json"), 1);
    assert.equal(callCounts.get("./data/units/unit_01.json"), 1);

    assert.equal(await store.loadLesson("L99"), null);

    const matrix = await store.loadMatrix("M01");
    assert.equal(matrix?.matrix_id, "M01");
    assert.equal((await store.loadMatrices()).length, 1);
    assert.equal(callCounts.get("./data/matrices.json"), 1);
    assert.equal(await store.loadMatrix("M99"), null);

    await assert.rejects(() => store.loadUnit(99), /Unknown unit number/);

    const errStore = createCurriculumStore("./err");
    await assert.rejects(() => errStore.loadManifest(), /HTTP 500/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("storage helpers fall back cleanly when localStorage property access throws", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });

  try {
    assert.deepEqual([...loadSavedStars()], []);
    assert.doesNotThrow(() => saveStars(new Set(["L01"])));
    assert.deepEqual(loadSavedPrefs(), {
      theme: "dark",
      ruby: "all",
      recall: "show",
      filter: "all",
    });
    assert.doesNotThrow(() =>
      savePrefs({ theme: "light", ruby: "all", recall: "show", filter: "all" }),
    );
    assert.deepEqual(loadSavedQuizAnswers(), {});
    assert.doesNotThrow(() => saveQuizAnswers({ "L01-Q1": 1 }));
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "localStorage", descriptor);
    } else {
      delete globalThis.localStorage;
    }
  }
});
