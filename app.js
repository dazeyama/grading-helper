// ---------------------------------------------------------------------------
// Grading Helper — basic UI prototype
// Tri-state cells: 'none' (did not participate) -> 'correct' -> 'wrong' -> 'none'
// ---------------------------------------------------------------------------

(function () {
  "use strict";

  const STATES = ["none", "correct", "wrong"];
  const GLYPH = { none: "", correct: "✓", wrong: "✗" };

  let students = []; // [{ name, marks: [state,...] }]
  let numQuestions = 10;

  // --- elements ---
  const els = {};
  document.addEventListener("DOMContentLoaded", function () {
    [
      "classList", "numQuestions", "assignmentName", "buildBtn", "clearBtn",
      "gradeTable", "gradeHead", "gradeBody", "gradeFoot", "emptyState",
      "analysisPanel", "statCards", "hardestList", "strugglingList",
      "scorePie", "pieLegend", "questionBars", "easiestList",
    ].forEach((id) => (els[id] = document.getElementById(id)));

    els.buildBtn.addEventListener("click", buildGrid);
    els.clearBtn.addEventListener("click", clearAll);

    // Seed with sample data so the layout is visible immediately.
    els.classList.value =
      "Ada Lovelace\nGrace Hopper\nKatherine Johnson\nAlan Turing\nMargaret Hamilton";
    buildGrid();
  });

  function parseNames(text) {
    return text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function buildGrid() {
    const names = parseNames(els.classList.value);
    numQuestions = Math.max(1, Math.min(100, parseInt(els.numQuestions.value, 10) || 1));

    if (names.length === 0) {
      clearAll();
      return;
    }

    students = names.map((name) => ({
      name,
      marks: new Array(numQuestions).fill("none"),
      done: false,
    }));

    renderHead();
    renderBody();
    els.gradeTable.hidden = false;
    els.emptyState.hidden = true;
    els.analysisPanel.hidden = false;
    updateAnalysis();
  }

  function clearAll() {
    students = [];
    els.gradeBody.innerHTML = "";
    els.gradeHead.innerHTML = "";
    els.gradeFoot.innerHTML = "";
    els.gradeTable.hidden = true;
    els.emptyState.hidden = false;
    els.analysisPanel.hidden = true;
  }

  function renderHead() {
    let html = '<tr><th class="name-col">Student</th>';
    for (let q = 0; q < numQuestions; q++) {
      html += `<th class="q-col">Q${q + 1}</th>`;
    }
    html += '<th class="score-col">Score</th><th class="done-col">Done</th></tr>';
    els.gradeHead.innerHTML = html;
  }

  function renderBody() {
    const frag = document.createDocumentFragment();
    students.forEach((stu, r) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.className = "name-col";
      nameTd.textContent = stu.name;
      tr.appendChild(nameTd);

      for (let q = 0; q < numQuestions; q++) {
        const td = document.createElement("td");
        const btn = document.createElement("button");
        btn.className = "cell state-" + stu.marks[q];
        btn.textContent = GLYPH[stu.marks[q]];
        btn.title = "Click to mark";
        btn.addEventListener("click", () => cycleCell(r, q, btn));
        td.appendChild(btn);
        tr.appendChild(td);
      }

      const scoreTd = document.createElement("td");
      scoreTd.className = "score-col";
      scoreTd.innerHTML = '<span class="score-pill">—</span>';
      tr.appendChild(scoreTd);

      const doneTd = document.createElement("td");
      doneTd.className = "done-col";
      const doneBtn = document.createElement("button");
      doneBtn.className = "done-btn";
      doneBtn.type = "button";
      doneBtn.addEventListener("click", () => toggleDone(r));
      doneTd.appendChild(doneBtn);
      tr.appendChild(doneTd);

      applyDoneStyling(tr, stu.done);
      frag.appendChild(tr);
    });
    els.gradeBody.innerHTML = "";
    els.gradeBody.appendChild(frag);
    refreshScores();
    renderFoot();
  }

  function cycleCell(r, q, btn) {
    const cur = students[r].marks[q];
    const next = STATES[(STATES.indexOf(cur) + 1) % STATES.length];
    students[r].marks[q] = next;
    btn.className = "cell state-" + next;
    btn.textContent = GLYPH[next];

    // Auto-mark Done when every question is filled (check or X); reopen if a
    // cell is cleared back to blank. This also "comes back" when a graded row
    // is edited and no longer complete.
    const allMarked = students[r].marks.every((m) => m !== "none");
    if (students[r].done !== allMarked) {
      students[r].done = allMarked;
      applyDoneStyling(els.gradeBody.children[r], allMarked);
    }

    refreshScores();
    renderFoot();
    updateAnalysis();
  }

  function toggleDone(r) {
    students[r].done = !students[r].done;
    applyDoneStyling(els.gradeBody.children[r], students[r].done);
    updateAnalysis();
  }

  function applyDoneStyling(tr, done) {
    tr.classList.toggle("row-done", done);
    const btn = tr.querySelector(".done-btn");
    if (btn) {
      btn.classList.toggle("is-done", done);
      btn.textContent = done ? "Done ✓" : "Done";
      btn.title = done ? "Marked fully graded — click to reopen" : "Mark this student fully graded";
    }
  }

  // Score = correct / (attempted), where attempted = correct + wrong.
  function studentStats(stu) {
    let correct = 0, wrong = 0;
    stu.marks.forEach((m) => {
      if (m === "correct") correct++;
      else if (m === "wrong") wrong++;
    });
    const attempted = correct + wrong;
    const pct = attempted ? Math.round((correct / attempted) * 100) : null;
    return { correct, wrong, attempted, pct };
  }

  function refreshScores() {
    const rows = els.gradeBody.children;
    students.forEach((stu, r) => {
      const { correct, attempted, pct } = studentStats(stu);
      const pill = rows[r].querySelector(".score-pill");
      pill.textContent = attempted ? `${pct}%` : "—";
      pill.title = `${correct}/${attempted} correct`;
    });
  }

  function renderFoot() {
    let html = '<tr><td class="name-col">Class % correct</td>';
    for (let q = 0; q < numQuestions; q++) {
      let correct = 0, attempted = 0;
      students.forEach((stu) => {
        if (stu.marks[q] === "correct") { correct++; attempted++; }
        else if (stu.marks[q] === "wrong") attempted++;
      });
      const pct = attempted ? Math.round((correct / attempted) * 100) : null;
      html += `<td>${pct === null ? "—" : pct + "%"}</td>`;
    }
    html += "<td></td><td></td></tr>";
    els.gradeFoot.innerHTML = html;
  }

  function updateAnalysis() {
    // Class-wide stat cards
    let totalCorrect = 0, totalAttempted = 0, fullyDone = 0;
    const perStudent = students.map((stu) => {
      const s = studentStats(stu);
      totalCorrect += s.correct;
      totalAttempted += s.attempted;
      if (stu.done) fullyDone++;
      return { name: stu.name, done: stu.done, ...s };
    });
    const classPct = totalAttempted ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

    els.statCards.innerHTML = [
      card(students.length, "Students"),
      card(numQuestions, "Questions"),
      card(classPct + "%", "Class average"),
      card(fullyDone + "/" + students.length, "Fully graded"),
    ].join("");

    // Score-distribution pie (only rows marked Done that have any marks)
    renderScorePie(perStudent.filter((s) => s.done && s.attempted > 0));

    // Per-question stats (% correct), used by the bar chart and hardest/easiest.
    const perQuestion = [];
    for (let q = 0; q < numQuestions; q++) {
      let correct = 0, attempted = 0;
      students.forEach((stu) => {
        if (stu.marks[q] === "correct") { correct++; attempted++; }
        else if (stu.marks[q] === "wrong") attempted++;
      });
      perQuestion.push({
        q: q + 1,
        correct,
        attempted,
        pct: attempted ? Math.round((correct / attempted) * 100) : null,
      });
    }
    renderQuestionBars(perQuestion);

    const graded = perQuestion.filter((s) => s.attempted > 0);
    const hardest = graded.slice().sort((a, b) => a.pct - b.pct).slice(0, 3);
    const easiest = graded.slice().sort((a, b) => b.pct - a.pct).slice(0, 3);
    const qLi = (s) => `<li>Q${s.q} <span class="meta">${s.pct}%</span></li>`;
    els.hardestList.innerHTML =
      hardest.map(qLi).join("") || '<li class="meta">No questions graded yet.</li>';
    els.easiestList.innerHTML =
      easiest.map(qLi).join("") || '<li class="meta">No questions graded yet.</li>';

    // Struggling students (lowest %, among those attempted)
    const ranked = perStudent.filter((s) => s.attempted > 0).sort((a, b) => a.pct - b.pct);
    els.strugglingList.innerHTML =
      ranked.slice(0, 5).map((s) => `<li>${escapeHtml(s.name)} <span class="meta">${s.pct}% (${s.correct}/${s.attempted})</span></li>`).join("") ||
      '<li class="meta">No students graded yet.</li>';
  }

  // --- score-distribution pie chart (pure SVG, no dependencies) ---
  function renderScorePie(graded) {
    let high = 0, mid = 0, low = 0;
    graded.forEach((s) => {
      if (s.pct >= 70) high++;
      else if (s.pct >= 51) mid++;
      else low++;
    });

    const buckets = [
      { label: "Meets", range: "70% and up", count: high, color: "#1f9d55" },
      { label: "Nearly meets", range: "51–69%", count: mid, color: "#e0a400" },
      { label: "Does not meet", range: "50% and below", count: low, color: "#d83a3a" },
    ];
    const total = high + mid + low;

    // Legend
    els.pieLegend.innerHTML = buckets
      .map(
        (b) =>
          `<li><span class="swatch" style="background:${b.color}"></span>` +
          `<span>${b.label} <span class="lg-range">(${b.range})</span></span>` +
          `<span class="lg-count">${b.count}</span></li>`
      )
      .join("");

    // Pie
    const cx = 60, cy = 60, r = 54;
    if (total === 0) {
      els.scorePie.innerHTML =
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#eef1f6"/>` +
        `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" fill="#9aa3b2">no data</text>`;
      return;
    }

    const slices = buckets.filter((b) => b.count > 0);
    if (slices.length === 1) {
      els.scorePie.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${slices[0].color}"/>`;
      return;
    }

    let angle = -Math.PI / 2; // start at top
    let svg = "";
    slices.forEach((b) => {
      const sweep = (b.count / total) * Math.PI * 2;
      const end = angle + sweep;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;
      svg += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} ` +
        `A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" ` +
        `fill="${b.color}"><title>${b.label}: ${b.count}</title></path>`;
      angle = end;
    });
    els.scorePie.innerHTML = svg;
  }

  // --- per-question % correct bar chart (pure SVG, no dependencies) ---
  function barColor(pct) {
    if (pct === null) return "#cdd3dd";
    if (pct >= 70) return "#1f9d55";
    if (pct >= 51) return "#e0a400";
    return "#d83a3a";
  }

  function renderQuestionBars(perQuestion) {
    const W = 340, H = 170;
    const m = { top: 10, right: 6, bottom: 22, left: 26 };
    const plotW = W - m.left - m.right;
    const plotH = H - m.top - m.bottom;
    const n = perQuestion.length;

    const y = (pct) => m.top + plotH * (1 - pct / 100);
    let svg = "";

    // Gridlines + Y labels at 0/50/100
    [0, 50, 100].forEach((g) => {
      const gy = y(g);
      svg += `<line x1="${m.left}" y1="${gy.toFixed(1)}" x2="${W - m.right}" y2="${gy.toFixed(1)}" ` +
        `stroke="#e2e7ef" stroke-width="1"/>`;
      svg += `<text x="${m.left - 4}" y="${(gy + 3).toFixed(1)}" text-anchor="end" ` +
        `font-size="8" fill="#9aa3b2">${g}</text>`;
    });

    // Bars
    const slot = plotW / Math.max(1, n);
    const bw = Math.min(slot * 0.7, 26);
    const labelEvery = n <= 20 ? 1 : Math.ceil(n / 15);

    perQuestion.forEach((s, i) => {
      const cx = m.left + slot * (i + 0.5);
      const x = cx - bw / 2;
      const pct = s.pct === null ? 0 : s.pct;
      const h = plotH * (pct / 100);
      const top = m.top + plotH - h;
      const title = s.attempted
        ? `Q${s.q}: ${s.pct}% (${s.correct}/${s.attempted})`
        : `Q${s.q}: not graded`;
      svg += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" ` +
        `height="${Math.max(0, h).toFixed(1)}" rx="1.5" fill="${barColor(s.pct)}">` +
        `<title>${title}</title></rect>`;
      if (i % labelEvery === 0) {
        svg += `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" ` +
          `font-size="8" fill="#6b7686">${s.q}</text>`;
      }
    });

    // Axes
    svg += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + plotH}" stroke="#aab2bf" stroke-width="1"/>`;
    svg += `<line x1="${m.left}" y1="${m.top + plotH}" x2="${W - m.right}" y2="${m.top + plotH}" stroke="#aab2bf" stroke-width="1"/>`;

    els.questionBars.innerHTML = svg;
  }

  function card(num, lbl) {
    return `<div class="stat-card"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
