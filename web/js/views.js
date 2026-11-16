import {
  escapeHtml,
  normalizeSearchText,
  renderRubyHtml,
  stripInlineMarkdown,
  stripRubySurface,
  toSearchableText,
} from "./ruby.js";

const STATUS_LABELS = Object.freeze({
  verified_renshuu: "Renshuu Verified",
  canonical_n3: "Canonical N3",
  n4_prerequisite: "N4 Prerequisite",
  exam_border_n2: "Renshuu N2 / N3 Exam",
});

const REGISTER_LABELS = Object.freeze({
  casual: "Casual",
  neutral: "Neutral",
  formal: "Formal",
  written: "Written",
});

const QTYPE_LABELS = Object.freeze({
  fill_blank: "Fill in the Blank",
  nuance_choice: "Nuance Choice",
  attachment_trap: "Attachment Trap",
  star_order: "Star Order (並べ替え)",
});

const FILTER_LABELS = Object.freeze({
  all: "All",
  unstarred: "Unstarred",
  starred: "Starred",
  bridge: "Bridge",
  matrices: "Matrices",
});

const CHOICE_LETTERS = ["A", "B", "C", "D"];
const SEARCH_RESULT_LIMIT = 60;

export function lessonBadge(lesson) {
  return typeof lesson.lesson_number === "number"
    ? `#${String(lesson.lesson_number).padStart(2, "0")}`
    : String(lesson.lesson_number);
}

export function flattenLessons(manifest) {
  return (manifest.units ?? []).flatMap((unit) =>
    (unit.lessons ?? []).map((lesson) => ({ unit, lesson })),
  );
}

export function countStarredRenshuuLessons(manifest, starredSet) {
  let count = 0;
  for (const { lesson } of flattenLessons(manifest)) {
    if (typeof lesson.lesson_number === "number" && starredSet.has(lesson.lesson_id)) {
      count += 1;
    }
  }
  return count;
}

export function countStarredBridgeLessons(manifest, starredSet) {
  let count = 0;
  for (const { lesson } of flattenLessons(manifest)) {
    if (typeof lesson.lesson_number !== "number" && starredSet.has(lesson.lesson_id)) {
      count += 1;
    }
  }
  return count;
}

export function formatProgressLabel(manifest, starredSet) {
  const renshuu = countStarredRenshuuLessons(manifest, starredSet);
  const bridge = countStarredBridgeLessons(manifest, starredSet);
  const base = `★ ${renshuu} / ${manifest.total_renshuu_lessons}`;
  return bridge > 0 ? `${base} (+${bridge} Bridge)` : base;
}

function lessonMatchesFilter(lesson, filter, starredSet) {
  const isBridge = typeof lesson.lesson_number !== "number";
  if (filter === "bridge") return isBridge;
  if (filter === "starred") return starredSet.has(lesson.lesson_id);
  if (filter === "unstarred") return !starredSet.has(lesson.lesson_id);
  return true;
}

function buildLessonMap(manifest) {
  const map = new Map();
  if (!manifest) return map;
  for (const { unit, lesson } of flattenLessons(manifest)) {
    map.set(lesson.lesson_id, { unit, lesson });
  }
  return map;
}

function renderProseWithLessonLinks(rawText, currentLessonId, maxLessons = 55) {
  const html = renderRubyHtml(rawText);
  return html
    .split(/(<[^>]+>)/g)
    .map((segment) => {
      if (!segment || segment.startsWith("<")) return segment;
      return segment.replace(/\b((?:Renshuu\s+)?Lesson\s+(\d{1,2}))\b/gi, (full, _phrase, numStr) => {
        const num = Number(numStr);
        if (!Number.isInteger(num) || num < 1 || num > maxLessons) return full;
        const targetId = `L${String(num).padStart(2, "0")}`;
        if (targetId === currentLessonId) return full;
        return `<a class="inline-lesson-link" href="#lesson/${targetId}" data-open-lesson="${targetId}">${full}</a>`;
      });
    })
    .join("");
}

function renderStarButtonHtml(lesson, isStarred) {
  const badge = lessonBadge(lesson);
  const label = isStarred
    ? `Remove star from ${badge} ${lesson.renshuu_title}`
    : `Mark ${badge} ${lesson.renshuu_title} as starred`;
  return (
    `<button class="star-btn ${isStarred ? "starred" : ""}" ` +
    `data-star="${escapeHtml(lesson.lesson_id)}" type="button" ` +
    `aria-pressed="${isStarred}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">` +
    `${isStarred ? "★" : "☆"}</button>`
  );
}

export function renderSidebarHtml(manifest, state, starredSet) {
  const parts = [];
  const homeActive = state.view === "overview" && !state.query.trim() ? "active" : "";
  parts.push(
    `<a class="nav-item ${homeActive}" href="#overview" data-nav="overview" aria-current="${homeActive ? "page" : "false"}">` +
      `<span class="nav-num">HOME</span><span class="nav-label">Overview &amp; 55-Lesson Grid</span></a>`,
  );

  let renderedCount = 0;

  if (state.filter === "all" || state.filter === "matrices") {
    parts.push(`<div class="nav-group-title">Synonym Matrices (${manifest.matrices.length})</div>`);
    for (const matrix of manifest.matrices) {
      const isActive = state.view === "matrix" && state.activeId === matrix.matrix_id ? "active" : "";
      const cleanTitle = stripRubySurface(matrix.title);
      const tooltip = `${matrix.matrix_id}: ${cleanTitle} (${matrix.theme})`;
      parts.push(
        `<a class="nav-item nav-item--matrix ${isActive}" href="#matrix/${escapeHtml(matrix.matrix_id)}" ` +
          `data-nav="matrix:${escapeHtml(matrix.matrix_id)}" title="${escapeHtml(tooltip)}" ` +
          `aria-current="${isActive ? "page" : "false"}">` +
          `<span class="nav-num">${escapeHtml(matrix.matrix_id)}</span>` +
          `<span class="nav-label">${escapeHtml(cleanTitle)}</span></a>`,
      );
      renderedCount += 1;
    }
  }

  if (state.filter !== "matrices") {
    for (const unit of manifest.units) {
      const filteredLessons = unit.lessons.filter((lesson) =>
        lessonMatchesFilter(lesson, state.filter, starredSet),
      );
      if (!filteredLessons.length) continue;

      const shortTitle = String(unit.unit_title).split(":")[0];
      parts.push(`<div class="nav-group-title">${escapeHtml(shortTitle)}</div>`);
      for (const lesson of filteredLessons) {
        const isStarred = starredSet.has(lesson.lesson_id);
        const isActive = state.view === "lesson" && state.activeId === lesson.lesson_id ? "active" : "";
        const badge = lessonBadge(lesson);
        const tooltip = `${badge}: ${lesson.renshuu_title}`;
        parts.push(
          `<div class="nav-row ${isActive}">` +
            renderStarButtonHtml(lesson, isStarred) +
            `<a class="nav-link" href="#lesson/${escapeHtml(lesson.lesson_id)}" ` +
            `data-nav="lesson:${escapeHtml(lesson.lesson_id)}" title="${escapeHtml(tooltip)}" ` +
            `aria-current="${isActive ? "page" : "false"}">` +
            `<span class="nav-num">${escapeHtml(badge)}</span>` +
            `<span class="nav-label">${escapeHtml(lesson.renshuu_title)}</span>` +
            (lesson.has_video
              ? `<span class="vid-dot" aria-hidden="true" title="Includes Renshuu video lesson">&#9654;</span>`
              : "") +
            `</a></div>`,
        );
        renderedCount += 1;
      }
    }
  }

  if (renderedCount === 0) {
    const emptyMsg =
      state.filter === "starred"
        ? "No lessons or Bridge modules starred yet. Click ☆ beside any lesson to track progress."
        : "No lessons match the active filter.";
    parts.push(
      `<div class="nav-empty"><span>${escapeHtml(emptyMsg)}</span>` +
        `<button class="btn btn-sm" type="button" data-reset-filter>Show All Lessons</button></div>`,
    );
  }

  return parts.join("");
}

function renderLessonTileHtml(lesson, starredSet) {
  const isStarred = starredSet.has(lesson.lesson_id);
  const badge = lessonBadge(lesson);
  const titleAttr = `${badge}: ${lesson.renshuu_title}`;
  return (
    `<div class="tile ${isStarred ? "starred-tile" : ""}">` +
    renderStarButtonHtml(lesson, isStarred) +
    `<a class="tile-link" href="#lesson/${escapeHtml(lesson.lesson_id)}" ` +
    `data-open-lesson="${escapeHtml(lesson.lesson_id)}" title="${escapeHtml(titleAttr)}">` +
    `<span class="nav-num">${escapeHtml(badge)}</span>` +
    `<span class="nav-label">${escapeHtml(lesson.renshuu_title)}</span>` +
    (lesson.has_video
      ? `<span class="vid-dot" aria-hidden="true" title="Includes Renshuu video lesson">&#9654;</span>`
      : "") +
    `</a></div>`
  );
}

function renderMatrixTileHtml(matrix) {
  const cleanTitle = stripRubySurface(matrix.title);
  const patternsPart = cleanTitle.split(" — ")[0];
  const tooltip = `${matrix.matrix_id}: ${cleanTitle} (${matrix.theme})`;
  return (
    `<a class="tile tile-matrix" href="#matrix/${escapeHtml(matrix.matrix_id)}" ` +
    `data-open-matrix="${escapeHtml(matrix.matrix_id)}" title="${escapeHtml(tooltip)}">` +
    `<span class="nav-num">${escapeHtml(matrix.matrix_id)}</span>` +
    `<span class="tile-matrix-body">` +
    `<span class="tile-matrix-title">${escapeHtml(patternsPart)}</span>` +
    `<span class="tile-matrix-theme">${escapeHtml(matrix.theme)}</span>` +
    `</span></a>`
  );
}

export function renderOverviewHtml(manifest, starredSet, state = { filter: "all" }) {
  const activeFilter = state?.filter ?? "all";
  const showLessons = activeFilter !== "matrices";
  const showMatrices = activeFilter === "all" || activeFilter === "matrices";

  const unitBlocks = [];
  let visibleLessonCount = 0;

  if (showLessons) {
    for (const unit of manifest.units ?? []) {
      const matching = (unit.lessons ?? []).filter((lesson) =>
        lessonMatchesFilter(lesson, activeFilter, starredSet),
      );
      if (!matching.length) continue;
      visibleLessonCount += matching.length;
      const tiles = matching.map((lesson) => renderLessonTileHtml(lesson, starredSet)).join("");
      unitBlocks.push(
        `<div class="unit-section"><h3 class="unit-heading">${escapeHtml(unit.unit_title)}</h3>` +
          `<div class="tile-grid">${tiles}</div></div>`,
      );
    }
  }

  const filterBanner =
    activeFilter !== "all"
      ? `<div class="chip-bar"><span class="badge accent">Filter: ${escapeHtml(FILTER_LABELS[activeFilter] || activeFilter)}</span>` +
        `<button class="btn btn-sm" type="button" data-reset-filter>Show All</button></div>`
      : "";

  const lessonsCard = showLessons
    ? unitBlocks.length > 0
      ? `<div class="card"><h2>All ${manifest.total_renshuu_lessons} Renshuu Lessons + Exam-Bridge Modules</h2>${unitBlocks.join("")}</div>`
      : `<div class="card"><h2>No Matching Lessons</h2><p>${
          activeFilter === "starred"
            ? "You have not starred any lessons yet. Click ☆ beside any lesson to track your Renshuu study progress."
            : "All lessons and Bridge modules match the other state."
        }</p><button class="btn" type="button" data-reset-filter>Show All Lessons</button></div>`
    : "";

  const matricesCard = showMatrices
    ? `<div class="card"><h2>${manifest.matrices.length} Synonym Disambiguation Matrices</h2>` +
      `<div class="tile-grid tile-grid--matrices">${manifest.matrices.map(renderMatrixTileHtml).join("")}</div></div>`
    : "";

  return `
    <div class="card">
      <h1>Renshuu JLPT N3 Grammar Companion</h1>
      <p>
        Covers all <strong>${manifest.total_renshuu_lessons} Renshuu Intermediate/JLPT N3 lessons</strong>
        plus <strong>${manifest.total_lessons - manifest.total_renshuu_lessons} Exam-Bridge modules</strong>
        (${manifest.total_grammar_points} deep-dive grammar points, ${manifest.total_questions} diagnostic questions)
        and <strong>${manifest.matrices.length} Synonym Matrices</strong>.
      </p>
      <div class="callout">
        <strong>Study Workflow:</strong> Switch Furigana to <strong>Peek</strong> to reveal kanji readings on hover, tap, or keyboard focus; toggle <strong>EN: Recall</strong> to blur English answers until selected; and mark any lesson <strong>☆</strong> to track progress locally. Press <code>/</code> (or <strong>Search</strong>) anytime.
      </div>
      <div class="badge-row">
        <span class="badge">Renshuu Verified — Core Renshuu N3 pattern</span>
        <span class="badge">Canonical N3 — Standard JLPT N3 target</span>
        <span class="badge">Exam-Bridge (B1–B3) — Voice &amp; JLPT exam gaps</span>
        <span class="badge video-meta">&#9654; Renshuu Video (#01–#10)</span>
      </div>
      ${filterBanner}
    </div>
    ${showMatrices && activeFilter === "matrices" ? matricesCard : `${lessonsCard}${matricesCard}`}`;
}

function getLessonCodeTokens(lesson) {
  const codes = new Set();
  const idLower = String(lesson.lesson_id ?? "").toLowerCase();
  if (idLower) codes.add(idLower);

  if (typeof lesson.lesson_number === "number") {
    const rawNum = String(lesson.lesson_number);
    const padNum = rawNum.padStart(2, "0");
    codes.add(rawNum);
    codes.add(padNum);
    codes.add(`#${rawNum}`);
    codes.add(`#${padNum}`);
    codes.add(`lesson ${rawNum}`);
    codes.add(`lesson ${padNum}`);
  } else {
    const badgeLower = String(lesson.lesson_number ?? "").toLowerCase();
    if (badgeLower) {
      codes.add(badgeLower);
      codes.add(badgeLower.replace(/^b(\d)$/, "bridge $1"));
    }
  }
  return codes;
}

function stripTildes(str) {
  const stripped = str.replace(/~/g, "");
  return stripped || str;
}

function buildSearchHayvariants(rawText) {
  const normalized = normalizeSearchText(rawText);
  return {
    withTilde: normalized,
    noTilde: stripTildes(normalized),
  };
}

function matchesAllTokens(tokens, hayPair) {
  return tokens.every((tok) => {
    const cleanTok = stripTildes(tok);
    return hayPair.withTilde.includes(tok) || (cleanTok ? hayPair.noTilde.includes(cleanTok) : false);
  });
}

function matchesLessonCodeQuery(normQuery, codes) {
  return codes.has(normQuery);
}

export function searchCurriculum(manifest, query) {
  const normQuery = normalizeSearchText(String(query ?? "").trim());
  if (!normQuery) {
    return { matchedLessons: [], matchedPoints: [], matchedMatrices: [] };
  }
  const tokens = normQuery.split(/\s+/).filter(Boolean);
  const singleCodeLike = tokens.length === 1 && (/^#?\d{1,2}$/.test(normQuery) || /^[lbm]\d{1,2}$/.test(normQuery));
  const shortKanaQuery =
    tokens.length === 1 && !/[a-z0-9#]/.test(normQuery) && [...stripTildes(normQuery)].length <= 2;

  const matchedLessons = [];
  const directPoints = [];
  const contextPoints = [];
  const matchedMatrices = [];

  for (const { lesson } of flattenLessons(manifest)) {
    const codes = getLessonCodeTokens(lesson);
    const lessonTextHay = buildSearchHayvariants(
      `${lesson.renshuu_title} ${toSearchableText(lesson.summary)} ${lessonBadge(lesson)}`,
    );
    const lessonMatched =
      matchesLessonCodeQuery(normQuery, codes) ||
      (!singleCodeLike && matchesAllTokens(tokens, lessonTextHay));

    if (lessonMatched) {
      matchedLessons.push(lesson);
    }

    for (const gp of lesson.grammar_index ?? []) {
      const directHay = buildSearchHayvariants(
        `${gp.pattern} ${toSearchableText(gp.pattern_ruby)} ${toSearchableText(gp.meaning_en)} ${lesson.renshuu_title}`,
      );
      const isDirect =
        matchesLessonCodeQuery(normQuery, codes) || matchesAllTokens(tokens, directHay);

      if (isDirect) {
        directPoints.push({ lesson, gp });
        continue;
      }

      if (!singleCodeLike) {
        const fullHay = buildSearchHayvariants(`${directHay.withTilde} ${gp.mental_model_search ?? ""}`);
        if (matchesAllTokens(tokens, fullHay)) {
          contextPoints.push({ lesson, gp });
        }
      }
    }
  }

  for (const matrix of manifest.matrices ?? []) {
    const matrixIdLower = String(matrix.matrix_id ?? "").toLowerCase();
    const matrixHay = buildSearchHayvariants(
      `${matrix.matrix_id} ${toSearchableText(matrix.title)} ${matrix.theme} ${matrix.decision_heuristic_search ?? ""}`,
    );
    const isCodeMatch = matrixIdLower === normQuery;
    if (isCodeMatch || (!singleCodeLike && matchesAllTokens(tokens, matrixHay))) {
      matchedMatrices.push(matrix);
    }
  }

  const matchedPoints =
    shortKanaQuery && directPoints.length > 0 ? directPoints : [...directPoints, ...contextPoints];

  return { matchedLessons, matchedPoints, matchedMatrices };
}

export function renderSearchResultsHtml(manifest, query) {
  const { matchedLessons, matchedPoints, matchedMatrices } = searchCurriculum(manifest, query);
  const shownPoints = matchedPoints.slice(0, SEARCH_RESULT_LIMIT);

  let out =
    `<div class="card"><div class="lesson-header">` +
    `<div class="lesson-header-title"><h1>Search: “${escapeHtml(query)}”</h1>` +
    `<p class="ex-note">${matchedPoints.length} grammar point(s), ${matchedLessons.length} lesson(s), ${matchedMatrices.length} matrix match(es).</p></div>` +
    `<button class="btn" type="button" data-clear-search>Clear Search</button></div></div>`;

  if (matchedPoints.length) {
    out += `<div class="card"><h2>Matching Grammar Points</h2>`;
    if (matchedPoints.length > SEARCH_RESULT_LIMIT) {
      out += `<p class="ex-note">Showing top ${SEARCH_RESULT_LIMIT} of ${matchedPoints.length} results. Refine your query to narrow further.</p>`;
    }
    for (const { lesson, gp } of shownPoints) {
      const targetId = `gp-${gp.id}`;
      out +=
        `<a class="ex-item search-hit" href="#lesson/${escapeHtml(lesson.lesson_id)}/${escapeHtml(targetId)}" ` +
        `data-jump="${escapeHtml(lesson.lesson_id)}::${escapeHtml(targetId)}">` +
        `<div><strong>${renderRubyHtml(gp.pattern_ruby)}</strong> ` +
        `<span class="badge">${escapeHtml(lessonBadge(lesson))} ${escapeHtml(lesson.renshuu_title)}</span></div>` +
        `<div class="ex-en">${renderRubyHtml(gp.meaning_en)}</div></a>`;
    }
    out += `</div>`;
  }

  if (matchedLessons.length) {
    const lessonTiles = matchedLessons
      .map(
        (lesson) =>
          `<a class="tile tile-link" style="padding-left:12px" href="#lesson/${escapeHtml(lesson.lesson_id)}" ` +
          `data-open-lesson="${escapeHtml(lesson.lesson_id)}" title="${escapeHtml(lessonBadge(lesson))}: ${escapeHtml(lesson.renshuu_title)}">` +
          `<span class="nav-num">${escapeHtml(lessonBadge(lesson))}</span>` +
          `<span class="nav-label">${escapeHtml(lesson.renshuu_title)}</span></a>`,
      )
      .join("");
    out += `<div class="card"><h2>Matching Lessons</h2><div class="tile-grid">${lessonTiles}</div></div>`;
  }

  if (matchedMatrices.length) {
    out += `<div class="card"><h2>Matching Synonym Matrices</h2><div class="tile-grid tile-grid--matrices">${matchedMatrices.map(renderMatrixTileHtml).join("")}</div></div>`;
  }

  if (!matchedPoints.length && !matchedLessons.length && !matchedMatrices.length) {
    out +=
      `<div class="card"><p>No matching grammar points found. Try kanji, hiragana readings (e.g., <code>たいして</code>, <code>わけ</code>), ` +
      `lesson numbers (<code>#17</code>, <code>B1</code>), matrix IDs (<code>M06</code>), or English keywords.</p></div>`;
  }

  return out;
}

export function renderLessonHtml(lesson, unit, manifest, state, starredSet) {
  const ordered = flattenLessons(manifest).map((entry) => entry.lesson);
  const idx = ordered.findIndex((item) => item.lesson_id === lesson.lesson_id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  const isStarred = starredSet.has(lesson.lesson_id);
  const lid = lesson.lesson_id;

  const matrixLookup = new Map((manifest.matrices ?? []).map((m) => [m.matrix_id, m]));
  const relatedMatrixIds =
    Array.isArray(lesson.related_matrices) && lesson.related_matrices.length
      ? lesson.related_matrices
      : (manifest.matrices ?? [])
          .filter((m) => Array.isArray(m.related_lessons) && m.related_lessons.includes(lid))
          .map((m) => m.matrix_id);

  const relatedMatrixBar = relatedMatrixIds.length
    ? `<div class="chip-bar"><span class="chip-label">Synonym Matrices:</span>` +
      relatedMatrixIds
        .map((mid) => {
          const matrix = matrixLookup.get(mid);
          const themeSuffix = matrix?.theme ? `: ${matrix.theme}` : "";
          return `<a class="chip-link chip-link--accent" href="#matrix/${escapeHtml(mid)}" data-open-matrix="${escapeHtml(mid)}">${escapeHtml(mid)}${escapeHtml(themeSuffix)}</a>`;
        })
        .join("") +
      `</div>`
    : "";

  let answeredTotal = 0;
  let correctTotal = 0;
  for (const q of lesson.practice_quiz) {
    const chosen = state.quizAnswers[q.question_id];
    if (typeof chosen === "number") {
      answeredTotal += 1;
      if (chosen === q.correct_index) correctTotal += 1;
    }
  }

  const jumpChips = [
    ...lesson.grammar_points.map(
      (gp) =>
        `<a class="chip-link" href="#lesson/${escapeHtml(lid)}/gp-${escapeHtml(gp.id)}" ` +
        `data-jump="${escapeHtml(lid)}::gp-${escapeHtml(gp.id)}">${escapeHtml(gp.pattern)}</a>`,
    ),
    `<a class="chip-link" href="#lesson/${escapeHtml(lid)}/lesson-contrast" data-jump="${escapeHtml(lid)}::lesson-contrast">Contrast</a>`,
    `<a class="chip-link" href="#lesson/${escapeHtml(lid)}/lesson-quiz" data-jump="${escapeHtml(lid)}::lesson-quiz">Quiz (${answeredTotal}/${lesson.practice_quiz.length})</a>`,
  ].join("");

  const snapshotRows = lesson.grammar_points
    .map(
      (gp) =>
        `<tr><td><a class="pattern-jump" href="#lesson/${escapeHtml(lid)}/gp-${escapeHtml(gp.id)}" data-jump="${escapeHtml(lid)}::gp-${escapeHtml(gp.id)}">${renderRubyHtml(gp.pattern_ruby)}</a></td>` +
        `<td><span class="recall-target">${renderRubyHtml(gp.meaning_en)}</span></td>` +
        `<td>${escapeHtml(REGISTER_LABELS[gp.register] || gp.register)}</td>` +
        `<td><span class="badge">${escapeHtml(STATUS_LABELS[gp.renshuu_status] || gp.renshuu_status)}</span></td></tr>`,
    )
    .join("");

  const cards = lesson.grammar_points
    .map((gp) => {
      const fRows = gp.formation
        .map((rule) => `<tr><td>${renderRubyHtml(rule.pos)}</td><td>${renderRubyHtml(rule.rule)}</td></tr>`)
        .join("");
      const exBlocks = gp.examples
        .map(
          (ex, exIdx) =>
            `<div class="ex-item">` +
            `<div class="ex-jp">${exIdx + 1}. ${renderRubyHtml(ex.ja_ruby)}</div>` +
            `<div class="ex-en"><span class="recall-target">${escapeHtml(ex.en)}</span></div>` +
            `<div class="ex-note">${renderProseWithLessonLinks(ex.structure_note, lid)}</div>` +
            `</div>`,
        )
        .join("");
      const pitfalls = gp.pitfalls
        .map((pitfall) => `<li>${renderProseWithLessonLinks(pitfall, lid)}</li>`)
        .join("");
      return `
        <div class="card" id="gp-${escapeHtml(gp.id)}">
          <div class="gp-head">
            <div><span class="gp-title">${renderRubyHtml(gp.pattern_ruby)}</span></div>
            <div class="badge-row">
              <span class="badge">${escapeHtml(REGISTER_LABELS[gp.register] || gp.register)}</span>
              <span class="badge">${escapeHtml(STATUS_LABELS[gp.renshuu_status] || gp.renshuu_status)}</span>
              <a class="top-jump" href="#lesson/${escapeHtml(lid)}/lesson-top" data-jump="${escapeHtml(lid)}::lesson-top">&#8593; Top</a>
            </div>
          </div>
          <p><strong>Meaning:</strong> <span class="recall-target">${renderRubyHtml(gp.meaning_en)}</span></p>
          <div class="table-wrap"><table class="lesson-table"><thead><tr><th>Part of Speech</th><th>Attachment Rule</th></tr></thead><tbody>${fRows}</tbody></table></div>
          <p><strong>Mental Model:</strong> ${renderProseWithLessonLinks(gp.mental_model, lid)}</p>
          <h3>Graded Examples</h3>
          ${exBlocks}
          <h3>Watch-Out Pitfalls</h3>
          <ul>${pitfalls}</ul>
        </div>`;
    })
    .join("");

  const contrast = lesson.lesson_contrast;
  const contrastRows = contrast.rows
    .map(
      (row) =>
        `<tr><td>${renderRubyHtml(row.expression)}</td><td>${escapeHtml(row.register)}</td>` +
        `<td><span class="recall-target">${renderRubyHtml(row.key_rule)}</span></td><td>${renderRubyHtml(row.example_short)}</td></tr>`,
    )
    .join("");

  const quizHtml = lesson.practice_quiz
    .map((q, qIdx) => {
      const chosen = state.quizAnswers[q.question_id];
      const hasAnswered = typeof chosen === "number";
      const isCorrect = hasAnswered && chosen === q.correct_index;
      const buttons = q.choices
        .map((ch, cIdx) => {
          let cls = "choice-btn";
          if (hasAnswered) {
            if (cIdx === q.correct_index) cls += " correct";
            else if (cIdx === chosen) cls += " wrong";
          }
          return `<button class="${cls}" type="button" data-quiz="${escapeHtml(q.question_id)}:${cIdx}" ${hasAnswered ? "disabled" : ""}><strong>${CHOICE_LETTERS[cIdx]}.</strong> ${renderRubyHtml(ch)}</button>`;
        })
        .join("");

      const starOrderHint =
        q.question_type === "star_order"
          ? `<p class="ex-note">Order the 4 fragments into the <code>＿</code> slots and choose which fragment goes on <code>★</code>.</p>`
          : "";

      let feedbackHtml = "";
      if (hasAnswered) {
        const cleanExpl = isCorrect
          ? q.explanation.replace(/^Correct:\s*/i, "")
          : q.explanation;
        const prefix = isCorrect
          ? "Correct!"
          : `Not quite (chose ${CHOICE_LETTERS[chosen]}):`;
        feedbackHtml =
          `<div class="quiz-expl ${isCorrect ? "correct" : "wrong"}" id="quiz-expl-${escapeHtml(q.question_id)}" tabindex="-1">` +
          `<strong>${escapeHtml(prefix)}</strong> ${renderProseWithLessonLinks(cleanExpl, lid)}</div>`;
      }

      return `
        <div class="quiz-card">
          <div><span class="badge accent">Q${qIdx + 1} — ${escapeHtml(QTYPE_LABELS[q.question_type] || q.question_type)}</span></div>
          <p class="quiz-prompt">${renderRubyHtml(q.prompt_ja_ruby)}</p>
          ${starOrderHint}
          <p class="ex-note">Context: <span class="recall-target">${renderRubyHtml(q.context_en)}</span></p>
          <div class="quiz-choices">${buttons}</div>
          ${feedbackHtml}
        </div>`;
    })
    .join("");

  return `
    <div class="card" id="lesson-top">
      <div class="lesson-header">
        <div class="lesson-header-title">
          <div class="breadcrumbs">${escapeHtml(unit.unit_title)}</div>
          <h1>${escapeHtml(lessonBadge(lesson))}: ${escapeHtml(lesson.renshuu_title)}</h1>
          <div class="badge-row">
            ${lesson.has_video ? `<span class="badge video-meta">&#9654; Includes Renshuu Video</span>` : ""}
            <span class="badge">${lesson.grammar_points.length} Grammar Points</span>
          </div>
        </div>
        <button class="btn ${isStarred ? "btn-starred" : ""}" type="button" data-star-main="${escapeHtml(lid)}" aria-pressed="${isStarred}">${isStarred ? "★ Starred" : "☆ Mark Starred"}</button>
      </div>
      <p>${renderProseWithLessonLinks(lesson.summary, lid)}</p>
      <div class="callout"><strong>Renshuu Study Tip:</strong> ${renderProseWithLessonLinks(lesson.study_tip, lid)}</div>
      ${relatedMatrixBar}
      <div class="chip-bar"><span class="chip-label">Sections:</span>${jumpChips}</div>
      <div class="table-wrap"><table class="lesson-table"><thead><tr><th>Pattern</th><th>Meaning</th><th>Register</th><th>Status</th></tr></thead><tbody>${snapshotRows}</tbody></table></div>
    </div>
    ${cards}
    <div class="card" id="lesson-contrast">
      <div class="lesson-header">
        <h2>Side-by-Side Contrast: ${renderRubyHtml(contrast.title)}</h2>
        <a class="top-jump" href="#lesson/${escapeHtml(lid)}/lesson-top" data-jump="${escapeHtml(lid)}::lesson-top">&#8593; Top</a>
      </div>
      <p>${renderProseWithLessonLinks(contrast.explanation, lid)}</p>
      <div class="table-wrap"><table class="lesson-table"><thead><tr><th>Expression</th><th>Register</th><th>Key Rule</th><th>Short Example</th></tr></thead><tbody>${contrastRows}</tbody></table></div>
    </div>
    <div class="card" id="lesson-quiz">
      <div class="lesson-header">
        <h2>Practice Checkup (${answeredTotal} / ${lesson.practice_quiz.length} Answered, ${correctTotal} Correct)</h2>
        <div class="badge-row">
          <a class="top-jump" href="#lesson/${escapeHtml(lid)}/lesson-top" data-jump="${escapeHtml(lid)}::lesson-top">&#8593; Top</a>
          <button class="btn" type="button" data-reset-quiz="${escapeHtml(lid)}">Reset Quiz</button>
        </div>
      </div>
      ${quizHtml}
    </div>
    <div class="footer-nav">
      <div>${prev ? `<button class="btn" type="button" data-open-lesson="${escapeHtml(prev.lesson_id)}">&larr; ${escapeHtml(lessonBadge(prev))} ${escapeHtml(prev.renshuu_title)}</button>` : ""}</div>
      <div>${next ? `<button class="btn" type="button" data-open-lesson="${escapeHtml(next.lesson_id)}">${escapeHtml(lessonBadge(next))} ${escapeHtml(next.renshuu_title)} &rarr;</button>` : ""}</div>
    </div>`;
}

export function renderMatrixHtml(matrix, allMatrices, manifest = null) {
  const idx = allMatrices.findIndex((item) => item.matrix_id === matrix.matrix_id);
  const prev = idx > 0 ? allMatrices[idx - 1] : null;
  const next = idx >= 0 && idx < allMatrices.length - 1 ? allMatrices[idx + 1] : null;
  const lessonMap = buildLessonMap(manifest);

  const manifestEntry = manifest?.matrices?.find((m) => m.matrix_id === matrix.matrix_id);
  const relatedLessonIds =
    Array.isArray(matrix.related_lessons) && matrix.related_lessons.length
      ? matrix.related_lessons
      : manifestEntry?.related_lessons ?? [];

  const relatedLessonsBar = relatedLessonIds.length
    ? `<div class="chip-bar"><span class="chip-label">Deep-Dive Lessons:</span>` +
      relatedLessonIds
        .map((lid) => {
          const hit = lessonMap.get(lid);
          const label = hit ? `${lessonBadge(hit.lesson)}: ${hit.lesson.renshuu_title}` : lid;
          return `<a class="chip-link chip-link--accent" href="#lesson/${escapeHtml(lid)}" data-open-lesson="${escapeHtml(lid)}">${escapeHtml(label)}</a>`;
        })
        .join("") +
      `</div>`
    : "";

  const ths = matrix.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const trs = matrix.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, cIdx) =>
            cIdx === 2
              ? `<td><span class="recall-target">${renderRubyHtml(cell)}</span></td>`
              : `<td>${renderRubyHtml(cell)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const pairs = matrix.minimal_pair_test
    .map(
      (pair) =>
        `<div class="ex-item">` +
        `<div style="font-weight:600;margin-bottom:4px">${renderRubyHtml(pair.pair_title)}</div>` +
        `<div class="ex-jp"><span class="badge ok">Natural</span> ${renderRubyHtml(pair.sentence_valid)}</div>` +
        `<div class="ex-jp"><span class="badge warn">Contrast</span> ${renderRubyHtml(pair.sentence_contrast)}</div>` +
        `<div class="ex-note"><span class="recall-target">${renderRubyHtml(pair.explanation)}</span></div>` +
        `</div>`,
    )
    .join("");

  return `
    <div class="card">
      <div class="breadcrumbs">Synonym Disambiguation Matrix (${escapeHtml(matrix.theme)})</div>
      <h1>${escapeHtml(matrix.matrix_id)}: ${renderRubyHtml(matrix.title)}</h1>
      <div class="callout"><strong>Decision Heuristic:</strong> ${renderRubyHtml(matrix.decision_heuristic)}</div>
      ${relatedLessonsBar}
      <div class="table-wrap"><table class="matrix-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>
      <h2>Minimal-Pair Proofs</h2>
      ${pairs}
    </div>
    <div class="footer-nav">
      <div>${prev ? `<button class="btn" type="button" data-open-matrix="${escapeHtml(prev.matrix_id)}">&larr; ${escapeHtml(prev.matrix_id)}: ${escapeHtml(prev.theme)}</button>` : ""}</div>
      <div>${next ? `<button class="btn" type="button" data-open-matrix="${escapeHtml(next.matrix_id)}">${escapeHtml(next.matrix_id)}: ${escapeHtml(next.theme)} &rarr;</button>` : ""}</div>
    </div>`;
}
