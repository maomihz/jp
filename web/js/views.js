import { escapeHtml, renderRubyHtml, stripRubySurface, toSearchableText } from "./ruby.js";

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

const CHOICE_LETTERS = ["A", "B", "C", "D"];

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

export function renderSidebarHtml(manifest, state, starredSet) {
  const parts = [];
  const homeActive = state.view === "overview" ? "active" : "";
  parts.push(
    `<div class="nav-item ${homeActive}" data-nav="overview">` +
      `<span class="nav-num">HOME</span><span class="nav-label">Overview &amp; 55-Lesson Grid</span></div>`,
  );

  if (state.filter === "all" || state.filter === "matrices") {
    parts.push(`<div class="nav-group-title">Synonym Matrices (${manifest.matrices.length})</div>`);
    for (const matrix of manifest.matrices) {
      const isActive = state.view === "matrix" && state.activeId === matrix.matrix_id ? "active" : "";
      parts.push(
        `<div class="nav-item ${isActive}" data-nav="matrix:${escapeHtml(matrix.matrix_id)}">` +
          `<span class="nav-num">${escapeHtml(matrix.matrix_id)}</span>` +
          `<span class="nav-label">${escapeHtml(stripRubySurface(matrix.title))}</span></div>`,
      );
    }
  }

  if (state.filter !== "matrices") {
    for (const unit of manifest.units) {
      const filteredLessons = unit.lessons.filter((lesson) => {
        const isBridge = typeof lesson.lesson_number !== "number";
        if (state.filter === "bridge") return isBridge;
        if (state.filter === "starred") return !isBridge && starredSet.has(lesson.lesson_id);
        if (state.filter === "unstarred") return !isBridge && !starredSet.has(lesson.lesson_id);
        return true;
      });
      if (!filteredLessons.length) continue;

      const shortTitle = String(unit.unit_title).split(":")[0];
      parts.push(`<div class="nav-group-title">${escapeHtml(shortTitle)}</div>`);
      for (const lesson of filteredLessons) {
        const isStarred = starredSet.has(lesson.lesson_id);
        const isActive = state.view === "lesson" && state.activeId === lesson.lesson_id ? "active" : "";
        parts.push(
          `<div class="nav-item ${isActive}" data-nav="lesson:${escapeHtml(lesson.lesson_id)}">` +
            `<button class="star-btn ${isStarred ? "starred" : ""}" data-star="${escapeHtml(lesson.lesson_id)}" type="button" title="Toggle studied star">${isStarred ? "★" : "☆"}</button>` +
            `<span class="nav-num">${escapeHtml(lessonBadge(lesson))}</span>` +
            `<span class="nav-label">${escapeHtml(lesson.renshuu_title)}</span>` +
            (lesson.has_video ? `<span class="vid-dot" title="Video lesson on Renshuu">▶</span>` : "") +
            `</div>`,
        );
      }
    }
  }

  return parts.join("");
}

export function renderOverviewHtml(manifest, starredSet) {
  const tiles = flattenLessons(manifest).map(({ lesson }) => {
    const isStarred = starredSet.has(lesson.lesson_id);
    return (
      `<div class="tile ${isStarred ? "starred-tile" : ""}" data-open-lesson="${escapeHtml(lesson.lesson_id)}">` +
      `<span style="color:${isStarred ? "var(--warn)" : "var(--muted)"}">${isStarred ? "★" : "☆"}</span>` +
      `<span class="nav-num">${escapeHtml(lessonBadge(lesson))}</span>` +
      `<span class="nav-label">${escapeHtml(lesson.renshuu_title)}</span></div>`
    );
  });

  const matrixTiles = manifest.matrices.map(
    (matrix) =>
      `<div class="tile" data-open-matrix="${escapeHtml(matrix.matrix_id)}">` +
      `<span class="nav-num">${escapeHtml(matrix.matrix_id)}</span>` +
      `<span class="nav-label">${escapeHtml(stripRubySurface(matrix.title))}</span></div>`,
  );

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
        <strong>Study Workflow:</strong> Use <strong>Ruby: Hover</strong> to test kanji reading,
        <strong>EN: Recall</strong> to blur English translations until clicked, and click <strong>☆</strong>
        on any lesson to mirror your Renshuu star progress locally. Press <code>/</code> anytime to search.
      </div>
    </div>
    <div class="card">
      <h2>All ${manifest.total_renshuu_lessons} Renshuu Lessons + Exam-Bridge Modules</h2>
      <div class="tile-grid">${tiles.join("")}</div>
    </div>
    <div class="card">
      <h2>${manifest.matrices.length} Synonym Disambiguation Matrices</h2>
      <div class="tile-grid">${matrixTiles.join("")}</div>
    </div>`;
}

export function renderSearchResultsHtml(manifest, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  const matchedLessons = [];
  const matchedPoints = [];
  const matchedMatrices = [];

  for (const { lesson } of flattenLessons(manifest)) {
    const lessonHay = [
      lesson.renshuu_title,
      lesson.lesson_id,
      toSearchableText(lesson.summary),
    ]
      .join(" ")
      .toLowerCase();
    if (lessonHay.includes(needle)) {
      matchedLessons.push(lesson);
    }
    for (const gp of lesson.grammar_index ?? []) {
      const pointHay = [
        gp.pattern,
        toSearchableText(gp.pattern_ruby),
        gp.romaji,
        gp.meaning_en,
        gp.mental_model_search,
      ]
        .join(" ")
        .toLowerCase();
      if (pointHay.includes(needle)) {
        matchedPoints.push({ lesson, gp });
      }
    }
  }

  for (const matrix of manifest.matrices) {
    const matrixHay = [
      matrix.matrix_id,
      toSearchableText(matrix.title),
      matrix.theme,
      matrix.decision_heuristic_search,
    ]
      .join(" ")
      .toLowerCase();
    if (matrixHay.includes(needle)) {
      matchedMatrices.push(matrix);
    }
  }

  let out =
    `<div class="card"><h1>Search: “${escapeHtml(query)}”</h1>` +
    `<p class="ex-note">${matchedPoints.length} grammar point(s), ${matchedLessons.length} lesson(s), ${matchedMatrices.length} matrix match(es).</p></div>`;

  if (matchedPoints.length) {
    out += `<div class="card"><h2>Matching Grammar Points</h2>`;
    for (const { lesson, gp } of matchedPoints.slice(0, 60)) {
      out +=
        `<div class="ex-item" style="cursor:pointer" data-jump="${escapeHtml(lesson.lesson_id)}::gp-${escapeHtml(gp.id)}">` +
        `<div><strong>${renderRubyHtml(gp.pattern_ruby)}</strong> <span class="gp-romaji">${escapeHtml(gp.romaji)}</span> ` +
        `<span class="badge">${escapeHtml(lessonBadge(lesson))} ${escapeHtml(lesson.renshuu_title)}</span></div>` +
        `<div class="ex-en">${escapeHtml(gp.meaning_en)}</div></div>`;
    }
    out += `</div>`;
  }

  if (matchedLessons.length) {
    const lessonTiles = matchedLessons
      .map(
        (lesson) =>
          `<div class="tile" data-open-lesson="${escapeHtml(lesson.lesson_id)}">` +
          `<span class="nav-num">${escapeHtml(lessonBadge(lesson))}</span>` +
          `<span class="nav-label">${escapeHtml(lesson.renshuu_title)}</span></div>`,
      )
      .join("");
    out += `<div class="card"><h2>Matching Lessons</h2><div class="tile-grid">${lessonTiles}</div></div>`;
  }

  if (matchedMatrices.length) {
    const matrixTiles = matchedMatrices
      .map(
        (matrix) =>
          `<div class="tile" data-open-matrix="${escapeHtml(matrix.matrix_id)}">` +
          `<span class="nav-num">${escapeHtml(matrix.matrix_id)}</span>` +
          `<span class="nav-label">${escapeHtml(stripRubySurface(matrix.title))}</span></div>`,
      )
      .join("");
    out += `<div class="card"><h2>Matching Synonym Matrices</h2><div class="tile-grid">${matrixTiles}</div></div>`;
  }

  if (!matchedPoints.length && !matchedLessons.length && !matchedMatrices.length) {
    out += `<div class="card"><p>No matching grammar points found. Try hiragana (e.g., <code>わけ</code>, <code>ように</code>), romaji (<code>hodo</code>), or English keywords.</p></div>`;
  }

  return out;
}

export function renderLessonHtml(lesson, unit, manifest, state, starredSet) {
  const ordered = flattenLessons(manifest).map((entry) => entry.lesson);
  const idx = ordered.findIndex((item) => item.lesson_id === lesson.lesson_id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  const isStarred = starredSet.has(lesson.lesson_id);

  const snapshotRows = lesson.grammar_points
    .map(
      (gp) =>
        `<tr><td><a href="#lesson/${escapeHtml(lesson.lesson_id)}/gp-${escapeHtml(gp.id)}" data-jump="${escapeHtml(lesson.lesson_id)}::gp-${escapeHtml(gp.id)}" style="color:var(--accent);text-decoration:none">${renderRubyHtml(gp.pattern_ruby)}</a></td>` +
        `<td><code>${escapeHtml(gp.romaji)}</code></td>` +
        `<td class="recall-target">${escapeHtml(gp.meaning_en)}</td>` +
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
            `<div class="ex-en recall-target">${escapeHtml(ex.en)}</div>` +
            `<div class="ex-note">${renderRubyHtml(ex.structure_note)}</div>` +
            `</div>`,
        )
        .join("");
      const pitfalls = gp.pitfalls.map((pitfall) => `<li>${renderRubyHtml(pitfall)}</li>`).join("");
      return `
        <div class="card" id="gp-${escapeHtml(gp.id)}">
          <div class="gp-head">
            <div><span class="gp-title">${renderRubyHtml(gp.pattern_ruby)}</span><span class="gp-romaji">${escapeHtml(gp.romaji)}</span></div>
            <div>
              <span class="badge">${escapeHtml(REGISTER_LABELS[gp.register] || gp.register)}</span>
              <span class="badge accent">${escapeHtml(STATUS_LABELS[gp.renshuu_status] || gp.renshuu_status)}</span>
            </div>
          </div>
          <p><strong>Meaning:</strong> <span class="recall-target">${escapeHtml(gp.meaning_en)}</span></p>
          <div class="table-wrap"><table><thead><tr><th>Part of Speech</th><th>Attachment Rule</th></tr></thead><tbody>${fRows}</tbody></table></div>
          <p><strong>Mental Model:</strong> ${renderRubyHtml(gp.mental_model)}</p>
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
        `<td>${renderRubyHtml(row.key_rule)}</td><td>${renderRubyHtml(row.example_short)}</td></tr>`,
    )
    .join("");

  let correctTotal = 0;
  let answeredTotal = 0;
  const quizHtml = lesson.practice_quiz
    .map((q, qIdx) => {
      const chosen = state.quizAnswers[q.question_id];
      const hasAnswered = typeof chosen === "number";
      if (hasAnswered) {
        answeredTotal += 1;
        if (chosen === q.correct_index) correctTotal += 1;
      }
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

      return `
        <div class="quiz-card">
          <div><span class="badge accent">Q${qIdx + 1} — ${escapeHtml(QTYPE_LABELS[q.question_type] || q.question_type)}</span></div>
          <p style="font-size:1.05rem;margin:8px 0 4px">${renderRubyHtml(q.prompt_ja_ruby)}</p>
          <p class="ex-note recall-target">Context: ${escapeHtml(q.context_en)}</p>
          <div class="quiz-choices">${buttons}</div>
          ${hasAnswered ? `<div class="quiz-expl"><strong>${chosen === q.correct_index ? "Correct!" : "Review:"}</strong> ${renderRubyHtml(q.explanation)}</div>` : ""}
        </div>`;
    })
    .join("");

  return `
    <div class="card">
      <div class="lesson-header">
        <div>
          <div class="breadcrumbs">${escapeHtml(unit.unit_title)}</div>
          <h1>${escapeHtml(lessonBadge(lesson))}: ${escapeHtml(lesson.renshuu_title)}</h1>
          ${lesson.has_video ? `<span class="badge accent">▶ Renshuu Video Lesson</span>` : ""}
          <span class="badge">${lesson.grammar_points.length} Grammar Points</span>
        </div>
        <button class="btn" type="button" data-star-main="${escapeHtml(lesson.lesson_id)}">${isStarred ? "★ Starred" : "☆ Mark Starred"}</button>
      </div>
      <p>${renderRubyHtml(lesson.summary)}</p>
      <div class="callout"><strong>Renshuu Study Tip:</strong> ${renderRubyHtml(lesson.study_tip)}</div>
      <div class="table-wrap"><table><thead><tr><th>Pattern</th><th>Romaji</th><th>Meaning</th><th>Status</th></tr></thead><tbody>${snapshotRows}</tbody></table></div>
    </div>
    ${cards}
    <div class="card">
      <h2>Side-by-Side Contrast: ${renderRubyHtml(contrast.title)}</h2>
      <p>${renderRubyHtml(contrast.explanation)}</p>
      <div class="table-wrap"><table><thead><tr><th>Expression</th><th>Register</th><th>Key Rule</th><th>Short Example</th></tr></thead><tbody>${contrastRows}</tbody></table></div>
    </div>
    <div class="card">
      <div class="lesson-header">
        <h2>Practice Checkup (${answeredTotal} / ${lesson.practice_quiz.length} Answered, ${correctTotal} Correct)</h2>
        <button class="btn" type="button" data-reset-quiz="${escapeHtml(lesson.lesson_id)}">Reset Quiz</button>
      </div>
      ${quizHtml}
    </div>
    <div class="footer-nav">
      <div>${prev ? `<button class="btn" type="button" data-open-lesson="${escapeHtml(prev.lesson_id)}">← ${escapeHtml(lessonBadge(prev))} ${escapeHtml(prev.renshuu_title)}</button>` : ""}</div>
      <div>${next ? `<button class="btn" type="button" data-open-lesson="${escapeHtml(next.lesson_id)}">${escapeHtml(lessonBadge(next))} ${escapeHtml(next.renshuu_title)} →</button>` : ""}</div>
    </div>`;
}

export function renderMatrixHtml(matrix, allMatrices) {
  const idx = allMatrices.findIndex((item) => item.matrix_id === matrix.matrix_id);
  const prev = idx > 0 ? allMatrices[idx - 1] : null;
  const next = idx >= 0 && idx < allMatrices.length - 1 ? allMatrices[idx + 1] : null;

  const ths = matrix.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const trs = matrix.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderRubyHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const pairs = matrix.minimal_pair_test
    .map(
      (pair) =>
        `<div class="ex-item">` +
        `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(pair.pair_title)}</div>` +
        `<div class="ex-jp"><span class="badge ok">Natural</span> ${renderRubyHtml(pair.sentence_valid)}</div>` +
        `<div class="ex-jp"><span class="badge warn">Contrast</span> ${renderRubyHtml(pair.sentence_contrast)}</div>` +
        `<div class="ex-note">${renderRubyHtml(pair.explanation)}</div>` +
        `</div>`,
    )
    .join("");

  return `
    <div class="card">
      <div class="breadcrumbs">Synonym Disambiguation Matrix (${escapeHtml(matrix.theme)})</div>
      <h1>${escapeHtml(matrix.matrix_id)}: ${renderRubyHtml(matrix.title)}</h1>
      <div class="callout"><strong>Decision Heuristic:</strong> ${renderRubyHtml(matrix.decision_heuristic)}</div>
      <div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>
      <h2>Minimal-Pair Proofs</h2>
      ${pairs}
    </div>
    <div class="footer-nav">
      <div>${prev ? `<button class="btn" type="button" data-open-matrix="${escapeHtml(prev.matrix_id)}">← ${escapeHtml(prev.matrix_id)}</button>` : ""}</div>
      <div>${next ? `<button class="btn" type="button" data-open-matrix="${escapeHtml(next.matrix_id)}">${escapeHtml(next.matrix_id)} →</button>` : ""}</div>
    </div>`;
}
