export const STORAGE_STARS_KEY = "renshuu_n3_stars_v1";
export const STORAGE_PREFS_KEY = "renshuu_n3_prefs_v1";

export const DEFAULT_PREFS = Object.freeze({
  theme: "dark",
  ruby: "all",
  recall: "show",
});

export function createInitialState(initialRoute = { view: "overview", activeId: "overview", anchorId: null }) {
  return {
    view: initialRoute.view,
    activeId: initialRoute.activeId,
    anchorId: initialRoute.anchorId ?? null,
    filter: "all",
    query: "",
    quizAnswers: {},
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
  return { ...state, filter };
}

export function setQuery(state, query) {
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
  const [section, primaryId, subAnchor] = cleaned.split("/");
  if (section === "lesson" && primaryId) {
    return { view: "lesson", activeId: primaryId, anchorId: subAnchor || null };
  }
  if (section === "matrix" && primaryId) {
    return { view: "matrix", activeId: primaryId, anchorId: null };
  }
  return { view: "overview", activeId: "overview", anchorId: null };
}

export function formatHashRoute(view, activeId, anchorId = null) {
  if (view === "lesson" && activeId) {
    return anchorId ? `#lesson/${activeId}/${anchorId}` : `#lesson/${activeId}`;
  }
  if (view === "matrix" && activeId) {
    return `#matrix/${activeId}`;
  }
  return "#overview";
}

export function loadSavedStars(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_STARS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveStars(starredSet, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_STARS_KEY, JSON.stringify([...starredSet]));
  } catch {
    // Ignore storage quota or sandbox restrictions.
  }
}

export function loadSavedPrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PREFS };
    return {
      theme: parsed.theme === "light" ? "light" : "dark",
      ruby: parsed.ruby === "hover" || parsed.ruby === "off" ? parsed.ruby : "all",
      recall: parsed.recall === "blur" ? "blur" : "show",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or sandbox restrictions.
  }
}
