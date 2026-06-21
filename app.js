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
    html += '<th class="score-col">Score</th></tr>';
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
    refreshScores();
    renderFoot();
    updateAnalysis();
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
    html += "<td></td></tr>";
    els.gradeFoot.innerHTML = html;
  }

  function updateAnalysis() {
    // Class-wide stat cards
    let totalCorrect = 0, totalAttempted = 0, fullyDone = 0;
    const perStudent = students.map((stu) => {
      const s = studentStats(stu);
      totalCorrect += s.correct;
      totalAttempted += s.attempted;
      if (s.attempted === numQuestions) fullyDone++;
      return { name: stu.name, ...s };
    });
    const classPct = totalAttempted ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

    els.statCards.innerHTML = [
      card(students.length, "Students"),
      card(numQuestions, "Questions"),
      card(classPct + "%", "Class average"),
      card(fullyDone + "/" + students.length, "Fully graded"),
    ].join("");

    // Hardest questions (lowest % correct among attempted)
    const qStats = [];
    for (let q = 0; q < numQuestions; q++) {
      let correct = 0, attempted = 0;
      students.forEach((stu) => {
        if (stu.marks[q] === "correct") { correct++; attempted++; }
        else if (stu.marks[q] === "wrong") attempted++;
      });
      if (attempted) qStats.push({ q: q + 1, pct: Math.round((correct / attempted) * 100), attempted });
    }
    qStats.sort((a, b) => a.pct - b.pct);
    els.hardestList.innerHTML =
      qStats.slice(0, 5).map((s) => `<li>Question ${s.q} <span class="meta">${s.pct}% correct</span></li>`).join("") ||
      '<li class="meta">No questions graded yet.</li>';

    // Struggling students (lowest %, among those attempted)
    const ranked = perStudent.filter((s) => s.attempted > 0).sort((a, b) => a.pct - b.pct);
    els.strugglingList.innerHTML =
      ranked.slice(0, 5).map((s) => `<li>${escapeHtml(s.name)} <span class="meta">${s.pct}% (${s.correct}/${s.attempted})</span></li>`).join("") ||
      '<li class="meta">No students graded yet.</li>';
  }

  function card(num, lbl) {
    return `<div class="stat-card"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
