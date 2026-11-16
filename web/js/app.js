import { createCurriculumStore } from "./data.js";
import { escapeHtml } from "./ruby.js";
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
  setFilter,
  setQuery,
  toggleLessonStar,
} from "./state.js";
import {
  formatProgressLabel,
  renderLessonHtml,
  renderMatrixHtml,
  renderOverviewHtml,
  renderSearchResultsHtml,
  renderSidebarHtml,
  searchCurriculum,
} from "./views.js";

const store = createCurriculumStore("./data");
const mobileViewportQuery = window.matchMedia("(max-width: 960px)");

let manifest = null;
let starredSet = loadSavedStars();
let prefs = loadSavedPrefs();
let initialRoute = parseHashRoute(window.location.hash);
let state = createInitialState(initialRoute, prefs.filter, loadSavedQuizAnswers());
let lastNonSearchRoute =
  initialRoute.view === "search"
    ? { view: "overview", activeId: "overview", anchorId: null }
    : { view: initialRoute.view, activeId: initialRoute.activeId, anchorId: initialRoute.anchorId };
let activeRenderToken = 0;

function updateTopbarHeightVar() {
  const topbar = document.getElementById("topbar");
  if (!topbar) return;
  const height = Math.ceil(topbar.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--topbar-h", `${height}px`);
}

function isMobileViewport() {
  return mobileViewportQuery.matches;
}

function isModifiedAnchorClick(ev, element) {
  return (
    element?.tagName === "A" &&
    (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)
  );
}

function isEditableElement(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
}

function setDrawerOpen(open) {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("drawer-backdrop");
  const menuBtn = document.getElementById("menu-btn");
  if (!isMobileViewport()) {
    sidebar.classList.remove("open");
    sidebar.inert = false;
    backdrop.classList.remove("open");
    backdrop.hidden = true;
    document.body.classList.remove("drawer-open");
    menuBtn.setAttribute("aria-expanded", String(!document.body.classList.contains("sidebar-collapsed")));
    return;
  }
  sidebar.classList.toggle("open", open);
  sidebar.inert = !open;
  backdrop.classList.toggle("open", open);
  backdrop.hidden = !open;
  document.body.classList.toggle("drawer-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
}

function applyPrefs() {
  savePrefs(prefs);
  document.documentElement.setAttribute("data-theme", prefs.theme);
  document.documentElement.setAttribute("data-ruby", prefs.ruby);
  document.documentElement.setAttribute("data-recall", prefs.recall);

  document.querySelectorAll("[data-ruby-opt]").forEach((btn) => {
    const active = btn.dataset.rubyOpt === prefs.ruby;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-recall-opt]").forEach((btn) => {
    const active = btn.dataset.recallOpt === prefs.recall;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-theme-opt]").forEach((btn) => {
    const active = btn.dataset.themeOpt === prefs.theme;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-filter]").forEach((pill) => {
    const active = pill.dataset.filter === state.filter;
    pill.classList.toggle("active", active);
    pill.setAttribute("aria-pressed", String(active));
  });
}

function syncInteractiveTargets() {
  const main = document.getElementById("main-content");
  const recallBlur = prefs.recall === "blur";
  main.querySelectorAll(".recall-target").forEach((el) => {
    if (recallBlur) {
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.setAttribute("aria-expanded", String(el.classList.contains("revealed")));
      el.setAttribute("aria-label", "Reveal English translation");
    } else {
      el.removeAttribute("tabindex");
      el.removeAttribute("role");
      el.removeAttribute("aria-expanded");
      el.removeAttribute("aria-label");
    }
  });

  const rubyHover = prefs.ruby === "hover";
  main.querySelectorAll("ruby").forEach((rubyEl) => {
    const insideUnrevealedRecall =
      recallBlur && Boolean(rubyEl.closest(".recall-target:not(.revealed)"));
    if (!rubyHover || rubyEl.closest("a, button") || insideUnrevealedRecall) {
      rubyEl.classList.remove("ruby-peek");
      rubyEl.removeAttribute("tabindex");
      return;
    }
    rubyEl.setAttribute("tabindex", "0");
  });
}

function updateProgressPill() {
  if (!manifest) return;
  document.getElementById("progress-pill").textContent = formatProgressLabel(manifest, starredSet);
}

function updateSidebarSearchStatus() {
  const statusEl = document.getElementById("sidebar-search-status");
  if (!manifest || !state.query.trim()) {
    statusEl.hidden = true;
    statusEl.innerHTML = "";
    return;
  }
  const { matchedLessons, matchedPoints, matchedMatrices } = searchCurriculum(manifest, state.query);
  const total = matchedPoints.length + matchedLessons.length + matchedMatrices.length;
  statusEl.hidden = false;
  statusEl.innerHTML =
    `<span>${total} match${total === 1 ? "" : "es"} in main view</span>` +
    `<button class="btn btn-sm" type="button" data-view-search-results>View &rarr;</button>`;
}

function scrollActiveSidebarIntoView() {
  const activeNav = document.querySelector("#nav-scroll .active");
  if (!activeNav) return;
  activeNav.scrollIntoView({ block: "nearest", behavior: "auto" });
}

function renderSidebar({ scrollToActive = false } = {}) {
  if (!manifest) return;
  document.getElementById("nav-scroll").innerHTML = renderSidebarHtml(manifest, state, starredSet);
  if (scrollToActive) {
    scrollActiveSidebarIntoView();
  }
}

async function renderMain({ scroll = "route", focusSelector = null } = {}) {
  if (!manifest) return;
  const main = document.getElementById("main-content");
  const token = ++activeRenderToken;
  const priorScrollY = window.scrollY;

  try {
    if (state.query.trim()) {
      main.innerHTML = renderSearchResultsHtml(manifest, state.query);
    } else if (state.view === "lesson") {
      const entry = await store.loadLesson(state.activeId);
      if (token !== activeRenderToken) return;
      if (!entry) {
        state = { ...state, view: "overview", activeId: "overview", anchorId: null };
        renderSidebar();
        main.innerHTML = renderOverviewHtml(manifest, starredSet, state);
      } else {
        main.innerHTML = renderLessonHtml(entry.lesson, entry.unit, manifest, state, starredSet);
      }
    } else if (state.view === "matrix") {
      const matrices = await store.loadMatrices();
      if (token !== activeRenderToken) return;
      const matrix = matrices.find((item) => item.matrix_id === state.activeId);
      if (!matrix) {
        state = { ...state, view: "overview", activeId: "overview", anchorId: null };
        renderSidebar();
        main.innerHTML = renderOverviewHtml(manifest, starredSet, state);
      } else {
        main.innerHTML = renderMatrixHtml(matrix, matrices, manifest);
      }
    } else {
      main.innerHTML = renderOverviewHtml(manifest, starredSet, state);
    }
  } catch (err) {
    if (token !== activeRenderToken) return;
    main.innerHTML = `<div class="card"><h2>Unable to Load Content</h2><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  syncInteractiveTargets();

  if (scroll === "preserve") {
    window.scrollTo({ top: priorScrollY, behavior: "auto" });
  } else if (state.anchorId && !state.query.trim()) {
    const targetEl = document.getElementById(state.anchorId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  } else {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  if (focusSelector) {
    const focusEl = document.querySelector(focusSelector);
    if (focusEl && typeof focusEl.focus === "function") {
      focusEl.focus({ preventScroll: true });
    }
  }
}

function navigate(view, activeId, anchorId = null) {
  const searchInput = document.getElementById("search-input");
  const fromMobileDrawer =
    isMobileViewport() && document.getElementById("sidebar").classList.contains("open");
  state = {
    ...state,
    view,
    activeId: activeId || "overview",
    anchorId,
    query: "",
  };
  lastNonSearchRoute = {
    view: state.view,
    activeId: state.activeId,
    anchorId: state.anchorId,
  };
  searchInput.value = "";
  updateSidebarSearchStatus();
  if (fromMobileDrawer) {
    document.getElementById("main-content").focus({ preventScroll: true });
  }
  setDrawerOpen(false);

  const nextHash = formatHashRoute(state.view, state.activeId, state.anchorId);
  const focusSelector = fromMobileDrawer ? "#main-content" : null;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  } else {
    renderSidebar({ scrollToActive: true });
    void renderMain({ scroll: "route", focusSelector });
  }
}

function clearSearchToPreviousRoute() {
  navigate(lastNonSearchRoute.view, lastNonSearchRoute.activeId, lastNonSearchRoute.anchorId);
}

function syncSearchHistoryUrl(trimmedQuery) {
  const targetHash = trimmedQuery
    ? formatHashRoute("search", "search", null, trimmedQuery)
    : formatHashRoute(lastNonSearchRoute.view, lastNonSearchRoute.activeId, lastNonSearchRoute.anchorId);

  if (window.location.hash === targetHash) return;
  if (trimmedQuery && !window.location.hash.startsWith("#search/")) {
    window.history.pushState(null, "", targetHash);
  } else {
    window.history.replaceState(null, "", targetHash);
  }
}

function applyFilterValue(nextFilter) {
  state = setFilter(state, nextFilter);
  prefs = { ...prefs, filter: state.filter };
  applyPrefs();
  renderSidebar();
  if (state.view === "overview" && !state.query.trim()) {
    void renderMain({ scroll: "preserve" });
  }
}

function toggleStarAndRefresh(lessonId, focusSelector) {
  starredSet = toggleLessonStar(starredSet, lessonId);
  saveStars(starredSet);
  updateProgressPill();
  renderSidebar();
  const scrollMode = "preserve";
  if (state.view === "lesson" || state.view === "overview") {
    void renderMain({ scroll: scrollMode, focusSelector });
  } else if (focusSelector) {
    const target = document.querySelector(focusSelector);
    if (target) target.focus({ preventScroll: true });
  }
}

function wireControls() {
  const searchInput = document.getElementById("search-input");
  const menuBtn = document.getElementById("menu-btn");
  const backdrop = document.getElementById("drawer-backdrop");
  const drawerCloseBtn = document.getElementById("drawer-close-btn");
  const mobileSearchBtn = document.getElementById("mobile-search-btn");
  const backToTopBtn = document.getElementById("back-to-top");

  updateTopbarHeightVar();
  setDrawerOpen(false);
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => updateTopbarHeightVar()).observe(document.getElementById("topbar"));
  }
  const syncViewportDrawerState = () => {
    updateTopbarHeightVar();
    if (!isMobileViewport()) {
      setDrawerOpen(false);
    } else {
      setDrawerOpen(document.getElementById("sidebar").classList.contains("open"));
    }
  };
  window.addEventListener("resize", syncViewportDrawerState);
  mobileViewportQuery.addEventListener?.("change", syncViewportDrawerState);

  menuBtn.addEventListener("click", () => {
    if (isMobileViewport()) {
      const opening = !document.getElementById("sidebar").classList.contains("open");
      setDrawerOpen(opening);
    } else {
      document.body.classList.toggle("sidebar-collapsed");
      const collapsed = document.body.classList.contains("sidebar-collapsed");
      menuBtn.setAttribute("aria-expanded", String(!collapsed));
    }
  });

  backdrop.addEventListener("click", () => {
    setDrawerOpen(false);
    menuBtn.focus({ preventScroll: true });
  });

  drawerCloseBtn.addEventListener("click", () => {
    setDrawerOpen(false);
    menuBtn.focus({ preventScroll: true });
  });

  mobileSearchBtn.addEventListener("click", () => {
    if (isMobileViewport()) {
      setDrawerOpen(true);
    } else {
      document.body.classList.remove("sidebar-collapsed");
      menuBtn.setAttribute("aria-expanded", "true");
    }
    searchInput.focus();
  });

  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener(
    "scroll",
    () => {
      backToTopBtn.hidden = window.scrollY <= 500;
    },
    { passive: true },
  );

  const brandHome = document.getElementById("brand-home");
  brandHome.addEventListener("click", (ev) => {
    if (isModifiedAnchorClick(ev, brandHome)) return;
    ev.preventDefault();
    navigate("overview", "overview");
  });

  document.querySelectorAll("[data-ruby-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      prefs = { ...prefs, ruby: btn.dataset.rubyOpt };
      applyPrefs();
      syncInteractiveTargets();
    });
  });

  document.querySelectorAll("[data-recall-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      prefs = { ...prefs, recall: btn.dataset.recallOpt };
      applyPrefs();
      syncInteractiveTargets();
    });
  });

  document.querySelectorAll("[data-theme-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      prefs = { ...prefs, theme: btn.dataset.themeOpt };
      applyPrefs();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => applyFilterValue(btn.dataset.filter));
  });

  searchInput.addEventListener("input", () => {
    const value = searchInput.value;
    const hadSearch = state.view === "search" || Boolean(state.query.trim());
    state = setQuery(state, value, lastNonSearchRoute);
    const isSearching = Boolean(value.trim());
    const routeChanged = hadSearch !== isSearching;
    syncSearchHistoryUrl(value.trim());
    updateSidebarSearchStatus();
    renderSidebar({ scrollToActive: routeChanged && !isSearching });
    void renderMain({ scroll: isSearching || routeChanged ? "route" : "preserve" });
  });

  searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && state.query.trim() && isMobileViewport()) {
      ev.preventDefault();
      document.getElementById("main-content").focus({ preventScroll: true });
      setDrawerOpen(false);
    }
  });

  document.getElementById("sidebar-search-status").addEventListener("click", (ev) => {
    if (ev.target.closest("[data-view-search-results]")) {
      document.getElementById("main-content").focus({ preventScroll: true });
      setDrawerOpen(false);
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (
      ev.key === "/" &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey &&
      !ev.isComposing &&
      !ev.defaultPrevented &&
      !isEditableElement(document.activeElement)
    ) {
      if (isMobileViewport() && !document.getElementById("sidebar").classList.contains("open")) {
        setDrawerOpen(true);
      } else if (!isMobileViewport() && document.body.classList.contains("sidebar-collapsed")) {
        document.body.classList.remove("sidebar-collapsed");
        menuBtn.setAttribute("aria-expanded", "true");
      }
      ev.preventDefault();
      searchInput.focus();
      return;
    }

    if (ev.key === "Escape") {
      if (isMobileViewport() && document.getElementById("sidebar").classList.contains("open")) {
        setDrawerOpen(false);
        menuBtn.focus({ preventScroll: true });
        return;
      }
      if (state.query) {
        clearSearchToPreviousRoute();
        return;
      }
      if (document.activeElement === searchInput) {
        searchInput.blur();
      }
    }
  });

  document.getElementById("nav-scroll").addEventListener("click", (ev) => {
    if (ev.target.closest("[data-reset-filter]")) {
      applyFilterValue("all");
      return;
    }

    const starBtn = ev.target.closest("[data-star]");
    if (starBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const lid = starBtn.dataset.star;
      toggleStarAndRefresh(lid, `#nav-scroll [data-star="${lid}"]`);
      return;
    }

    const navItem = ev.target.closest("[data-nav]");
    if (!navItem || isModifiedAnchorClick(ev, navItem)) return;
    ev.preventDefault();
    const spec = navItem.dataset.nav;
    if (spec === "overview") navigate("overview", "overview");
    else if (spec.startsWith("lesson:")) navigate("lesson", spec.slice(7));
    else if (spec.startsWith("matrix:")) navigate("matrix", spec.slice(7));
  });

  const mainEl = document.getElementById("main-content");
  mainEl.addEventListener("keydown", (ev) => {
    const rubyEl = ev.target.closest("ruby");
    const insideUnrevealedRecall =
      prefs.recall === "blur" && Boolean(rubyEl?.closest(".recall-target:not(.revealed)"));
    if (
      rubyEl &&
      prefs.ruby === "hover" &&
      !rubyEl.closest("a, button") &&
      !insideUnrevealedRecall &&
      (ev.key === "Enter" || ev.key === " ")
    ) {
      ev.preventDefault();
      rubyEl.classList.toggle("ruby-peek");
      return;
    }

    const recallEl = ev.target.closest(".recall-target");
    if (recallEl && prefs.recall === "blur" && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      const revealed = recallEl.classList.toggle("revealed");
      recallEl.setAttribute("aria-expanded", String(revealed));
      syncInteractiveTargets();
    }
  });

  mainEl.addEventListener("click", async (ev) => {
    if (ev.target.closest("[data-reset-filter]")) {
      applyFilterValue("all");
      return;
    }

    if (ev.target.closest("[data-clear-search]")) {
      clearSearchToPreviousRoute();
      return;
    }

    const starOverview = ev.target.closest("[data-star]");
    if (starOverview) {
      ev.preventDefault();
      ev.stopPropagation();
      const lid = starOverview.dataset.star;
      toggleStarAndRefresh(lid, `#main-content [data-star="${lid}"]`);
      return;
    }

    const rubyEl = ev.target.closest("ruby");
    const insideUnrevealedRecall =
      prefs.recall === "blur" && Boolean(rubyEl?.closest(".recall-target:not(.revealed)"));
    if (
      rubyEl &&
      prefs.ruby === "hover" &&
      !rubyEl.closest("a, button") &&
      !insideUnrevealedRecall
    ) {
      rubyEl.classList.toggle("ruby-peek");
      return;
    }

    const recallEl = ev.target.closest(".recall-target");
    if (recallEl && prefs.recall === "blur") {
      const selected = String(window.getSelection?.() ?? "").trim();
      if (!(recallEl.classList.contains("revealed") && selected.length > 0)) {
        const revealed = recallEl.classList.toggle("revealed");
        recallEl.setAttribute("aria-expanded", String(revealed));
        syncInteractiveTargets();
      }
      return;
    }

    const jumpEl = ev.target.closest("[data-jump]");
    if (jumpEl) {
      if (isModifiedAnchorClick(ev, jumpEl)) return;
      ev.preventDefault();
      const [lessonId, anchorId] = jumpEl.dataset.jump.split("::");
      navigate("lesson", lessonId, anchorId || null);
      return;
    }

    const lessonBtn = ev.target.closest("[data-open-lesson]");
    if (lessonBtn) {
      if (isModifiedAnchorClick(ev, lessonBtn)) return;
      ev.preventDefault();
      navigate("lesson", lessonBtn.dataset.openLesson);
      return;
    }

    const matrixBtn = ev.target.closest("[data-open-matrix]");
    if (matrixBtn) {
      if (isModifiedAnchorClick(ev, matrixBtn)) return;
      ev.preventDefault();
      navigate("matrix", matrixBtn.dataset.openMatrix);
      return;
    }

    const starMain = ev.target.closest("[data-star-main]");
    if (starMain) {
      const lid = starMain.dataset.starMain;
      toggleStarAndRefresh(lid, `#main-content [data-star-main="${lid}"]`);
      return;
    }

    const quizBtn = ev.target.closest("[data-quiz]");
    if (quizBtn) {
      const [questionId, cIdx] = quizBtn.dataset.quiz.split(":");
      state = recordQuizAnswer(state, questionId, Number(cIdx));
      saveQuizAnswers(state.quizAnswers);
      void renderMain({ scroll: "preserve", focusSelector: `#quiz-expl-${questionId}` });
      return;
    }

    const resetBtn = ev.target.closest("[data-reset-quiz]");
    if (resetBtn) {
      const lid = resetBtn.dataset.resetQuiz;
      const entry = await store.loadLesson(lid);
      if (entry) {
        const qids = entry.lesson.practice_quiz.map((q) => q.question_id);
        state = resetLessonQuiz(state, qids);
        saveQuizAnswers(state.quizAnswers);
        void renderMain({ scroll: "preserve", focusSelector: `#main-content [data-reset-quiz="${lid}"]` });
      }
    }
  });

  window.addEventListener("hashchange", () => {
    const route = parseHashRoute(window.location.hash);
    const nextQuery = route.view === "search" ? String(route.query ?? "") : "";
    state = {
      ...state,
      view: route.view,
      activeId: route.activeId,
      anchorId: route.anchorId,
      query: nextQuery,
    };
    if (route.view !== "search") {
      lastNonSearchRoute = { view: route.view, activeId: route.activeId, anchorId: route.anchorId };
    }
    searchInput.value = nextQuery;
    updateSidebarSearchStatus();
    renderSidebar({ scrollToActive: true });
    void renderMain({ scroll: "route" });
  });
}

async function boot() {
  applyPrefs();
  wireControls();
  const searchInput = document.getElementById("search-input");
  if (state.query) {
    searchInput.value = state.query;
  }
  try {
    manifest = await store.loadManifest();
    updateProgressPill();
    updateSidebarSearchStatus();
    renderSidebar({ scrollToActive: true });
    await renderMain({ scroll: "route" });
  } catch (err) {
    document.getElementById("main-content").innerHTML =
      `<div class="card"><h2>Unable to Initialize Study Guide</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

void boot();
