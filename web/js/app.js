import { createCurriculumStore } from "./data.js";
import { escapeHtml } from "./ruby.js";
import {
  createInitialState,
  formatHashRoute,
  loadSavedPrefs,
  loadSavedStars,
  parseHashRoute,
  recordQuizAnswer,
  resetLessonQuiz,
  savePrefs,
  saveStars,
  setFilter,
  setQuery,
  toggleLessonStar,
} from "./state.js";
import {
  countStarredRenshuuLessons,
  renderLessonHtml,
  renderMatrixHtml,
  renderOverviewHtml,
  renderSearchResultsHtml,
  renderSidebarHtml,
} from "./views.js";

const store = createCurriculumStore("./data");

let manifest = null;
let starredSet = loadSavedStars();
let prefs = loadSavedPrefs();
let state = createInitialState(parseHashRoute(window.location.hash));
let activeRenderToken = 0;

function applyPrefs() {
  savePrefs(prefs);
  document.documentElement.setAttribute("data-theme", prefs.theme);
  document.documentElement.setAttribute("data-ruby", prefs.ruby);
  document.documentElement.setAttribute("data-recall", prefs.recall);

  document
    .querySelectorAll("[data-ruby-opt]")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.rubyOpt === prefs.ruby));
  document
    .querySelectorAll("[data-recall-opt]")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.recallOpt === prefs.recall));
  document
    .querySelectorAll("[data-theme-opt]")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.themeOpt === prefs.theme));
}

function updateProgressPill() {
  if (!manifest) return;
  const count = countStarredRenshuuLessons(manifest, starredSet);
  document.getElementById("progress-pill").textContent = `★ ${count} / ${manifest.total_renshuu_lessons}`;
}

function renderSidebar() {
  if (!manifest) return;
  document.getElementById("nav-scroll").innerHTML = renderSidebarHtml(manifest, state, starredSet);
}

async function renderMain() {
  if (!manifest) return;
  const main = document.getElementById("main-content");
  const token = ++activeRenderToken;

  try {
    if (state.query.trim()) {
      main.innerHTML = renderSearchResultsHtml(manifest, state.query);
    } else if (state.view === "lesson") {
      const entry = await store.loadLesson(state.activeId);
      if (token !== activeRenderToken) return;
      if (!entry) {
        main.innerHTML = renderOverviewHtml(manifest, starredSet);
      } else {
        main.innerHTML = renderLessonHtml(entry.lesson, entry.unit, manifest, state, starredSet);
      }
    } else if (state.view === "matrix") {
      const matrices = await store.loadMatrices();
      if (token !== activeRenderToken) return;
      const matrix = matrices.find((item) => item.matrix_id === state.activeId);
      main.innerHTML = matrix
        ? renderMatrixHtml(matrix, matrices)
        : renderOverviewHtml(manifest, starredSet);
    } else {
      main.innerHTML = renderOverviewHtml(manifest, starredSet);
    }
  } catch (err) {
    if (token !== activeRenderToken) return;
    main.innerHTML = `<div class="card"><h2>Unable to Load Content</h2><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (state.anchorId && !state.query.trim()) {
    const targetEl = document.getElementById(state.anchorId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function navigate(view, activeId, anchorId = null) {
  state = {
    ...state,
    view,
    activeId: activeId || "overview",
    anchorId,
    query: "",
  };
  document.getElementById("search-input").value = "";
  document.getElementById("sidebar").classList.remove("open");

  const nextHash = formatHashRoute(state.view, state.activeId, state.anchorId);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  } else {
    renderSidebar();
    void renderMain();
  }
}

function wireControls() {
  const searchInput = document.getElementById("search-input");

  document.getElementById("menu-btn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  const brandHome = document.getElementById("brand-home");
  brandHome.addEventListener("click", () => navigate("overview", "overview"));
  brandHome.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      navigate("overview", "overview");
    }
  });

  document.querySelectorAll("[data-ruby-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      prefs = { ...prefs, ruby: btn.dataset.rubyOpt };
      applyPrefs();
    });
  });

  document.querySelectorAll("[data-recall-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      prefs = { ...prefs, recall: btn.dataset.recallOpt };
      applyPrefs();
    });
  });

  document.querySelectorAll("[data-theme-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      prefs = { ...prefs, theme: btn.dataset.themeOpt };
      applyPrefs();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state = setFilter(state, btn.dataset.filter);
      document
        .querySelectorAll("[data-filter]")
        .forEach((pill) => pill.classList.toggle("active", pill === btn));
      renderSidebar();
    });
  });

  searchInput.addEventListener("input", () => {
    state = setQuery(state, searchInput.value);
    void renderMain();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && document.activeElement !== searchInput) {
      ev.preventDefault();
      searchInput.focus();
    } else if (ev.key === "Escape" && state.query) {
      state = setQuery(state, "");
      searchInput.value = "";
      void renderMain();
    }
  });

  document.getElementById("nav-scroll").addEventListener("click", (ev) => {
    const starBtn = ev.target.closest("[data-star]");
    if (starBtn) {
      ev.stopPropagation();
      starredSet = toggleLessonStar(starredSet, starBtn.dataset.star);
      saveStars(starredSet);
      updateProgressPill();
      renderSidebar();
      if (state.view === "lesson" || state.view === "overview") void renderMain();
      return;
    }

    const navItem = ev.target.closest("[data-nav]");
    if (!navItem) return;
    const spec = navItem.dataset.nav;
    if (spec === "overview") navigate("overview", "overview");
    else if (spec.startsWith("lesson:")) navigate("lesson", spec.slice(7));
    else if (spec.startsWith("matrix:")) navigate("matrix", spec.slice(7));
  });

  document.getElementById("main-content").addEventListener("click", async (ev) => {
    const recallEl = ev.target.closest(".recall-target");
    if (recallEl && prefs.recall === "blur") {
      recallEl.classList.toggle("revealed");
    }

    const jumpEl = ev.target.closest("[data-jump]");
    if (jumpEl) {
      ev.preventDefault();
      const [lessonId, anchorId] = jumpEl.dataset.jump.split("::");
      navigate("lesson", lessonId, anchorId || null);
      return;
    }

    const lessonBtn = ev.target.closest("[data-open-lesson]");
    if (lessonBtn) {
      navigate("lesson", lessonBtn.dataset.openLesson);
      return;
    }

    const matrixBtn = ev.target.closest("[data-open-matrix]");
    if (matrixBtn) {
      navigate("matrix", matrixBtn.dataset.openMatrix);
      return;
    }

    const starMain = ev.target.closest("[data-star-main]");
    if (starMain) {
      starredSet = toggleLessonStar(starredSet, starMain.dataset.starMain);
      saveStars(starredSet);
      updateProgressPill();
      renderSidebar();
      void renderMain();
      return;
    }

    const quizBtn = ev.target.closest("[data-quiz]");
    if (quizBtn) {
      const [questionId, cIdx] = quizBtn.dataset.quiz.split(":");
      state = recordQuizAnswer(state, questionId, Number(cIdx));
      void renderMain();
      return;
    }

    const resetBtn = ev.target.closest("[data-reset-quiz]");
    if (resetBtn) {
      const entry = await store.loadLesson(resetBtn.dataset.resetQuiz);
      if (entry) {
        const qids = entry.lesson.practice_quiz.map((q) => q.question_id);
        state = resetLessonQuiz(state, qids);
        void renderMain();
      }
    }
  });

  window.addEventListener("hashchange", () => {
    const route = parseHashRoute(window.location.hash);
    state = {
      ...state,
      view: route.view,
      activeId: route.activeId,
      anchorId: route.anchorId,
      query: "",
    };
    searchInput.value = "";
    renderSidebar();
    void renderMain();
  });
}

async function boot() {
  applyPrefs();
  wireControls();
  try {
    manifest = await store.loadManifest();
    updateProgressPill();
    renderSidebar();
    await renderMain();
  } catch (err) {
    document.getElementById("main-content").innerHTML =
      `<div class="card"><h1>Unable to Initialize Study Guide</h1><p>${escapeHtml(err.message)}</p></div>`;
  }
}

void boot();
