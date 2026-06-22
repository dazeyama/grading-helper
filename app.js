// ---------------------------------------------------------------------------
// Grading Helper — basic UI prototype
// Tri-state cells: 'none' (did not participate) -> 'correct' -> 'wrong' -> 'none'
// ---------------------------------------------------------------------------

(function () {
  "use strict";

  const STATES = ["none", "correct", "wrong"];
  const GLYPH = { none: "", correct: "✓", wrong: "✗" };
  const STORE_KEY = "gradingHelper.session.v1";
  const SAMPLE_NAMES = [
    "Ada Lovelace", "Grace Hopper", "Katherine Johnson", "Alan Turing",
    "Margaret Hamilton", "Charles Babbage", "Dorothy Vaughan", "Linus Torvalds",
    "Hedy Lamarr", "Tim Berners-Lee", "Radia Perlman", "Dennis Ritchie",
    "Barbara Liskov", "John von Neumann", "Annie Easley",
  ];

  // Collection of tests. Each: { id, name, numQuestions, students, pinnedIndex, sheetCollapsed }
  let tests = [];
  let currentTestId = null;
  let testCounter = 0;

  // Working state for the CURRENT test (the render functions read these globals;
  // `students` is a live reference into the current test object).
  let students = []; // [{ name, marks: [state,...], done }]
  let numQuestions = 10;
  let pinnedIndex = null;   // index of the pinned student, or null
  let sheetCollapsed = false;
  let detailsCollapsed = false; // Analysis tab "Details" panel (global, not per-test)
  let menuIndex = null;     // student index the name menu is acting on

  // --- elements ---
  const els = {};
  document.addEventListener("DOMContentLoaded", function () {
    [
      "classList", "numQuestions", "testName", "newTestBtn", "clearBtn",
      "saveBtn", "loadBtn", "loadFile", "clearMarksBtn",
      "gradeTable", "gradeHead", "gradeBody", "gradeFoot", "emptyState",
      "analysisPanel", "analysisEmpty", "analysisTitle", "detailsPanel", "detailsHeader",
      "printPdfBtn", "statCards", "insightStrip",
      "hardestList", "strugglingList", "topList",
      "scorePie", "pieLegend", "questionBars", "easiestList", "tooltip",
      "pinnedPanel", "pinnedName", "pinnedGrid", "gridPanel", "sheetHeader",
      "sheetToggle", "nameMenu", "pinStudentBtn",
      "setupTestSelect", "gradeTestSelect", "analysisTestSelect", "deleteTestBtn",
    ].forEach((id) => (els[id] = document.getElementById(id)));

    initTooltip();

    els.newTestBtn.addEventListener("click", createTest);
    els.clearBtn.addEventListener("click", clearSetupForm);
    els.clearMarksBtn.addEventListener("click", clearMarks);

    // Setup form fields live-edit the SELECTED test.
    els.testName.addEventListener("input", applyNameEdit);
    els.classList.addEventListener("input", applyClassListEdit);
    els.numQuestions.addEventListener("change", applyQuestionCountEdit);

    // Test switcher dropdowns (Setup + Grade + Analysis stay in sync)
    els.setupTestSelect.addEventListener("change", (e) => switchTest(e.target.value));
    els.gradeTestSelect.addEventListener("change", (e) => switchTest(e.target.value));
    els.analysisTestSelect.addEventListener("change", (e) => switchTest(e.target.value));
    els.deleteTestBtn.addEventListener("click", deleteTest);

    // Save / load (CSV, one test per file)
    els.saveBtn.addEventListener("click", saveCsv);
    els.loadBtn.addEventListener("click", () => els.loadFile.click());
    els.loadFile.addEventListener("change", handleLoadFile);

    // Tab switching
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    // Pin / unpin + collapsible sheet
    els.sheetHeader.addEventListener("click", toggleSheet);
    els.detailsHeader.addEventListener("click", toggleDetails);
    els.printPdfBtn.addEventListener("click", printPdf);
    els.pinnedName.addEventListener("click", unpinStudent);
    els.pinStudentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menuIndex != null) pinStudent(menuIndex);
      closeNameMenu();
    });
    // Click anywhere else closes the name menu.
    document.addEventListener("click", () => closeNameMenu());

    // Resume the last session if one was cached; otherwise seed a sample test.
    if (!restoreSession()) seedDefaultTest();
  });

  // -------------------------------------------------------------------------
  // Custom tooltip — a single floating element driven by [data-tip] attributes.
  // Works for HTML and SVG targets; supports multi-line text via "\n".
  // -------------------------------------------------------------------------
  function initTooltip() {
    const tip = els.tooltip;

    const place = (x, y) => {
      const pad = 14;
      const r = tip.getBoundingClientRect();
      let left = x + pad, top = y + pad;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = Math.max(8, top) + "px";
    };
    let current = null;
    const hide = () => { tip.classList.remove("show"); tip.hidden = true; current = null; };
    const targetOf = (e) =>
      e.target && e.target.closest ? e.target.closest("[data-tip]") : null;

    // Position-driven so it never flickers moving between a card and its children.
    document.addEventListener("mousemove", (e) => {
      const el = targetOf(e);
      const text = el && el.getAttribute("data-tip");
      if (text) {
        if (el !== current) {
          tip.textContent = text;
          tip.hidden = false;
          tip.classList.add("show");
          current = el;
        }
        place(e.clientX, e.clientY);
      } else if (current) {
        hide();
      }
    });
    // Hide if the user scrolls the page while a tip is open.
    window.addEventListener("scroll", hide, true);
  }

  function syncTestTitle() {
    const t = getCurrentTest();
    els.analysisTitle.textContent = (t && t.name) ? t.name : "Untitled test";
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-pane").forEach((p) =>
      p.classList.toggle("active", p.dataset.pane === name));
    persist();
  }

  // -------------------------------------------------------------------------
  // Session cache — keep the last session in localStorage, restore on launch.
  // -------------------------------------------------------------------------
  function sanitizeTest(t) {
    const nq = Math.max(1, parseInt(t.numQuestions, 10) || 1);
    const studs = (Array.isArray(t.students) ? t.students : []).map((s) => {
      const marks = Array.isArray(s.marks) ? s.marks.slice(0, nq) : [];
      while (marks.length < nq) marks.push("none");
      return {
        name: String(s.name || ""),
        marks: marks.map((m) => (m === "correct" || m === "wrong" ? m : "none")),
        done: !!s.done,
      };
    });
    return {
      id: t.id || genId(),
      name: t.name || "Untitled test",
      numQuestions: nq,
      students: studs,
      pinnedIndex: (t.pinnedIndex != null && studs[t.pinnedIndex]) ? t.pinnedIndex : null,
      sheetCollapsed: !!t.sheetCollapsed,
    };
  }

  function persist() {
    try {
      syncCurrentTest();
      const activeTabEl = document.querySelector(".tab.active");
      const state = {
        v: 2,
        tests: tests.map((t) => ({
          id: t.id, name: t.name, numQuestions: t.numQuestions,
          pinnedIndex: t.pinnedIndex, sheetCollapsed: t.sheetCollapsed,
          students: t.students.map((s) => ({ name: s.name, marks: s.marks.slice(), done: !!s.done })),
        })),
        currentTestId: currentTestId,
        activeTab: activeTabEl ? activeTabEl.dataset.tab : "setup",
        detailsCollapsed: detailsCollapsed,
        setupName: els.testName.value,
        setupClassList: els.classList.value,
        setupNum: els.numQuestions.value,
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage unavailable (private mode / quota) — ignore */
    }
  }

  function restoreSession() {
    let state;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      state = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    if (!state || typeof state !== "object") return false;

    // Setup (new-test) form fields.
    els.testName.value = state.setupName != null ? state.setupName : (state.testName != null ? state.testName : "Quiz 1");
    els.classList.value = state.setupClassList != null ? state.setupClassList : (state.classList || "");
    els.numQuestions.value = state.setupNum || state.numQuestionsInput || 10;
    detailsCollapsed = !!state.detailsCollapsed;

    if (Array.isArray(state.tests) && state.tests.length) {
      tests = state.tests.map(sanitizeTest);
      currentTestId = tests.some((t) => t.id === state.currentTestId) ? state.currentTestId : tests[0].id;
    } else if (state.built && Array.isArray(state.students) && state.students.length) {
      // Migrate an old single-session (v1) cache into one test.
      const t = sanitizeTest({
        name: state.testName || "Quiz 1",
        numQuestions: state.numQuestions,
        pinnedIndex: state.pinnedIndex,
        sheetCollapsed: state.sheetCollapsed,
        students: state.students,
      });
      tests = [t];
      currentTestId = t.id;
    } else {
      return false; // nothing usable — caller seeds a default test
    }

    loadTestIntoGlobals(getCurrentTest());
    applyDetailsCollapsed();
    switchTab(state.activeTab || "setup");
    return true;
  }

  function parseNames(text) {
    return text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // ---- multi-test management ----
  function genId() {
    return "t" + (++testCounter) + "_" + new Date().getTime();
  }

  function makeTest(name, nq, names) {
    const q = Math.max(1, Math.min(100, nq || 1));
    return {
      id: genId(),
      name: (name || "Untitled test").trim() || "Untitled test",
      numQuestions: q,
      students: names.map((n) => ({ name: n, marks: new Array(q).fill("none"), done: false })),
      pinnedIndex: null,
      sheetCollapsed: false,
    };
  }

  function getCurrentTest() {
    return tests.find((t) => t.id === currentTestId) || null;
  }

  // Write the live working globals back into the current test object.
  function syncCurrentTest() {
    const t = getCurrentTest();
    if (!t) return;
    t.students = students;
    t.numQuestions = numQuestions;
    t.pinnedIndex = pinnedIndex;
    t.sheetCollapsed = sheetCollapsed;
  }

  // Point the working globals at a test and render the whole UI for it.
  function loadTestIntoGlobals(t) {
    students = t.students;
    numQuestions = t.numQuestions;
    pinnedIndex = (t.pinnedIndex != null && t.students[t.pinnedIndex]) ? t.pinnedIndex : null;
    sheetCollapsed = !!t.sheetCollapsed;
    // Mirror the test into the Setup editor form.
    els.testName.value = t.name;
    els.numQuestions.value = t.numQuestions;
    els.classList.value = t.students.map((s) => s.name).join("\n");
    renderCurrentTest();
  }

  function renderCurrentTest() {
    renderHead();
    renderBody();
    els.gradeTable.hidden = students.length === 0;
    els.emptyState.hidden = students.length !== 0;
    els.analysisPanel.hidden = false;
    els.detailsPanel.hidden = false;
    els.analysisEmpty.hidden = true;
    if (pinnedIndex != null) renderPinned();
    else els.pinnedPanel.hidden = true;
    applySheetCollapsed();
    syncTestTitle();
    updateAnalysis();
    renderTestOptions();
  }

  // Append "(n)" when several tests share the same name, to tell them apart.
  function disambiguatedName(t) {
    const nm = t.name || "Untitled";
    const same = tests.filter((x) => (x.name || "Untitled") === nm);
    return same.length <= 1 ? nm : `${nm} (${same.indexOf(t) + 1})`;
  }

  function renderTestOptions() {
    const opts = tests
      .map((t) => `<option value="${t.id}">${escapeHtml(disambiguatedName(t))}</option>`)
      .join("");
    [els.setupTestSelect, els.gradeTestSelect, els.analysisTestSelect].forEach((sel) => {
      sel.innerHTML = opts;
      sel.value = currentTestId;
    });
  }

  function deleteTest() {
    const t = getCurrentTest();
    if (!t) return;
    if (!window.confirm(`Delete the test "${disambiguatedName(t)}"? This permanently removes its roster and all grading data.`)) return;

    const idx = tests.findIndex((x) => x.id === t.id);
    tests.splice(idx, 1);

    if (tests.length === 0) {
      // Always keep at least one test — create a fresh empty one.
      const blank = makeTest("New Test", 10, []);
      tests = [blank];
      currentTestId = blank.id;
      loadTestIntoGlobals(blank);
    } else {
      const next = tests[Math.min(idx, tests.length - 1)];
      currentTestId = next.id;
      loadTestIntoGlobals(next);
    }
    persist();
  }

  function switchTest(id) {
    if (!id || id === currentTestId) return;
    syncCurrentTest();
    currentTestId = id;
    const t = getCurrentTest();
    if (t) loadTestIntoGlobals(t);
    persist();
  }

  // "Create Test" adds a fresh, empty test and selects it; fill it in via the
  // live Setup form (Test name + Class list edit the selected test directly).
  function createTest() {
    const nq = Math.max(1, Math.min(100, parseInt(els.numQuestions.value, 10) || 10));
    syncCurrentTest();
    const t = makeTest("New Test", nq, []);
    tests.push(t);
    currentTestId = t.id;
    loadTestIntoGlobals(t);
    switchTab("setup");
    els.testName.focus();
    els.testName.select();
    persist();
  }

  function seedDefaultTest() {
    const t = makeTest("Quiz 1", 10, SAMPLE_NAMES);
    tests = [t];
    currentTestId = t.id;
    loadTestIntoGlobals(t);
    persist();
  }

  // ---- live editing of the selected test via the Setup form ----
  function applyNameEdit() {
    const t = getCurrentTest();
    if (!t) return;
    t.name = els.testName.value;
    renderTestOptions();
    syncTestTitle();
    persist();
  }

  function applyClassListEdit() {
    const t = getCurrentTest();
    if (!t) return;
    const names = parseNames(els.classList.value);
    // Reuse existing student objects by name so marks survive add/remove/reorder.
    const pool = {};
    students.forEach((s) => { (pool[s.name] = pool[s.name] || []).push(s); });
    const pinnedStudent = pinnedIndex != null ? students[pinnedIndex] : null;
    students = names.map((n) =>
      (pool[n] && pool[n].length) ? pool[n].shift()
        : { name: n, marks: new Array(numQuestions).fill("none"), done: false });
    t.students = students;
    pinnedIndex = pinnedStudent ? students.indexOf(pinnedStudent) : -1;
    if (pinnedIndex < 0) { pinnedIndex = null; els.pinnedPanel.hidden = true; }
    renderBody();
    if (pinnedIndex != null) renderPinned();
    updateAnalysis();
    persist();
  }

  function applyQuestionCountEdit() {
    const t = getCurrentTest();
    if (!t) return;
    const nq = Math.max(1, Math.min(100, parseInt(els.numQuestions.value, 10) || 1));
    if (nq === numQuestions) return;
    if (nq < numQuestions &&
        !window.confirm(`Reduce to ${nq} questions? Any marks for questions ${nq + 1}–${numQuestions} will be removed.`)) {
      els.numQuestions.value = numQuestions;
      return;
    }
    numQuestions = nq;
    t.numQuestions = nq;
    students.forEach((s) => {
      if (s.marks.length > nq) s.marks = s.marks.slice(0, nq);
      while (s.marks.length < nq) s.marks.push("none");
      s.done = s.marks.every((m) => m !== "none") ? s.done : false;
    });
    renderHead();
    renderBody();
    if (pinnedIndex != null) renderPinned();
    updateAnalysis();
    persist();
  }

  // The Setup-tab "Clear" button empties the selected test's name and roster.
  function clearSetupForm() {
    if (!getCurrentTest()) return;
    if (students.length && !window.confirm("Clear this test's name and class list?")) return;
    els.testName.value = "";
    els.classList.value = "";
    applyNameEdit();
    applyClassListEdit();
    els.testName.focus();
  }

  // Reset every mark and Done flag for the current test, keeping the roster.
  function clearMarks() {
    if (!students.length) return;
    if (!window.confirm("Clear all marks and Done flags for every student? The roster and questions stay.")) return;
    students.forEach((s) => {
      s.marks = s.marks.map(() => "none");
      s.done = false;
    });
    renderBody();
    if (pinnedIndex != null) renderPinned();
    updateAnalysis();
    persist();
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
      nameTd.addEventListener("click", (e) => { e.stopPropagation(); openNameMenu(r, e.clientX, e.clientY); });
      tr.appendChild(nameTd);

      for (let q = 0; q < numQuestions; q++) {
        const td = document.createElement("td");
        const btn = document.createElement("button");
        btn.className = "cell state-" + stu.marks[q];
        btn.textContent = GLYPH[stu.marks[q]];
        btn.addEventListener("click", () => applyCellChange(r, q));
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

      applyDoneStyling(tr, stu);
      frag.appendChild(tr);
    });
    els.gradeBody.innerHTML = "";
    els.gradeBody.appendChild(frag);
    refreshScores();
    renderFoot();
  }

  // Cycle a student's question mark; keeps the main grid and pinned panel in sync.
  function applyCellChange(r, q) {
    const cur = students[r].marks[q];
    const next = STATES[(STATES.indexOf(cur) + 1) % STATES.length];
    students[r].marks[q] = next;

    // Auto-mark Done when every question is filled; reopen if cleared to blank.
    students[r].done = students[r].marks.every((m) => m !== "none");

    // Update the main grid row (it may be collapsed/offscreen, but stays current).
    const tr = els.gradeBody.children[r];
    if (tr) {
      const mb = tr.querySelectorAll(".cell")[q];
      if (mb) { mb.className = "cell state-" + next; mb.textContent = GLYPH[next]; }
      applyDoneStyling(tr, students[r]);
    }

    refreshScores();
    renderFoot();
    if (pinnedIndex === r) renderPinned();
    updateAnalysis();
    persist();
  }

  function toggleDone(r) {
    students[r].done = !students[r].done;
    const tr = els.gradeBody.children[r];
    if (tr) applyDoneStyling(tr, students[r]);
    if (pinnedIndex === r) renderPinned();
    updateAnalysis();
    persist();
  }

  function scoreBand(pct) {
    if (pct == null) return "none";
    if (pct >= 70) return "meets";
    if (pct >= 51) return "nearly";
    return "notmeet";
  }

  function applyDoneStyling(tr, stu) {
    const done = !!stu.done;
    tr.classList.toggle("row-done", done);
    tr.classList.remove("band-meets", "band-nearly", "band-notmeet", "band-none");
    if (done) tr.classList.add("band-" + scoreBand(studentStats(stu).pct));

    const btn = tr.querySelector(".done-btn");
    if (btn) {
      btn.classList.toggle("is-done", done);
      btn.textContent = done ? "Done ✓" : "Done";
      btn.setAttribute("data-tip", done ? "Marked fully graded — click to reopen" : "Mark this student fully graded");
    }
  }

  // -------------------------------------------------------------------------
  // Pin a student, collapsible sheet, and the name popup menu
  // -------------------------------------------------------------------------
  function openNameMenu(r, x, y) {
    menuIndex = r;
    const menu = els.nameMenu;
    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = x, top = y + 6;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
    if (top + mh > window.innerHeight - 8) top = y - mh - 6;
    menu.style.left = Math.max(8, left) + "px";
    menu.style.top = Math.max(8, top) + "px";
  }

  function closeNameMenu() {
    els.nameMenu.hidden = true;
    menuIndex = null;
  }

  function pinStudent(r) {
    if (r == null || !students[r]) return;
    pinnedIndex = r;
    sheetCollapsed = true; // collapse the main sheet while a student is pinned
    renderPinned();
    applySheetCollapsed();
    persist();
  }

  function unpinStudent() {
    pinnedIndex = null;
    els.pinnedPanel.hidden = true;
    sheetCollapsed = false; // reopen the sheet
    applySheetCollapsed();
    persist();
  }

  function renderPinned() {
    const stu = pinnedIndex != null ? students[pinnedIndex] : null;
    if (!stu) { els.pinnedPanel.hidden = true; return; }

    els.pinnedName.textContent = stu.name;

    const table = document.createElement("table");
    table.className = "grade-table pinned-table";

    const thead = document.createElement("thead");
    let h = "<tr>";
    for (let q = 1; q <= numQuestions; q++) h += `<th class="q-col">Q${q}</th>`;
    h += '<th class="score-col">Score</th><th class="done-col">Done</th></tr>';
    thead.innerHTML = h;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const tr = document.createElement("tr");
    for (let q = 0; q < numQuestions; q++) {
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.className = "cell state-" + stu.marks[q];
      btn.textContent = GLYPH[stu.marks[q]];
      btn.addEventListener("click", () => applyCellChange(pinnedIndex, q));
      td.appendChild(btn);
      tr.appendChild(td);
    }
    const s = studentStats(stu);
    const scoreTd = document.createElement("td");
    scoreTd.className = "score-col";
    scoreTd.innerHTML = `<span class="score-pill">${s.attempted ? s.pct + "%" : "—"}</span>`;
    tr.appendChild(scoreTd);

    const doneTd = document.createElement("td");
    doneTd.className = "done-col";
    const doneBtn = document.createElement("button");
    doneBtn.className = "done-btn";
    doneBtn.type = "button";
    doneBtn.addEventListener("click", () => toggleDone(pinnedIndex));
    doneTd.appendChild(doneBtn);
    tr.appendChild(doneTd);

    applyDoneStyling(tr, stu);
    tbody.appendChild(tr);
    table.appendChild(tbody);

    els.pinnedGrid.innerHTML = "";
    els.pinnedGrid.appendChild(table);
    els.pinnedPanel.hidden = false;
  }

  function toggleSheet() {
    sheetCollapsed = !sheetCollapsed;
    applySheetCollapsed();
    persist();
  }

  function applySheetCollapsed() {
    els.gridPanel.classList.toggle("collapsed", sheetCollapsed);
  }

  function toggleDetails() {
    detailsCollapsed = !detailsCollapsed;
    applyDetailsCollapsed();
    persist();
  }

  function applyDetailsCollapsed() {
    els.detailsPanel.classList.toggle("collapsed", detailsCollapsed);
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
      pill.setAttribute("data-tip", `${correct}/${attempted} correct`);
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
    // ---- per-student ----
    let totalCorrect = 0, totalAttempted = 0, totalWrong = 0, fullyDone = 0;
    const perStudent = students.map((stu) => {
      const s = studentStats(stu);
      totalCorrect += s.correct;
      totalAttempted += s.attempted;
      totalWrong += s.wrong;
      if (stu.done) fullyDone++;
      return { name: stu.name, done: stu.done, ...s };
    });
    const gradedStudents = perStudent.filter((s) => s.attempted > 0);

    // ---- per-question ----
    const perQuestion = [];
    for (let q = 0; q < numQuestions; q++) {
      let correct = 0, attempted = 0;
      students.forEach((stu) => {
        if (stu.marks[q] === "correct") { correct++; attempted++; }
        else if (stu.marks[q] === "wrong") attempted++;
      });
      perQuestion.push({
        q: q + 1, correct, attempted,
        blanks: students.length - attempted,
        pct: attempted ? Math.round((correct / attempted) * 100) : null,
      });
    }
    const gradedQs = perQuestion.filter((s) => s.attempted > 0);

    // ---- derived metrics ----
    const pcts = gradedStudents.map((s) => s.pct).sort((a, b) => a - b);
    const n = pcts.length;
    const meanPct = n ? Math.round(pcts.reduce((a, b) => a + b, 0) / n) : null;
    const lowest = n ? pcts[0] : null;
    const highest = n ? pcts[n - 1] : null;

    const meetsCount = gradedStudents.filter((s) => s.pct >= 70).length;
    const nearlyCount = gradedStudents.filter((s) => s.pct >= 51 && s.pct < 70).length;
    const notMeetCount = gradedStudents.filter((s) => s.pct <= 50).length;

    const totalCells = students.length * numQuestions;
    const blanks = totalCells - totalAttempted;
    const donePct = students.length ? Math.round((fullyDone / students.length) * 100) : 0;

    // ---- stat cards ----
    const pc = (v) => (v === null ? "—" : v + "%");
    els.statCards.innerHTML = [
      card(students.length, "Students"),
      card(numQuestions, "Questions"),
      card(pc(meanPct), "Class average", "Mean of student scores (graded only)"),
      card(n ? lowest + "–" + highest + "%" : "—", "Range", "Lowest to highest score"),
      card(n ? `${meetsCount}/${n}` : "—",
        n ? `Students Meeting (<strong>${Math.round((meetsCount / n) * 100)}%</strong>)` : "Students Meeting",
        "Students at or above 70%"),
      card(`${fullyDone}/${students.length}`, "Graded", "Rows marked Done"),
    ].join("");

    // ---- insights strip (auto-generated highlights) ----
    // Each highlight gets a tooltip naming the students (or questions) it refers to.
    const joinNames = (arr) => (arr.length ? arr.join(", ") : "(none)");
    const namesWhere = (pred) => students.filter(pred).map((s) => s.name);

    const ins = [];
    {
      const doneNames = namesWhere((s) => s.done);
      const notDone = namesWhere((s) => !s.done);
      ins.push({ tone: "info",
        text: `Grading ${donePct}% complete — ${fullyDone} of ${students.length} marked done.`,
        tip: `Done: ${joinNames(doneNames)}` + (notDone.length ? `\nNot done: ${joinNames(notDone)}` : "") });
    }
    if (n) {
      const meetsNames = gradedStudents.filter((s) => s.pct >= 70).map((s) => s.name);
      const nearlyNames = gradedStudents.filter((s) => s.pct >= 51 && s.pct < 70).map((s) => s.name);
      const notMeetNames = gradedStudents.filter((s) => s.pct <= 50).map((s) => s.name);
      ins.push({ tone: notMeetCount > meetsCount ? "warn" : "good",
        text: `${meetsCount} meet, ${nearlyCount} nearly, ${notMeetCount} do not meet (of ${n} graded).`,
        tip: `Meets: ${joinNames(meetsNames)}\nNearly: ${joinNames(nearlyNames)}\nDoes not meet: ${joinNames(notMeetNames)}` });
    }
    if (gradedQs.length) {
      const worst = gradedQs.slice().sort((a, b) => a.pct - b.pct)[0];
      const wrongNames = namesWhere((s) => s.marks[worst.q - 1] === "wrong");
      ins.push({ tone: worst.pct <= 50 ? "bad" : "info",
        text: `Toughest question: Q${worst.q} at ${worst.pct}% correct.`,
        tip: `Got Q${worst.q} wrong: ${joinNames(wrongNames)}` });
      const acedQs = gradedQs.filter((q) => q.pct === 100);
      if (acedQs.length) ins.push({ tone: "good",
        text: `${acedQs.length} question${acedQs.length !== 1 ? "s" : ""} the whole class got right.`,
        tip: `Everyone correct: ${acedQs.map((q) => "Q" + q.q).join(", ")}` });
      const missedQs = gradedQs.filter((q) => q.pct === 0);
      if (missedQs.length) ins.push({ tone: "bad",
        text: `${missedQs.length} question${missedQs.length !== 1 ? "s" : ""} no one got right.`,
        tip: `No one correct: ${missedQs.map((q) => "Q" + q.q).join(", ")}` });
    }
    if (blanks > 0) {
      const mostSkipped = perQuestion.slice().sort((a, b) => b.blanks - a.blanks)[0];
      const skipNames = namesWhere((s) => s.marks[mostSkipped.q - 1] === "none");
      ins.push({ tone: "warn",
        text: `${blanks} blank cell${blanks !== 1 ? "s" : ""}; most skipped is Q${mostSkipped.q} (${mostSkipped.blanks} unanswered).`,
        tip: `Didn't answer Q${mostSkipped.q}: ${joinNames(skipNames)}` });
    }
    els.insightStrip.innerHTML = ins.length
      ? ins.map((i) => `<div class="insight tone-${i.tone}" data-tip="${escapeHtml(i.tip || "")}">${i.text}</div>`).join("")
      : '<div class="insight tone-info">Start grading to see insights.</div>';

    // ---- charts ----
    renderScorePie(perStudent.filter((s) => s.done && s.attempted > 0));
    renderQuestionBars(perQuestion);

    // ---- hardest / easiest questions ----
    // Tooltips for Hardest/Easiest disabled for now — leave for future use:
    // const qLi = (s) => {
    //   const wrong = namesWhere((stu) => stu.marks[s.q - 1] === "wrong");
    //   const tip = `Got Q${s.q} wrong: ${joinNames(wrong)}`;
    //   return `<li data-tip="${escapeHtml(tip)}">Q${s.q} <span class="meta">${s.pct}% (${s.correct}/${s.attempted})</span></li>`;
    // };
    const qLi = (s) => `<li>Q${s.q} <span class="meta">${s.pct}% (${s.correct}/${s.attempted})</span></li>`;
    els.hardestList.innerHTML =
      gradedQs.slice().sort((a, b) => a.pct - b.pct).slice(0, 3).map(qLi).join("") ||
      '<li class="meta">No questions graded yet.</li>';
    els.easiestList.innerHTML =
      gradedQs.slice().sort((a, b) => b.pct - a.pct).slice(0, 3).map(qLi).join("") ||
      '<li class="meta">No questions graded yet.</li>';

    // ---- top performers / needs attention ----
    const sLi = (s) => `<li>${escapeHtml(s.name)} <span class="meta">${s.pct}% (${s.correct}/${s.attempted})</span></li>`;
    els.topList.innerHTML =
      gradedStudents.slice().sort((a, b) => b.pct - a.pct).slice(0, 5).map(sLi).join("") ||
      '<li class="meta">No students graded yet.</li>';
    els.strugglingList.innerHTML =
      gradedStudents.slice().sort((a, b) => a.pct - b.pct).slice(0, 5).map(sLi).join("") ||
      '<li class="meta">No students graded yet.</li>';
  }

  // --- score-distribution pie chart (pure SVG, no dependencies) ---
  function renderScorePie(graded) {
    const high = [], mid = [], low = [];
    graded.forEach((s) => {
      if (s.pct >= 70) high.push(s.name);
      else if (s.pct >= 51) mid.push(s.name);
      else low.push(s.name);
    });

    const buckets = [
      { label: "Meets", range: "70% and up", names: high, count: high.length, color: "#1f9d55" },
      { label: "Nearly meets", range: "51–69%", names: mid, count: mid.length, color: "#e0a400" },
      { label: "Does not meet", range: "50% and below", names: low, count: low.length, color: "#d83a3a" },
    ];
    const total = high.length + mid.length + low.length;

    // Legend — show each band's live share of graded students (bold)
    els.pieLegend.innerHTML = buckets
      .map((b) => {
        const pct = total ? Math.round((b.count / total) * 100) : 0;
        return `<li data-tip="${b.range}"><span class="swatch" style="background:${b.color}"></span>` +
          `<span>${b.label} (<strong>${pct}%</strong>)</span>` +
          `<span class="lg-count">${b.count}</span></li>`;
      })
      .join("");

    // Pie
    const cx = 60, cy = 60, r = 54;
    if (total === 0) {
      els.scorePie.innerHTML =
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#eef1f6"/>` +
        `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" fill="#9aa3b2">no data</text>`;
      return;
    }

    // Tooltip lists the students in each band, one per line.
    const sliceTitle = (b) => escapeHtml(`${b.label}:\n` + b.names.join("\n"));

    const slices = buckets.filter((b) => b.count > 0);
    if (slices.length === 1) {
      els.scorePie.innerHTML =
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${slices[0].color}" data-tip="${sliceTitle(slices[0])}"/>`;
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
        `fill="${b.color}" data-tip="${sliceTitle(b)}"></path>`;
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
        `font-size="8" fill="#1f2733">${g}</text>`;
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
        `height="${Math.max(0, h).toFixed(1)}" rx="1.5" fill="${barColor(s.pct)}" ` +
        `data-tip="${escapeHtml(title)}"></rect>`;
      if (i % labelEvery === 0) {
        svg += `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" ` +
          `font-size="8" fill="#1f2733">${s.q}</text>`;
      }
    });

    // Axes (black)
    svg += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + plotH}" stroke="#1f2733" stroke-width="1.5"/>`;
    svg += `<line x1="${m.left}" y1="${m.top + plotH}" x2="${W - m.right}" y2="${m.top + plotH}" stroke="#1f2733" stroke-width="1.5"/>`;

    els.questionBars.innerHTML = svg;
  }

  function card(num, lbl, tip) {
    const t = tip ? ` data-tip="${escapeHtml(tip)}"` : "";
    return `<div class="stat-card"${t}><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // -------------------------------------------------------------------------
  // Save / load — one test per CSV file
  // -------------------------------------------------------------------------

  function csvEscape(v) {
    const s = String(v == null ? "" : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv() {
    const t = getCurrentTest();
    const rows = [];
    rows.push(["Test Name", (t && t.name ? t.name : "").trim()]);
    rows.push(["Questions", String(numQuestions)]);
    rows.push([]); // spacer

    const header = ["Student"];
    for (let q = 1; q <= numQuestions; q++) header.push("Q" + q);
    header.push("Done", "Score");
    rows.push(header);

    students.forEach((stu) => {
      const s = studentStats(stu);
      const row = [stu.name];
      for (let q = 0; q < numQuestions; q++) {
        row.push(stu.marks[q] === "correct" ? "Correct" : stu.marks[q] === "wrong" ? "Wrong" : "");
      }
      row.push(stu.done ? "Done" : "");
      row.push(s.attempted ? s.pct + "%" : "");
      rows.push(row);
    });

    return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  }

  function safeFilename(name) {
    const base = (name || "").trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}-${pad(d.getMinutes())}`;
    return `${base || "grading-export"} ${stamp}.csv`;
  }

  function saveCsv() {
    // Prepend a UTF-8 BOM so Excel reads accented names correctly.
    const blob = new Blob(["﻿" + buildCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFilename(getCurrentTest() ? getCurrentTest().name : "grading-export");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF).
  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function mapMark(cell) {
    const v = (cell || "").trim().toLowerCase();
    if (["correct", "c", "1", "y", "yes", "true", "right", "✓"].includes(v)) return "correct";
    if (["wrong", "x", "0", "incorrect", "w", "✗"].includes(v)) return "wrong";
    return "none";
  }

  function mapDone(cell) {
    const v = (cell || "").trim().toLowerCase();
    return ["done", "yes", "y", "true", "1", "✓"].includes(v);
  }

  function handleLoadFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadFromCsv(String(reader.result));
      } catch (err) {
        alert("Could not load that file: " + err.message);
      }
      els.loadFile.value = ""; // allow re-loading the same file
    };
    reader.readAsText(file);
  }

  function loadFromCsv(text) {
    const rows = parseCsv(text);
    let name = "", metaN = null, headerIdx = -1;

    rows.forEach((r, idx) => {
      const key = (r[0] || "").trim().toLowerCase();
      if (key === "test name") name = (r[1] || "").trim();
      else if (key === "questions") metaN = parseInt(r[1], 10);
      else if (key === "student" && headerIdx === -1) headerIdx = idx;
    });

    if (headerIdx === -1) throw new Error('no "Student" header row found.');

    const header = rows[headerIdx].map((h) => (h || "").trim().toLowerCase());
    const doneCol = header.indexOf("done");
    let qCount;
    if (metaN && !isNaN(metaN) && metaN > 0) qCount = metaN;
    else if (doneCol > 1) qCount = doneCol - 1; // columns between Student and Done
    else qCount = header.length - 1 - (header[header.length - 1] === "score" ? 1 : 0);
    qCount = Math.max(1, qCount);

    const roster = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const sName = (r[0] || "").trim();
      if (!sName && r.every((c) => !(c || "").trim())) continue; // skip blank lines
      if (!sName) continue;
      const marks = [];
      for (let q = 0; q < qCount; q++) marks.push(mapMark(r[q + 1]));
      const done = doneCol >= 0 ? mapDone(r[doneCol]) : marks.every((m) => m !== "none");
      roster.push({ name: sName, marks, done });
    }

    if (!roster.length) throw new Error("no student rows found.");

    // Create a NEW test from the imported file and switch to it.
    const t = {
      id: genId(),
      name: name || "Imported test",
      numQuestions: qCount,
      students: roster,
      pinnedIndex: null,
      sheetCollapsed: false,
    };
    syncCurrentTest();
    tests.push(t);
    currentTestId = t.id;
    loadTestIntoGlobals(t);
    switchTab("grade");
    persist();
  }

  // -------------------------------------------------------------------------
  // Print PDF — one-page portrait report of the Live Analysis page
  // -------------------------------------------------------------------------
  function hexToRgb(hex) {
    const m = hex.replace("#", "");
    return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  }

  function dateStr() {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Rasterize an inline <svg> to a PNG data URL for embedding in the PDF.
  function svgToPng(svgEl, scale) {
    return new Promise((resolve, reject) => {
      const vb = svgEl.viewBox.baseVal;
      const w = vb && vb.width ? vb.width : svgEl.clientWidth || 300;
      const h = vb && vb.height ? vb.height : svgEl.clientHeight || 200;
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("width", w);
      clone.setAttribute("height", h);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const xml = new XMLSerializer().serializeToString(clone);
      const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ url: canvas.toDataURL("image/png"), w, h });
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  async function printPdf() {
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFCtor) { alert("PDF library failed to load."); return; }

    const btn = els.printPdfBtn;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generating…";
    try {
      const pie = await svgToPng(els.scorePie, 3);
      const bar = await svgToPng(els.questionBars, 3);

      const doc = new jsPDFCtor({ unit: "pt", format: "letter", orientation: "portrait" });
      const PW = 612, M = 40, CW = PW - M * 2;
      const INK = [31, 39, 51], MUT = [120, 120, 120];
      let y = M;

      // Header
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(59, 108, 255);
      doc.text("LIVE ANALYSIS", M, y + 4);
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUT);
      doc.text("Printed " + dateStr(), PW - M, y + 4, { align: "right" });
      y += 24;
      doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...INK);
      doc.text(els.analysisTitle.textContent || "Untitled test", M, y);
      y += 12;
      doc.setDrawColor(226, 231, 239).line(M, y, PW - M, y);
      y += 20;

      // Stat cards (3 per row)
      const cards = Array.from(els.statCards.children).map((c) => ({
        num: c.querySelector(".num").textContent,
        lbl: c.querySelector(".lbl").textContent,
      }));
      const colW = CW / 3;
      cards.forEach((c, i) => {
        const cx = M + (i % 3) * colW;
        const cy = y + Math.floor(i / 3) * 40;
        doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INK);
        doc.text(c.num, cx, cy + 12);
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUT);
        doc.text(c.lbl, cx, cy + 24);
      });
      y += Math.ceil(cards.length / 3) * 40 + 10;

      // Charts: pie left, bar right
      const chartTop = y;
      const pieW = 150;
      const pieH = pieW * (pie.h / pie.w);
      doc.addImage(pie.url, "PNG", M, chartTop, pieW, pieH);
      const barX = M + pieW + 20;
      const barW = CW - pieW - 20;
      const barH = barW * (bar.h / bar.w);
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK);
      doc.text("% correct by question", barX, chartTop + 8);
      doc.addImage(bar.url, "PNG", barX, chartTop + 14, barW, barH);

      // Pie legend under the pie
      let ly = chartTop + pieH + 16;
      const legendColors = ["#1f9d55", "#e0a400", "#d83a3a"];
      Array.from(els.pieLegend.children).forEach((li, i) => {
        const lbl = li.children[1] ? li.children[1].textContent : li.textContent;
        const cnt = li.querySelector(".lg-count") ? li.querySelector(".lg-count").textContent : "";
        const rgb = hexToRgb(legendColors[i] || "#999999");
        doc.setFillColor(...rgb).rect(M, ly - 7, 9, 9, "F");
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...INK);
        doc.text(`${lbl}  —  ${cnt}`, M + 14, ly);
        ly += 15;
      });

      y = Math.max(ly, chartTop + 14 + barH) + 16;

      // Section helper
      const listText = (el) => Array.from(el.children).map((n) => n.textContent.replace(/\s+/g, " ").trim());
      const section = (x, yy, w, title, lines) => {
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK);
        doc.text(title, x, yy);
        yy += 14;
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60, 60, 60);
        (lines.length ? lines : ["—"]).forEach((line) => {
          const wrapped = doc.splitTextToSize(line, w);
          doc.text(wrapped, x, yy);
          yy += wrapped.length * 11 + 2;
        });
        return yy;
      };

      // Hardest / Easiest
      const col2 = (CW - 20) / 2;
      let yL = section(M, y, col2, "Hardest questions", listText(els.hardestList));
      let yR = section(M + col2 + 20, y, col2, "Easiest questions", listText(els.easiestList));
      y = Math.max(yL, yR) + 12;

      // Highlights (full width)
      y = section(M, y, CW, "Highlights", listText(els.insightStrip)) + 12;

      // Top performers / Needs attention
      yL = section(M, y, col2, "Top performers", listText(els.topList));
      yR = section(M + col2 + 20, y, col2, "Students needing attention", listText(els.strugglingList));
      y = Math.max(yL, yR);

      const tName = getCurrentTest() ? getCurrentTest().name : "grading-export";
      const base = (tName || "grading-export").trim().replace(/[\\/:*?"<>|]/g, "-");
      const fname = `${base || "grading-export"} ${dateStr()} analysis.pdf`;
      doc.save(fname);
      try { window.open(doc.output("bloburl"), "_blank"); } catch (e) { /* popup blocked */ }
    } catch (e) {
      alert("Could not generate the PDF: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
})();
