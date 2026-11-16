export const STORAGE_STARS_KEY = "renshuu_n3_stars_v1";
export const STORAGE_PREFS_KEY = "renshuu_n3_prefs_v1";
export const STORAGE_QUIZ_KEY = "renshuu_n3_quiz_v1";

export const VALID_FILTERS = new Set(["all", "unstarred", "starred", "bridge", "matrices"]);

export const DEFAULT_PREFS = Object.freeze({
  theme: "dark",
  ruby: "all",
  recall: "show",
  filter: "all",
});

export function createInitialState(
  initialRoute = { view: "overview", activeId: "overview", anchorId: null },
  initialFilter = "all",
  initialQuizAnswers = {},
) {
  return {
    view: initialRoute.view,
    activeId: initialRoute.activeId,
    anchorId: initialRoute.anchorId ?? null,
    filter: VALID_FILTERS.has(initialFilter) ? initialFilter : "all",
    query: initialRoute.view === "search" ? String(initialRoute.query ?? "") : "",
    quizAnswers: { ...initialQuizAnswers },
  };
}

export function toggleLessonStar(starredSet, lessonId) {
  const next = new Set(starredSet);
  if (next.has(lessonId)) {
    next.delete(lessonId);
  } else {
    next.add(lessonId);
  }
  return next;
}

export function setFilter(state, filter) {
  return { ...state, filter: VALID_FILTERS.has(filter) ? filter : "all" };
}

export function setQuery(state, query, fallbackRoute = null) {
  const trimmed = String(query ?? "").trim();
  if (trimmed) {
    return {
      ...state,
      view: "search",
      activeId: "search",
      anchorId: null,
      query,
    };
  }
  if (fallbackRoute) {
    return {
      ...state,
      view: fallbackRoute.view,
      activeId: fallbackRoute.activeId,
      anchorId: fallbackRoute.anchorId ?? null,
      query,
    };
  }
  if (state.view === "search") {
    return {
      ...state,
      view: "overview",
      activeId: "overview",
      anchorId: null,
      query,
    };
  }
  return { ...state, query };
}

export function recordQuizAnswer(state, questionId, choiceIndex) {
  return {
    ...state,
    quizAnswers: {
      ...state.quizAnswers,
      [questionId]: choiceIndex,
    },
  };
}

export function resetLessonQuiz(state, questionIds) {
  const nextAnswers = { ...state.quizAnswers };
  for (const qid of questionIds) {
    delete nextAnswers[qid];
  }
  return { ...state, quizAnswers: nextAnswers };
}

export function parseHashRoute(hashValue) {
  const cleaned = String(hashValue ?? "").replace(/^#/, "").trim();
  if (!cleaned || cleaned === "overview") {
    return { view: "overview", activeId: "overview", anchorId: null };
  }
  if (cleaned.startsWith("search/")) {
    const encoded = cleaned.slice(7);
    let decoded = encoded;
    try {
      decoded = decodeURIComponent(encoded);
    } catch {
      // Keep raw string when URI decoding fails on partial hash.
    }
    return { view: "search", activeId: "search", anchorId: null, query: decoded };
  }
  const [section, primaryId, subAnchor] = cleaned.split("/");
  if (section === "lesson" && primaryId) {
    return { view: "lesson", activeId: primaryId, anchorId: subAnchor || null };
  }
  if (section === "matrix" && primaryId) {
    return { view: "matrix", activeId: primaryId, anchorId: null };
  }
  return { view: "overview", activeId: "overview", anchorId: null };
}

export function formatHashRoute(view, activeId, anchorId = null, query = "") {
  if (view === "search") {
    const trimmed = String(query ?? "").trim();
    return trimmed ? `#search/${encodeURIComponent(trimmed)}` : "#overview";
  }
  if (view === "lesson" && activeId) {
    return anchorId ? `#lesson/${activeId}/${anchorId}` : `#lesson/${activeId}`;
  }
  if (view === "matrix" && activeId) {
    return `#matrix/${activeId}`;
  }
  return "#overview";
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadSavedStars(storage) {
  try {
    const raw = resolveStorage(storage)?.getItem(STORAGE_STARS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveStars(starredSet, storage) {
  try {
    resolveStorage(storage)?.setItem(STORAGE_STARS_KEY, JSON.stringify([...starredSet]));
  } catch {
    // Ignore storage quota or sandbox restrictions.
  }
}

export function loadSavedPrefs(storage) {
  try {
    const raw = resolveStorage(storage)?.getItem(STORAGE_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PREFS };
    return {
      theme: parsed.theme === "light" ? "light" : "dark",
      ruby: parsed.ruby === "hover" || parsed.ruby === "off" ? parsed.ruby : "all",
      recall: parsed.recall === "blur" ? "blur" : "show",
      filter: VALID_FILTERS.has(parsed.filter) ? parsed.filter : "all",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs, storage) {
  try {
    resolveStorage(storage)?.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or sandbox restrictions.
  }
}

export function loadSavedQuizAnswers(storage) {
  try {
    const raw = resolveStorage(storage)?.getItem(STORAGE_QUIZ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const cleaned = {};
    for (const [qid, choiceIndex] of Object.entries(parsed)) {
      if (typeof choiceIndex === "number" && Number.isInteger(choiceIndex) && choiceIndex >= 0 && choiceIndex <= 3) {
        cleaned[qid] = choiceIndex;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function saveQuizAnswers(quizAnswers, storage) {
  try {
    resolveStorage(storage)?.setItem(STORAGE_QUIZ_KEY, JSON.stringify(quizAnswers ?? {}));
  } catch {
    // Ignore storage quota or sandbox restrictions.
  }
}
