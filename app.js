// ---------------------------------------------------------------------------
// Grading Helper
// Four-state cells: 'none' (did not participate) -> 'correct' -> 'wrong' -> 'half' (50%) -> 'none'
// ---------------------------------------------------------------------------

(function () {
  "use strict";

  const STATES = ["none", "correct", "wrong", "half"];
  const GLYPH = { none: "", correct: "✓", half: "/", wrong: "✗" };
  const STORE_KEY = "gradingHelper.session.v1";
  const SAMPLE_NAMES = [
    "Ada Lovelace", "Grace Hopper", "Katherine Johnson", "Alan Turing",
    "Margaret Hamilton", "Charles Babbage", "Dorothy Vaughan", "Linus Torvalds",
    "Hedy Lamarr", "Tim Berners-Lee", "Radia Perlman", "Dennis Ritchie",
    "Barbara Liskov", "John von Neumann", "Annie Easley",
  ];

  // Collection of tests. Each: { id, name, numQuestions, students }.
  // Pinned student + sheet-collapse are ephemeral UI state — never stored or persisted.
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

  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const longDate = (ms) => { const d = new Date(ms); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
  const shortDate = (ms) => { const d = new Date(ms); return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`; };
  const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

  // Bands + name matching, shared by Analysis, Compare and Student.
  const BANDS = ["notmeet", "nearly", "meets"]; // low -> high
  const BAND_LABEL = { meets: "Meets", nearly: "Nearly meets", notmeet: "Does not meet" };
  const BAND_COLOR = { meets: "#1f9d55", nearly: "#e0a400", notmeet: "#d83a3a" };
  const CMP_BEFORE_COLOR = "#b3c3e0", CMP_AFTER_COLOR = "#8b5fcf";
  const nameKey = (s) => String(s || "").trim().toLowerCase();

  // -------------------------------------------------------------------------
  // Test types (e.g. Math, Reading). The color belongs to the TYPE, not the
  // test: every test sharing a type shares one color.
  // -------------------------------------------------------------------------
  // The 12 colors offered by the Setup tab's color picker (also used, in order,
  // to auto-color new types). All dark enough for white chip text.
  const TYPE_PALETTE = [
    "#3b6cff", "#1f9d55", "#e0853a", "#8b5fcf", "#d9557f", "#0f9ba8",
    "#b07f00", "#5a6b7f", "#d83a3a", "#1e40af", "#8d5a3b", "#b8329e",
  ];
  const TYPE_PALETTE_NAMES = [
    "Blue", "Green", "Orange", "Purple", "Pink", "Teal",
    "Gold", "Slate", "Red", "Navy", "Brown", "Magenta",
  ];
  let typeColors = {};      // typeKey -> hex color (persisted)
  const typeKey = (s) => String(s || "").trim().toLowerCase();

  function typeKeyOf(t) { return typeKey(t && t.type); }
  function typeLabelOf(t) { return ((t && t.type) || "").trim(); }

  function typeColorOf(t) {            // null when untyped
    const k = typeKeyOf(t);
    if (!k) return null;
    if (!typeColors[k]) {
      // First palette color no other type is using (falls back to cycling).
      const used = Object.keys(typeColors).map((x) => typeColors[x]);
      typeColors[k] = TYPE_PALETTE.find((c) => used.indexOf(c) === -1) ||
        TYPE_PALETTE[Object.keys(typeColors).length % TYPE_PALETTE.length];
    }
    return typeColors[k];
  }

  // Drop colors for types no test uses any more. Keeps half-typed names
  // ("M", "Ma", "Mat"…) from claiming palette slots while the teacher types.
  function pruneTypeColors() {
    const live = {};
    tests.forEach((t) => { const k = typeKeyOf(t); if (k) live[k] = true; });
    Object.keys(typeColors).forEach((k) => { if (!live[k]) delete typeColors[k]; });
  }

  function typeChip(t, extraClass) {  // "" when untyped
    const c = typeColorOf(t);
    if (!c) return "";
    return `<span class="type-chip ${extraClass || ""}" style="--type-color:${c}">${escapeHtml(typeLabelOf(t))}</span>`;
  }

  // Distinct non-empty types across all tests: [{ key, label, color, count }], A→Z.
  function typeGroups() {
    const map = {}, list = [];
    tests.forEach((t) => {
      const k = typeKeyOf(t);
      if (!k) return;
      if (!map[k]) { map[k] = { key: k, label: typeLabelOf(t), color: typeColorOf(t), count: 0 }; list.push(map[k]); }
      map[k].count++;
    });
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }

  // Analysis tab: a single test, or every test of one type ("subject").
  let analysisMode = { kind: "test" }; // or { kind: "type", key, label }

  // Compare tab picks (ephemeral) + students hidden from "Top growth" per pair.
  let compareAId = null, compareBId = null;
  let hiddenGrowth = {};    // "<aId>|<bId>" -> [nameKey, ...] (persisted)

  // Student tab selection (a nameKey).
  let studentSelKey = null;

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
      "compareEmpty", "compareBody", "compareASelect", "compareBSelect", "compareSwapBtn",
      "compareTitle", "compareSame", "compareMain", "compareMinor", "compareBands", "compareBars",
      "bandNumbersToggle", "pieHalf", "chartOnlyToggle", "growthGrid", "growthFoot", "showHiddenBtn", "hiddenCount", "compareTables", "compareRows2",
      "compareBarsLegend", "compareDetails", "compareDetailsHeader", "compareInsights", "compareRows",
      "titleDate", "titleCreated", "testType", "testTypeColor", "typeColorMenu", "typeSuggestions", "sheetTitle",
      "studentSelect", "studentMeta", "studentEmpty", "studentPanel", "studentTitle", "studentCards", "studentGroups",
      "avgChipNum", "barTitle", "hardestTitle", "easiestTitle",
    ].forEach((id) => (els[id] = document.getElementById(id)));

    initTooltip();

    els.newTestBtn.addEventListener("click", createTest);
    els.clearBtn.addEventListener("click", clearSetupForm);
    els.clearMarksBtn.addEventListener("click", clearMarks);

    // Setup form fields live-edit the SELECTED test.
    els.testName.addEventListener("input", applyNameEdit);
    els.classList.addEventListener("input", applyClassListEdit);
    els.numQuestions.addEventListener("change", applyQuestionCountEdit);
    els.testType.addEventListener("input", applyTypeEdit);

    // Type color picker: a swatch button that opens a 12-color menu.
    els.typeColorMenu.innerHTML = TYPE_PALETTE.map((c, i) =>
      `<button type="button" class="color-option" role="menuitemradio" data-color="${c}" ` +
      `style="background:${c}" aria-label="${TYPE_PALETTE_NAMES[i]}" data-tip="${TYPE_PALETTE_NAMES[i]}"></button>`).join("");
    els.testTypeColor.addEventListener("click", (e) => {
      e.stopPropagation();
      if (els.typeColorMenu.hidden) openColorMenu(); else closeColorMenu();
    });
    els.typeColorMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      const opt = e.target.closest ? e.target.closest(".color-option") : null;
      if (!opt) return;
      applyTypeColorEdit(opt.getAttribute("data-color"));
      closeColorMenu();
      els.testTypeColor.focus();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.typeColorMenu.hidden) { closeColorMenu(); els.testTypeColor.focus(); }
    });

    // Test switcher dropdowns (Setup + Grade + Analysis stay in sync)
    els.setupTestSelect.addEventListener("change", (e) => switchTest(e.target.value));
    els.gradeTestSelect.addEventListener("change", (e) => switchTest(e.target.value));
    // The Analysis dropdown also lists subjects ("type:<key>"). Picking a subject
    // never changes the current test — Setup and Grade keep showing it.
    els.analysisTestSelect.addEventListener("change", (e) => {
      const v = e.target.value;
      if (v.indexOf("type:") === 0) {
        const key = v.slice(5);
        const g = typeGroups().find((x) => x.key === key);
        analysisMode = { kind: "type", key: key, label: g ? g.label : key };
        renderAnalysis();
      } else {
        analysisMode = { kind: "test" };
        if (v === currentTestId) renderAnalysis();
        else switchTest(v);
      }
    });
    els.deleteTestBtn.addEventListener("click", deleteTest);

    // Compare tab (read-only; its picks are ephemeral and never saved)
    els.compareASelect.addEventListener("change", (e) => { compareAId = e.target.value; renderCompare(); });
    els.compareBSelect.addEventListener("change", (e) => { compareBId = e.target.value; renderCompare(); });
    els.compareSwapBtn.addEventListener("click", () => {
      const a = compareAId; compareAId = compareBId; compareBId = a;
      renderCompare();
    });
    els.compareDetailsHeader.addEventListener("click", () =>
      els.compareDetails.classList.toggle("collapsed"));
    // "Where students landed": counts are hidden unless "Show numbers" is ticked.
    // Not saved, so it's always off when the app opens.
    els.bandNumbersToggle.addEventListener("change", () =>
      els.compareBands.classList.toggle("show-numbers", els.bandNumbersToggle.checked));
    // Top growth: × hides a student for this Before/After pair; Show Hidden restores.
    els.growthGrid.addEventListener("click", (e) => {
      const x = e.target.closest ? e.target.closest(".growth-x") : null;
      if (!x) return;
      const pair = compareAId + "|" + compareBId;
      (hiddenGrowth[pair] = hiddenGrowth[pair] || []).push(x.getAttribute("data-key"));
      persist();
      renderCompare();
    });
    els.showHiddenBtn.addEventListener("click", () => {
      hiddenGrowth[compareAId + "|" + compareBId] = [];
      persist();
      renderCompare();
    });

    // Student tab (read-only)
    els.studentSelect.addEventListener("change", (e) => {
      studentSelKey = e.target.value;
      renderStudentTab();
      persist();
    });
    els.studentGroups.addEventListener("click", (e) => {
      const link = e.target.closest ? e.target.closest("[data-open-test]") : null;
      if (!link) return;
      switchTest(link.getAttribute("data-open-test"));
      switchTab("grade");
    });

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
    // Analysis pie: "Chart only" hides the key (and its numbers) and shows the
    // pie large and centered. Not saved, so it's always off when the app opens.
    els.chartOnlyToggle.addEventListener("change", () =>
      els.pieHalf.classList.toggle("chart-only", els.chartOnlyToggle.checked));
    els.pinnedName.addEventListener("click", unpinStudent);
    els.pinStudentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menuIndex != null) pinStudent(menuIndex);
      closeNameMenu();
    });
    // Click anywhere else closes the name menu and the color menu.
    document.addEventListener("click", () => { closeNameMenu(); closeColorMenu(); });

    // Today's date, written out, on the title line (re-read every minute so it
    // rolls over at midnight without a refresh).
    renderTitleDate();
    setInterval(renderTitleDate, 60 * 1000);

    // Resume the last session if one was cached; otherwise seed a sample test.
    if (!restoreSession()) seedDefaultTest();

    // Snap the ruled-line grid so the first line lands on the red tab shelf.
    alignPaperLines();
    window.addEventListener("resize", alignPaperLines);
    window.addEventListener("resize", fitCompareTitle);
    window.addEventListener("load", alignPaperLines);
  });

  // Position the lined-paper background so ruled lines begin exactly at the
  // bottom of the tab bar (the red shelf) — blank paper above, lines below.
  function alignPaperLines() {
    const tabs = document.querySelector(".tabs");
    if (!tabs) return;
    const y = Math.round(tabs.getBoundingClientRect().bottom + window.scrollY);
    document.documentElement.style.setProperty("--line-start", y + "px");
  }

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

  // Title corner: today's date, plus when the selected test was created.
  function renderTitleDate() {
    if (els.titleDate) els.titleDate.textContent = longDate(Date.now());
    if (!els.titleCreated) return;
    const t = getCurrentTest();
    if (!t) { els.titleCreated.innerHTML = ""; return; }
    const when = t.createdAt != null ? longDate(t.createdAt) : "— unknown";
    els.titleCreated.innerHTML = `Test created ${when} ${typeChip(t, "chip-sm")}`;
  }

  function syncTestTitle() {
    if (analysisMode.kind === "type") return; // subject view owns the title
    const t = getCurrentTest();
    els.analysisTitle.innerHTML =
      escapeHtml((t && t.name) ? t.name : "Untitled test") + " " + typeChip(t, "title-chip");
  }

  function switchTab(name) {
    // Leaving the Grade tab clears the (ephemeral) pinned student.
    if (name !== "grade" && pinnedIndex != null) {
      pinnedIndex = null;
      els.pinnedPanel.hidden = true;
      sheetCollapsed = false;
      applySheetCollapsed();
    }
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-pane").forEach((p) =>
      p.classList.toggle("active", p.dataset.pane === name));
    els.growthFoot.hidden = true; // only renderCompare() reveals it, on the Compare tab
    if (name === "compare") renderCompare();
    if (name === "student") renderStudentTab();
    persist();
  }

  // Keep the Student tab current if it's showing when data changes.
  function refreshStudentTabIfActive() {
    if (document.querySelector('.tab-pane[data-pane="student"].active')) renderStudentTab();
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
        marks: marks.map((m) => (m === "correct" || m === "wrong" || m === "half" ? m : "none")),
        done: !!s.done,
      };
    });
    const id = t.id || genId();
    // Old caches have no createdAt — recover it from the id ("t<N>_<epoch ms>").
    let createdAt = Number.isFinite(t.createdAt) ? t.createdAt : parseInt(String(id).split("_")[1], 10);
    if (!Number.isFinite(createdAt)) createdAt = null;
    return {
      id: id,
      name: t.name || "Untitled test",
      numQuestions: nq,
      students: studs,
      createdAt: createdAt,
      type: String(t.type || ""),
    };
  }

  function persist() {
    try {
      syncCurrentTest();
      pruneTypeColors();
      // Forget hidden-growth lists for Before/After pairs whose tests are gone.
      Object.keys(hiddenGrowth).forEach((pair) => {
        const ids = pair.split("|");
        if (!hiddenGrowth[pair].length || !ids.every((id) => tests.some((t) => t.id === id))) delete hiddenGrowth[pair];
      });
      const activeTabEl = document.querySelector(".tab.active");
      const state = {
        v: 3,
        tests: tests.map((t) => ({
          id: t.id, name: t.name, numQuestions: t.numQuestions, createdAt: t.createdAt, type: t.type || "",
          students: t.students.map((s) => ({ name: s.name, marks: s.marks.slice(), done: !!s.done })),
        })),
        currentTestId: currentTestId,
        activeTab: activeTabEl ? activeTabEl.dataset.tab : "setup",
        detailsCollapsed: detailsCollapsed,
        typeColors: typeColors,
        analysisMode: analysisMode,
        hiddenGrowth: hiddenGrowth,
        studentSelKey: studentSelKey,
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
        students: state.students,
      });
      tests = [t];
      currentTestId = t.id;
    } else {
      return false; // nothing usable — caller seeds a default test
    }

    // Collection-level state (v3+); older caches simply get the defaults.
    typeColors = {};
    if (state.typeColors && typeof state.typeColors === "object") {
      Object.keys(state.typeColors).forEach((k) => {
        const c = state.typeColors[k];
        if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)) typeColors[typeKey(k)] = c;
      });
    }
    const am = state.analysisMode;
    analysisMode = am && am.kind === "type" && typeof am.key === "string"
      ? { kind: "type", key: am.key, label: String(am.label || am.key) }
      : { kind: "test" };
    hiddenGrowth = {};
    if (state.hiddenGrowth && typeof state.hiddenGrowth === "object") {
      Object.keys(state.hiddenGrowth).forEach((pair) => {
        if (Array.isArray(state.hiddenGrowth[pair])) hiddenGrowth[pair] = state.hiddenGrowth[pair].map(String);
      });
    }
    studentSelKey = typeof state.studentSelKey === "string" ? state.studentSelKey : null;

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

  function makeTest(name, nq, names, type) {
    const q = Math.max(1, Math.min(100, nq || 1));
    return {
      id: genId(),
      name: (name || "Untitled test").trim() || "Untitled test",
      type: String(type || ""),
      numQuestions: q,
      students: names.map((n) => ({ name: n, marks: new Array(q).fill("none"), done: false })),
      createdAt: Date.now(),
      pinnedIndex: null,
      sheetCollapsed: false,
    };
  }

  function getCurrentTest() {
    return tests.find((t) => t.id === currentTestId) || null;
  }

  // Write the live working globals back into the current test object.
  // Pin/collapse are intentionally NOT stored — they're ephemeral UI state.
  function syncCurrentTest() {
    const t = getCurrentTest();
    if (!t) return;
    t.students = students;
    t.numQuestions = numQuestions;
  }

  // Point the working globals at a test and render the whole UI for it.
  function loadTestIntoGlobals(t) {
    students = t.students;
    numQuestions = t.numQuestions;
    pinnedIndex = null;       // pin never carries across tests
    sheetCollapsed = false;
    // Mirror the test into the Setup editor form.
    els.testName.value = t.name;
    els.numQuestions.value = t.numQuestions;
    els.classList.value = t.students.map((s) => s.name).join("\n");
    els.testType.value = t.type || "";
    syncTypeColorInput();
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
    applyTypeAccents();
    refreshStudentTabIfActive();
  }

  // Append "(n)" when several tests share the same name, to tell them apart.
  function disambiguatedName(t) {
    const nm = t.name || "Untitled";
    const same = tests.filter((x) => (x.name || "Untitled") === nm);
    return same.length <= 1 ? nm : `${nm} (${same.indexOf(t) + 1})`;
  }

  // One <option> for a test; typed tests get a colored "●" (the dot carries the
  // color even in browsers that ignore <option> styling). Untyped options get an
  // explicit ink color, or they'd inherit the tint tintSelect() puts on the <select>.
  const OPTION_INK = "#1f2733";
  function testOptionHtml(t) {
    const color = typeColorOf(t);
    const label = escapeHtml(disambiguatedName(t));
    return color
      ? `<option value="${t.id}" style="color:${color}" data-color="${color}">● ${label}</option>`
      : `<option value="${t.id}" style="color:${OPTION_INK}">${label}</option>`;
  }

  // Tint a <select> with the type color of the test (or subject) it shows.
  function tintSelect(sel, t) {
    const color = typeColorOf(t);
    sel.style.borderLeft = color ? "5px solid " + color : "";
    sel.style.color = color || "";
  }

  function renderTestOptions() {
    const opts = tests.map(testOptionHtml).join("");
    const cur = getCurrentTest();
    [els.setupTestSelect, els.gradeTestSelect].forEach((sel) => {
      sel.innerHTML = opts;
      sel.value = currentTestId;
      tintSelect(sel, cur);
    });

    // Analysis: Tests, plus Subjects (all tests of a type) when any test has a type.
    validateAnalysisMode();
    const groups = typeGroups();
    const sel = els.analysisTestSelect;
    sel.innerHTML = `<optgroup label="Tests" style="color:${OPTION_INK}">${opts}</optgroup>` + (groups.length
      ? `<optgroup label="Subjects (all tests of a type)" style="color:${OPTION_INK}">` + groups.map((g) =>
        `<option value="type:${escapeHtml(g.key)}" style="color:${g.color}" data-color="${g.color}">` +
        `● ${escapeHtml(g.label)} — ${g.count} test${g.count !== 1 ? "s" : ""}</option>`).join("") + "</optgroup>"
      : "");
    if (analysisMode.kind === "type") {
      sel.value = "type:" + analysisMode.key;
      tintSelect(sel, { type: analysisMode.key });
    } else {
      sel.value = currentTestId;
      tintSelect(sel, cur);
    }
    // Suggest existing types so spellings stay consistent.
    els.typeSuggestions.innerHTML = typeGroups()
      .map((g) => `<option value="${escapeHtml(g.label)}"></option>`).join("");
  }

  // Put the selected test's type color everywhere that test is referenced.
  function applyTypeAccents() {
    const t = getCurrentTest();
    const color = typeColorOf(t);
    if (color) document.documentElement.style.setProperty("--test-accent", color);
    else document.documentElement.style.removeProperty("--test-accent");
    els.sheetTitle.innerHTML = "Class sheet " + typeChip(t);
    renderTitleDate();
    syncTestTitle();
  }

  // Mirror the selected test's type color into the color picker.
  function syncTypeColorInput() {
    const t = getCurrentTest();
    const color = typeColorOf(t);
    els.testTypeColor.style.background = color || "#aab2bf";
    els.testTypeColor.disabled = !color;
    if (!color) closeColorMenu();
    els.typeColorMenu.querySelectorAll(".color-option").forEach((b) => {
      const on = color != null && b.getAttribute("data-color").toLowerCase() === color.toLowerCase();
      b.classList.toggle("selected", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function openColorMenu() {
    if (els.testTypeColor.disabled) return;
    els.typeColorMenu.hidden = false;
    els.testTypeColor.setAttribute("aria-expanded", "true");
  }

  function closeColorMenu() {
    els.typeColorMenu.hidden = true;
    els.testTypeColor.setAttribute("aria-expanded", "false");
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
    syncCurrentTest();
    // Carry the roster, question count and type over from the current test.
    const prev = getCurrentTest();
    const names = prev ? prev.students.map((s) => s.name) : [];
    const nq = prev ? prev.numQuestions : Math.max(1, Math.min(100, parseInt(els.numQuestions.value, 10) || 10));
    const t = makeTest("New Test", nq, names, prev ? prev.type : "");
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
    if (analysisMode.kind === "type") updateAnalysis(); // bar labels use test names
    else syncTestTitle();
    refreshStudentTabIfActive();
    persist();
  }

  function applyTypeEdit() {
    const t = getCurrentTest();
    if (!t) return;
    t.type = els.testType.value;
    pruneTypeColors(); // before picking a color, so half-typed names don't hold one
    syncTypeColorInput();
    updateAnalysis();  // subject membership may have changed
    renderTestOptions();
    applyTypeAccents();
    persist();
  }

  // Recolors every test of the current test's type.
  function applyTypeColorEdit(color) {
    const t = getCurrentTest();
    if (!t || !typeKeyOf(t)) return;
    typeColors[typeKeyOf(t)] = color;
    syncTypeColorInput();
    if (analysisMode.kind === "type") updateAnalysis();
    renderTestOptions();
    applyTypeAccents();
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
    refreshStudentTabIfActive();
    persist();
  }

  function applyQuestionCountEdit() {
    const t = getCurrentTest();
    if (!t) return;
    const nq = Math.max(1, Math.min(100, parseInt(els.numQuestions.value, 10) || 1));
    if (nq === numQuestions) return;
    if (nq < numQuestions) {
      // Only warn if shrinking would actually discard marked (non-blank) cells.
      const losesData = students.some((s) =>
        s.marks.slice(nq).some((m) => m !== "none"));
      if (losesData &&
          !window.confirm(`Reduce to ${nq} questions? Existing marks for questions ${nq + 1}–${numQuestions} will be removed.`)) {
        els.numQuestions.value = numQuestions;
        return;
      }
    }
    numQuestions = nq;
    t.numQuestions = nq;
    students.forEach((s) => {
      if (s.marks.length > nq) s.marks = s.marks.slice(0, nq);
      while (s.marks.length < nq) s.marks.push("none");
      // Re-run auto-done: a row is Done iff every remaining question is marked.
      s.done = s.marks.every((m) => m !== "none");
    });
    renderHead();
    renderBody();
    if (pinnedIndex != null) renderPinned();
    updateAnalysis();
    persist();
  }

  // The Setup-tab "Clear" button empties the selected test's name, type and roster.
  function clearSetupForm() {
    if (!getCurrentTest()) return;
    if (students.length && !window.confirm("Clear this test's name, type and class list?")) return;
    els.testName.value = "";
    els.testType.value = "";
    els.classList.value = "";
    applyNameEdit();
    applyTypeEdit();
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
    refreshStudentTabIfActive();
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

  // Score = credit / attempted, where "/" (half) is worth 0.5 and attempted = correct + half + wrong.
  function studentStats(stu) {
    let correct = 0, wrong = 0, half = 0;
    stu.marks.forEach((m) => {
      if (m === "correct") correct++;
      else if (m === "wrong") wrong++;
      else if (m === "half") half++;
    });
    const attempted = correct + half + wrong;
    const credit = correct + 0.5 * half;
    const pct = attempted ? Math.round((credit / attempted) * 100) : null;
    return { correct, wrong, half, attempted, pct };
  }

  function refreshScores() {
    const rows = els.gradeBody.children;
    students.forEach((stu, r) => {
      const { correct, wrong, half, attempted, pct } = studentStats(stu);
      const pill = rows[r].querySelector(".score-pill");
      pill.textContent = attempted ? `${pct}%` : "—";
      const parts = [`${correct} correct`];
      if (half) parts.push(`${half} half`);
      parts.push(`${wrong} wrong`);
      pill.setAttribute("data-tip", parts.join(", "));
    });
  }

  function renderFoot() {
    let html = '<tr><td class="name-col">Class % correct</td>';
    for (let q = 0; q < numQuestions; q++) {
      let correct = 0, half = 0, attempted = 0;
      students.forEach((stu) => {
        if (stu.marks[q] === "correct") { correct++; attempted++; }
        else if (stu.marks[q] === "half") { half++; attempted++; }
        else if (stu.marks[q] === "wrong") attempted++;
      });
      const pct = attempted ? Math.round(((correct + 0.5 * half) / attempted) * 100) : null;
      html += `<td>${pct === null ? "—" : pct + "%"}</td>`;
    }
    html += "<td></td><td></td></tr>";
    els.gradeFoot.innerHTML = html;
  }

  // A subject view whose type no longer exists falls back to the single test.
  function validateAnalysisMode() {
    if (analysisMode.kind === "type" && !tests.some((t) => typeKeyOf(t) === analysisMode.key)) {
      analysisMode = { kind: "test" };
    }
  }

  function updateAnalysis() {
    validateAnalysisMode();
    if (analysisMode.kind === "type") updateAnalysisForType(analysisMode.key);
    else updateAnalysisForTest();
  }

  // Re-render the Analysis tab after its dropdown changes mode.
  function renderAnalysis() {
    updateAnalysis();
    renderTestOptions();
    persist();
  }

  function updateAnalysisForTest() {
    // Single-test view: reset anything the subject view relabels.
    els.analysisPanel.style.removeProperty("--test-accent");
    els.hardestTitle.textContent = "Hardest questions";
    els.easiestTitle.textContent = "Easiest questions";
    syncTestTitle();

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
      let correct = 0, half = 0, attempted = 0;
      students.forEach((stu) => {
        if (stu.marks[q] === "correct") { correct++; attempted++; }
        else if (stu.marks[q] === "half") { half++; attempted++; }
        else if (stu.marks[q] === "wrong") attempted++;
      });
      perQuestion.push({
        q: q + 1, correct, half, attempted,
        blanks: students.length - attempted,
        pct: attempted ? Math.round(((correct + 0.5 * half) / attempted) * 100) : null,
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
      card(n ? `${meetsCount}/${n} <span class="num-sub">${Math.round((meetsCount / n) * 100)}%</span>` : "—",
        "Students Meeting",
        "Students at or above 70%"),
      card(`${fullyDone}/${students.length}`, "Graded", "Rows marked Done"),
    ].join("");
    els.avgChipNum.textContent = pc(meanPct);

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
    // Half-credit ("/") awareness
    const totalHalf = perQuestion.reduce((a, q) => a + q.half, 0);
    if (totalHalf > 0) {
      const topHalfQ = perQuestion.filter((q) => q.half > 0).sort((a, b) => b.half - a.half)[0];
      const halfNames = namesWhere((s) => s.marks[topHalfQ.q - 1] === "half");
      ins.push({ tone: "warn",
        text: `${totalHalf} half-credit mark${totalHalf !== 1 ? "s" : ""} given; most on Q${topHalfQ.q} (${topHalfQ.half}).`,
        tip: `Half credit on Q${topHalfQ.q}: ${joinNames(halfNames)}` });

      // Whole-class partial: a question everyone who answered got half on.
      const allHalf = perQuestion.filter((q) => q.attempted > 0 && q.half === q.attempted);
      if (allHalf.length) ins.push({ tone: "info",
        text: `Everyone got partial credit on Q${allHalf.map((q) => q.q).join(", Q")}.`,
        tip: `All answers were half credit: ${allHalf.map((q) => "Q" + q.q).join(", ")}` });

      // Students leaning on partial credit.
      const perStudentHalf = students.map((s) => ({ name: s.name, half: s.marks.filter((m) => m === "half").length }));
      const maxHalf = Math.max.apply(null, perStudentHalf.map((s) => s.half));
      if (maxHalf >= 2) {
        const tied = perStudentHalf.filter((s) => s.half === maxHalf).map((s) => s.name);
        ins.push({ tone: "info",
          text: `Most partial answers: ${tied.length > 1 ? tied.length + " students" : escapeHtml(tied[0])} with ${maxHalf} half marks.`,
          tip: `${maxHalf} half marks: ${joinNames(tied)}` });
      }
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

  // -------------------------------------------------------------------------
  // Subject view — every test of one type, oldest first. Fills the same DOM
  // slots as the single-test view so the layout and Print PDF keep working.
  // -------------------------------------------------------------------------
  function updateAnalysisForType(key) {
    const group = tests.filter((t) => typeKeyOf(t) === key).sort(byCreated);
    const label = typeLabelOf(group[0]);
    const color = typeColorOf(group[0]);
    const sums = group.map((t) => ({ t: t, S: summarizeTest(t) }));
    const testName = (t) => t.name || "Untitled test";

    els.analysisPanel.style.setProperty("--test-accent", color);
    els.analysisTitle.innerHTML = `${escapeHtml(label)} ${typeChip(group[0], "title-chip")} ` +
      `<span class="meta title-meta">${group.length} test${group.length !== 1 ? "s" : ""}</span>`;
    els.hardestTitle.textContent = "Lowest-average tests";
    els.easiestTitle.textContent = "Highest-average tests";

    // ---- per-student aggregate across the subject (matched by name) ----
    const byKey = {}, order = [];
    sums.forEach(({ S }) => {
      S.perStudent.forEach((s) => {
        const k = nameKey(s.name);
        if (S.byName[k] !== s) return; // first roster match per test only
        if (!byKey[k]) { byKey[k] = { name: s.name, pcts: [], testsTaken: 0 }; order.push(k); }
        byKey[k].testsTaken++;
        if (s.attempted > 0) byKey[k].pcts.push(s.pct); // date order (group is sorted)
      });
    });
    const people = order.map((k) => {
      const p = byKey[k];
      const n = p.pcts.length;
      return {
        name: p.name, testsTaken: p.testsTaken, graded: n,
        avgPct: n ? Math.round(p.pcts.reduce((a, b) => a + b, 0) / n) : null,
        first: n ? p.pcts[0] : null, last: n ? p.pcts[n - 1] : null,
      };
    });
    const gradedPeople = people.filter((p) => p.graded > 0);
    const avgs = gradedPeople.map((p) => p.avgPct);
    const n = avgs.length;
    const meanPct = n ? Math.round(avgs.reduce((a, b) => a + b, 0) / n) : null;
    const meets = gradedPeople.filter((p) => p.avgPct >= 70);
    const nearly = gradedPeople.filter((p) => p.avgPct >= 51 && p.avgPct < 70);
    const notMeet = gradedPeople.filter((p) => p.avgPct <= 50);

    // ---- stat cards + hero chip ----
    const pc = (v) => (v == null ? "—" : v + "%");
    els.statCards.innerHTML = [
      card(people.length, "Students", "Unique students across these tests"),
      card(group.length, "Tests"),
      card(pc(meanPct), "Class average", "Mean of each student's subject average"),
      card(n ? Math.min.apply(null, avgs) + "–" + Math.max.apply(null, avgs) + "%" : "—", "Range",
        "Lowest to highest student average"),
      card(n ? `${meets.length}/${n} <span class="num-sub">${Math.round((meets.length / n) * 100)}%</span>` : "—",
        "Students Meeting", "Students averaging 70% or more"),
      card(`${n}/${people.length}`, "Graded", "Students with at least one graded test"),
    ].join("");
    els.avgChipNum.textContent = pc(meanPct);

    // ---- highlights ----
    const joinNames = (arr) => (arr.length ? arr.join(", ") : "(none)");
    const names = (arr) => arr.map((p) => p.name);
    const ins = [];
    if (meanPct != null) ins.push({ tone: "info",
      text: `${escapeHtml(label)} average: ${meanPct}% across ${group.length} test${group.length !== 1 ? "s" : ""}.`,
      tip: group.map((t, i) => `${testName(t)}: ${pc(sums[i].S.mean)}`).join("\n") });
    if (n) ins.push({ tone: notMeet.length > meets.length ? "warn" : "good",
      text: `By average: ${meets.length} meet, ${nearly.length} nearly, ${notMeet.length} do not meet (of ${n}).`,
      tip: `Meets: ${joinNames(names(meets))}\nNearly: ${joinNames(names(nearly))}\nDoes not meet: ${joinNames(names(notMeet))}` });

    const gradedTests = sums.filter((x) => x.S.mean != null);
    if (gradedTests.length) {
      const best = gradedTests.slice().sort((a, b) => b.S.mean - a.S.mean)[0];
      const low = gradedTests.slice().sort((a, b) => a.S.mean - b.S.mean)[0];
      ins.push({ tone: "good", text: `Highest-average test: ${escapeHtml(testName(best.t))} (${best.S.mean}%).` });
      if (gradedTests.length > 1) ins.push({ tone: low.S.mean <= 50 ? "bad" : "warn",
        text: `Lowest-average test: ${escapeHtml(testName(low.t))} (${low.S.mean}%).` });
    }
    if (gradedTests.length >= 2) {
      const a = gradedTests[0].S.mean, b = gradedTests[gradedTests.length - 1].S.mean, d = b - a;
      ins.push({ tone: d > 0 ? "good" : d < 0 ? "bad" : "info",
        text: d === 0 ? `Class average held steady at ${b}% from first to latest test.`
          : `Class average ${d > 0 ? "rose" : "fell"} ${Math.abs(d)} points from first to latest test (${a}% → ${b}%).`,
        tip: `${testName(gradedTests[0].t)} → ${testName(gradedTests[gradedTests.length - 1].t)}` });
    }
    const moved = gradedPeople.filter((p) => p.graded >= 2).map((p) => ({ name: p.name, d: p.last - p.first }));
    const gains = moved.filter((p) => p.d > 0).sort((x, y) => y.d - x.d);
    const drops = moved.filter((p) => p.d < 0).sort((x, y) => x.d - y.d);
    if (gains.length) ins.push({ tone: "good",
      text: `Most improved (first → latest): ${gains.slice(0, 3).map((p) => `${escapeHtml(p.name)} (+${p.d})`).join(", ")}.`,
      tip: gains.map((p) => `${p.name} +${p.d}`).join("\n") });
    if (drops.length) ins.push({ tone: "warn",
      text: `Dropped most (first → latest): ${drops.slice(0, 3).map((p) => `${escapeHtml(p.name)} (−${-p.d})`).join(", ")}.`,
      tip: drops.map((p) => `${p.name} −${-p.d}`).join("\n") });
    const partial = people.filter((p) => p.testsTaken < group.length);
    if (partial.length) ins.push({ tone: "info",
      text: `${partial.length} student${partial.length !== 1 ? "s are" : " is"} on only some of the tests.`,
      tip: partial.map((p) => `${p.name} (${p.testsTaken} of ${group.length})`).join("\n") });
    const unfinished = group.filter((t) => t.students.some((s) => !s.done));
    if (unfinished.length) ins.push({ tone: "warn",
      text: `${unfinished.length} test${unfinished.length !== 1 ? "s" : ""} not yet fully graded.`,
      tip: `Not fully graded: ${joinNames(unfinished.map(testName))}` });

    els.insightStrip.innerHTML = ins.length
      ? ins.map((i) => `<div class="insight tone-${i.tone}" data-tip="${escapeHtml(i.tip || "")}">${i.text}</div>`).join("")
      : '<div class="insight tone-info">Start grading to see insights.</div>';

    // ---- charts: pie by subject average; one bar per test (date order) ----
    renderScorePie(gradedPeople.map((p) => ({ name: p.name, pct: p.avgPct, done: true, attempted: 1 })));
    const short = (s) => (s.length > 8 ? s.slice(0, 7) + "…" : s);
    renderQuestionBars(sums.map((x) => ({ pct: x.S.mean })), {
      title: "Class average by test",
      labels: sums.map((x) => short(testName(x.t))),
      tips: sums.map((x) => `${testName(x.t)}: ${x.S.mean == null ? "not graded" : x.S.mean + "% class average"}`),
    });

    // ---- lowest / highest-average tests ----
    const tLi = (x) => `<li>${escapeHtml(testName(x.t))} <span class="meta">${x.S.mean}% (${x.S.n} graded)</span></li>`;
    els.hardestList.innerHTML =
      gradedTests.slice().sort((a, b) => a.S.mean - b.S.mean).slice(0, 3).map(tLi).join("") ||
      '<li class="meta">No tests graded yet.</li>';
    els.easiestList.innerHTML =
      gradedTests.slice().sort((a, b) => b.S.mean - a.S.mean).slice(0, 3).map(tLi).join("") ||
      '<li class="meta">No tests graded yet.</li>';

    // ---- top performers / needs attention, by subject average ----
    const pLi = (p) => `<li>${escapeHtml(p.name)} <span class="meta">avg ${p.avgPct}% over ${p.graded} test${p.graded !== 1 ? "s" : ""}</span></li>`;
    els.topList.innerHTML =
      gradedPeople.slice().sort((a, b) => b.avgPct - a.avgPct).slice(0, 5).map(pLi).join("") ||
      '<li class="meta">No students graded yet.</li>';
    els.strugglingList.innerHTML =
      gradedPeople.slice().sort((a, b) => a.avgPct - b.avgPct).slice(0, 5).map(pLi).join("") ||
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

  // items: [{ q, pct, correct, attempted }] (one per question), or anything with
  // a `pct` when opts.labels/opts.tips are given (the subject view: one bar per test).
  // opts.title sets the heading above the chart.
  function renderQuestionBars(perQuestion, opts) {
    opts = opts || {};
    els.barTitle.textContent = opts.title || "% correct by question";
    const vb = els.questionBars.viewBox.baseVal;
    const W = vb && vb.width ? vb.width : 340, H = vb && vb.height ? vb.height : 170;
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
    // Text labels (test names) need more room than question numbers.
    const labelEvery = opts.labels
      ? Math.max(1, Math.ceil(n * 40 / plotW))
      : (n <= 20 ? 1 : Math.ceil(n / 15));

    perQuestion.forEach((s, i) => {
      const cx = m.left + slot * (i + 0.5);
      const x = cx - bw / 2;
      const pct = s.pct == null ? 0 : s.pct;
      const h = plotH * (pct / 100);
      const top = m.top + plotH - h;
      const title = opts.tips ? opts.tips[i] : s.attempted
        ? `Q${s.q}: ${s.pct}% (${s.correct}/${s.attempted})`
        : `Q${s.q}: not graded`;
      svg += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" ` +
        `height="${Math.max(0, h).toFixed(1)}" rx="1.5" fill="${barColor(s.pct == null ? null : s.pct)}" ` +
        `data-tip="${escapeHtml(title)}"></rect>`;
      if (i % labelEvery === 0) {
        const label = opts.labels ? opts.labels[i] : s.q;
        svg += `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" ` +
          `font-size="8" fill="#1f2733">${escapeHtml(String(label))}</text>`;
      }
    });

    // Axes (black)
    svg += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + plotH}" stroke="#1f2733" stroke-width="1.5"/>`;
    svg += `<line x1="${m.left}" y1="${m.top + plotH}" x2="${W - m.right}" y2="${m.top + plotH}" stroke="#1f2733" stroke-width="1.5"/>`;

    els.questionBars.innerHTML = svg;
  }

  // -------------------------------------------------------------------------
  // Compare tab — two tests side by side (e.g. pre-test vs post-test).
  // Read-only: never modifies tests or saved data. Students match by name.
  // -------------------------------------------------------------------------
  function summarizeTest(t) {
    const perStudent = t.students.map((stu) => ({ name: stu.name, ...studentStats(stu) }));
    const graded = perStudent.filter((s) => s.attempted > 0);
    const pcts = graded.map((s) => s.pct);
    const n = pcts.length;
    const bandNames = { meets: [], nearly: [], notmeet: [] };
    graded.forEach((s) => bandNames[scoreBand(s.pct)].push(s.name));

    const perQuestion = [];
    for (let q = 0; q < t.numQuestions; q++) {
      let correct = 0, half = 0, attempted = 0;
      t.students.forEach((stu) => {
        const m = stu.marks[q];
        if (m === "correct") { correct++; attempted++; }
        else if (m === "half") { half++; attempted++; }
        else if (m === "wrong") attempted++;
      });
      perQuestion.push(attempted ? Math.round(((correct + 0.5 * half) / attempted) * 100) : null);
    }

    const byName = {};
    perStudent.forEach((s) => { const k = nameKey(s.name); if (!(k in byName)) byName[k] = s; });

    return {
      label: disambiguatedName(t),
      numQuestions: t.numQuestions,
      perStudent, byName, n, bandNames, perQuestion,
      mean: n ? Math.round(pcts.reduce((a, b) => a + b, 0) / n) : null,
      low: n ? Math.min.apply(null, pcts) : null,
      high: n ? Math.max.apply(null, pcts) : null,
      meets: bandNames.meets.length,
      meetsPct: n ? Math.round((bandNames.meets.length / n) * 100) : null,
    };
  }

  // Coloured change chip: "▲ +12 pts", "▼ −5 pts", "no change".
  function deltaChip(a, b, unit) {
    if (a == null || b == null) return '<span class="delta flat">—</span>';
    const d = b - a;
    if (d > 0) return `<span class="delta up">▲ +${d}${unit}</span>`;
    if (d < 0) return `<span class="delta down">▼ −${-d}${unit}</span>`;
    return '<span class="delta flat">no change</span>';
  }

  function cmpCard(lbl, before, after, delta, sub, tip, cls) {
    const t = tip ? ` data-tip="${escapeHtml(tip)}"` : "";
    return `<div class="stat-card cmp-card ${cls || ""}"${t}><div class="lbl">${lbl}</div>` +
      `<div class="cmp-vals"><span class="cmp-before">${before}</span><span class="cmp-to">→</span>` +
      `<span class="num">${after}</span></div>` +
      (sub ? `<div class="cmp-sub">${sub}</div>` : "") + delta + "</div>";
  }

  function renderCompare() {
    syncCurrentTest();
    const enough = tests.length >= 2;
    els.compareEmpty.hidden = enough;
    els.compareBody.hidden = !enough;
    if (!enough) return;

    // Default: After = the test being worked on, Before = the one just before it.
    const has = (id) => tests.some((t) => t.id === id);
    if (!has(compareBId)) compareBId = currentTestId;
    if (!has(compareAId)) {
      const i = tests.findIndex((t) => t.id === compareBId);
      compareAId = tests[i > 0 ? i - 1 : 1].id;
    }

    const opts = tests.map(testOptionHtml).join("");
    const tA = tests.find((t) => t.id === compareAId);
    const tB = tests.find((t) => t.id === compareBId);
    els.compareASelect.innerHTML = opts;
    els.compareBSelect.innerHTML = opts;
    els.compareASelect.value = compareAId;
    els.compareBSelect.value = compareBId;
    tintSelect(els.compareASelect, tA);
    tintSelect(els.compareBSelect, tB);

    const A = summarizeTest(tA);
    const B = summarizeTest(tB);

    const side = (t, S) => {
      const c = typeColorOf(t);
      return `<span${c ? ` style="color:${c}"` : ""}>${escapeHtml(S.label)}</span> ${typeChip(t, "title-chip")}`;
    };
    els.compareTitle.innerHTML = `${side(tA, A)} <span class="cmp-arrow">→</span> ${side(tB, B)}`;
    els.compareSame.hidden = compareAId !== compareBId;

    // ---- Class average is the hero stat; the other four sit in "More stats" at the bottom ----
    const pc = (v) => (v == null ? "—" : v + "%");
    els.compareMain.innerHTML =
      cmpCard("Class average", pc(A.mean), pc(B.mean), deltaChip(A.mean, B.mean, " pts"),
        "", "Mean of student scores (graded only)", "cmp-card-main");
    els.compareMinor.innerHTML = [
      cmpCard("Students meeting", pc(A.meetsPct), pc(B.meetsPct), deltaChip(A.meetsPct, B.meetsPct, " pts"),
        `${A.meets} of ${A.n} → ${B.meets} of ${B.n}`, "Share of graded students at or above 70%"),
      cmpCard("Lowest score", pc(A.low), pc(B.low), deltaChip(A.low, B.low, " pts"), "", "Lowest student score"),
      cmpCard("Highest score", pc(A.high), pc(B.high), deltaChip(A.high, B.high, " pts"), "", "Highest student score"),
      cmpCard("Students graded", A.n, B.n, deltaChip(A.n, B.n, ""), "", "Students with at least one answer marked"),
    ].join("");

    // ---- where students landed (stacked band bars) ----
    const bandRow = (label, S) => {
      const segs = BANDS.filter((b) => S.bandNames[b].length).map((b) => {
        const c = S.bandNames[b].length;
        const tip = `${BAND_LABEL[b]} (${c}):\n` + S.bandNames[b].join("\n");
        return `<div class="band-seg" style="width:${(c / S.n) * 100}%;background:${BAND_COLOR[b]}" ` +
          `data-tip="${escapeHtml(tip)}"><span class="band-num">${c}</span></div>`;
      }).join("");
      return `<div class="band-row"><span class="band-row-lbl">${label}</span>` +
        `<div class="band-track">${segs || '<div class="band-empty">no data</div>'}</div></div>`;
    };
    els.compareBands.innerHTML = bandRow("Before", A) + bandRow("After", B);

    // ---- per-question grouped bars ----
    renderCompareBars(A, B);
    els.compareBarsLegend.innerHTML =
      `<li><span class="swatch" style="background:${CMP_BEFORE_COLOR}"></span>Before: ${escapeHtml(A.label)}</li>` +
      `<li><span class="swatch" style="background:${CMP_AFTER_COLOR}"></span>After: ${escapeHtml(B.label)}</li>`;

    // ---- per-student rows (matched by name) ----
    const rows = [];
    const seen = {};
    A.perStudent.concat(B.perStudent).forEach((s) => {
      const k = nameKey(s.name);
      if (seen[k]) return;
      seen[k] = true;
      const a = A.byName[k], b = B.byName[k];
      const aPct = a && a.attempted ? a.pct : null;
      const bPct = b && b.attempted ? b.pct : null;
      rows.push({
        name: s.name, a, b, aPct, bPct,
        change: aPct != null && bPct != null ? bPct - aPct : null,
      });
    });
    const both = rows.filter((r) => r.change != null);

    // ---- highlights ----
    const ins = [];
    const joinNames = (arr) => (arr.length ? arr.join(", ") : "(none)");
    if (A.mean != null && B.mean != null) {
      const d = B.mean - A.mean;
      ins.push({ tone: d > 0 ? "good" : d < 0 ? "bad" : "info",
        text: d === 0 ? `Class average held steady at ${B.mean}%.`
          : `Class average ${d > 0 ? "rose" : "fell"} ${Math.abs(d)} points (${A.mean}% → ${B.mean}%).` });
    }
    if (both.length) {
      const rank = (p) => BANDS.indexOf(scoreBand(p));
      const up = both.filter((r) => rank(r.bPct) > rank(r.aPct)).map((r) => r.name);
      const down = both.filter((r) => rank(r.bPct) < rank(r.aPct)).map((r) => r.name);
      const newlyMeet = both.filter((r) => r.aPct < 70 && r.bPct >= 70).map((r) => r.name);
      if (up.length) ins.push({ tone: "good",
        text: `${up.length} student${up.length !== 1 ? "s" : ""} moved up a band.`,
        tip: `Moved up: ${joinNames(up)}` });
      if (newlyMeet.length) ins.push({ tone: "good",
        text: `${newlyMeet.length} student${newlyMeet.length !== 1 ? "s" : ""} now meet${newlyMeet.length === 1 ? "s" : ""} the standard.`,
        tip: `Now meeting (70%+): ${joinNames(newlyMeet)}` });
      if (down.length) ins.push({ tone: "bad",
        text: `${down.length} student${down.length !== 1 ? "s" : ""} dropped a band.`,
        tip: `Dropped: ${joinNames(down)}` });

      const gains = both.filter((r) => r.change > 0).sort((x, y) => y.change - x.change);
      if (gains.length) ins.push({ tone: "good",
        text: `Most improved: ${gains.slice(0, 3).map((r) => `${escapeHtml(r.name)} (+${r.change})`).join(", ")}.`,
        tip: `Improved: ${gains.map((r) => `${r.name} +${r.change}`).join("\n")}` });
      const drops = both.filter((r) => r.change < 0).sort((x, y) => x.change - y.change);
      if (drops.length) ins.push({ tone: "warn",
        text: `${drops.length} student${drops.length !== 1 ? "s" : ""} scored lower; biggest drop ${escapeHtml(drops[0].name)} (−${-drops[0].change}).`,
        tip: `Scored lower: ${drops.map((r) => `${r.name} −${-r.change}`).join("\n")}` });
    }

    // Question gains (only questions graded on both tests).
    const qDiffs = [];
    for (let q = 0; q < Math.min(A.numQuestions, B.numQuestions); q++) {
      const a = A.perQuestion[q], b = B.perQuestion[q];
      if (a != null && b != null) qDiffs.push({ q: q + 1, a, b, d: b - a });
    }
    if (qDiffs.length) {
      const best = qDiffs.slice().sort((x, y) => y.d - x.d)[0];
      const worst = qDiffs.slice().sort((x, y) => x.d - y.d)[0];
      if (best.d > 0) ins.push({ tone: "good",
        text: `Biggest question gain: Q${best.q} (${best.a}% → ${best.b}%).` });
      if (worst.d < 0) ins.push({ tone: "warn",
        text: `Question that slipped most: Q${worst.q} (${worst.a}% → ${worst.b}%).` });
    }
    if (A.numQuestions !== B.numQuestions) ins.push({ tone: "info",
      text: `The tests have different numbers of questions (${A.numQuestions} vs ${B.numQuestions}); questions are compared by number.` });

    const onlyA = rows.filter((r) => r.a && !r.b).map((r) => r.name);
    const onlyB = rows.filter((r) => r.b && !r.a).map((r) => r.name);
    if (onlyA.length || onlyB.length) ins.push({ tone: "info",
      text: `${onlyA.length + onlyB.length} student${onlyA.length + onlyB.length !== 1 ? "s are" : " is"} on only one of the tests.`,
      tip: `Only Before: ${joinNames(onlyA)}\nOnly After: ${joinNames(onlyB)}` });

    els.compareInsights.innerHTML = ins.length
      ? ins.map((i) => `<div class="insight tone-${i.tone}" data-tip="${escapeHtml(i.tip || "")}">${i.text}</div>`).join("")
      : '<div class="insight tone-info">Grade both tests to see how the class changed.</div>';

    // ---- top growth: the top 5 gains, minus students hidden for this pair.
    // Hiding someone leaves their slot empty — nobody else moves up into it. ----
    const pair = compareAId + "|" + compareBId;
    const hidden = hiddenGrowth[pair] || [];
    const top5 = both.filter((r) => r.change > 0)
      .sort((x, y) => y.change - x.change)
      .slice(0, 5);
    const growth = top5.filter((r) => hidden.indexOf(nameKey(r.name)) === -1);
    els.growthGrid.innerHTML = !top5.length
      ? '<div class="insight tone-info">No gains to show yet.</div>'
      : growth.map((r) =>
        `<div class="growth-card" data-tip="${escapeHtml(`${r.name}: ${r.aPct}% → ${r.bPct}%`)}">` +
        `<button class="growth-x" type="button" data-key="${escapeHtml(nameKey(r.name))}" data-tip="Hide this student from the panel">×</button>` +
        `<div class="growth-name">${escapeHtml(r.name)}</div>` +
        `<div class="growth-delta up">▲ +${r.change} pts</div></div>`).join("");
    els.growthFoot.hidden = false; // the tucked-away Show Hidden link at the page bottom
    els.showHiddenBtn.disabled = hidden.length === 0;
    els.hiddenCount.textContent = hidden.length ? `${hidden.length} hidden` : "";

    // ---- student tables: biggest gains first, then anyone missing a score ----
    rows.sort((x, y) => {
      if (x.change != null && y.change != null) return y.change - x.change;
      if (x.change != null) return -1;
      if (y.change != null) return 1;
      return 0;
    });
    const scoreCell = (entry, pct) => {
      if (!entry) return '<td class="num-col score-cell"><span class="cmp-missing">not on test</span></td>';
      if (pct == null) return '<td class="num-col score-cell">—</td>';
      return `<td class="num-col score-cell band-${scoreBand(pct)}">${pct}%</td>`;
    };
    const rowHtml = (r) =>
      `<tr><td>${escapeHtml(r.name)}</td>` +
      scoreCell(r.a, r.aPct) +
      '<td class="arrow-col">&rarr;</td>' +
      scoreCell(r.b, r.bPct) +
      `<td class="num-col">${deltaChip(r.aPct, r.bPct, "")}</td></tr>`;
    // Two side-by-side tables (left gets the extra row when odd); short classes use one.
    const split = rows.length > 6;
    const half = split ? Math.ceil(rows.length / 2) : rows.length;
    els.compareRows.innerHTML = rows.slice(0, half).map(rowHtml).join("") ||
      '<tr><td colspan="5" class="cmp-missing">No students on either test.</td></tr>';
    els.compareRows2.innerHTML = split ? rows.slice(half).map(rowHtml).join("") : "";
    els.compareRows2.closest("table").hidden = !split;
    els.compareTables.classList.toggle("single", !split);
    fitCompareTitle(); // last, once the Class average card beside it has its width
  }

  // Shrink the "Before → After" title until it fits on one line.
  function fitCompareTitle() {
    const el = els.compareTitle;
    if (!el.offsetParent) return; // Compare tab not showing — nothing to measure
    el.style.fontSize = "";
    if (el.scrollWidth <= el.clientWidth) return;
    let size = parseFloat(getComputedStyle(el).fontSize);
    // Jump close with the overflow ratio, then step down to settle.
    size = Math.floor(size * el.clientWidth / el.scrollWidth);
    el.style.fontSize = size + "px";
    while (el.scrollWidth > el.clientWidth && size > 12) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  }

  // Grouped bars: Before (light) and After (purple) per question number.
  function renderCompareBars(A, B) {
    const W = 340, H = 170;
    const m = { top: 10, right: 6, bottom: 22, left: 26 };
    const plotW = W - m.left - m.right;
    const plotH = H - m.top - m.bottom;
    const n = Math.max(A.numQuestions, B.numQuestions);
    const y = (pct) => m.top + plotH * (1 - pct / 100);
    let svg = "";

    [0, 50, 100].forEach((g) => {
      const gy = y(g);
      svg += `<line x1="${m.left}" y1="${gy.toFixed(1)}" x2="${W - m.right}" y2="${gy.toFixed(1)}" ` +
        `stroke="#e2e7ef" stroke-width="1"/>`;
      svg += `<text x="${m.left - 4}" y="${(gy + 3).toFixed(1)}" text-anchor="end" ` +
        `font-size="8" fill="#1f2733">${g}</text>`;
    });

    const slot = plotW / Math.max(1, n);
    const bw = Math.min(slot * 0.36, 13);
    const labelEvery = n <= 20 ? 1 : Math.ceil(n / 15);

    for (let i = 0; i < n; i++) {
      const cx = m.left + slot * (i + 0.5);
      const a = i < A.numQuestions ? A.perQuestion[i] : null;
      const b = i < B.numQuestions ? B.perQuestion[i] : null;
      const fmt = (v) => (v == null ? "not graded" : v + "%");
      let tip = `Q${i + 1}: ${fmt(a)} → ${fmt(b)}`;
      if (a != null && b != null) tip += ` (${b - a >= 0 ? "+" : "−"}${Math.abs(b - a)})`;
      [[a, cx - bw, CMP_BEFORE_COLOR], [b, cx, CMP_AFTER_COLOR]].forEach(([pct, x, color]) => {
        const h = plotH * ((pct || 0) / 100);
        svg += `<rect x="${x.toFixed(1)}" y="${(m.top + plotH - h).toFixed(1)}" width="${bw.toFixed(1)}" ` +
          `height="${h.toFixed(1)}" rx="1.5" fill="${color}" data-tip="${escapeHtml(tip)}"></rect>`;
      });
      if (i % labelEvery === 0) {
        // Green/bold if the question improved, red/bold if it fell.
        const changed = a != null && b != null && a !== b;
        const fill = !changed ? "#1f2733" : b > a ? "#1f9d55" : "#d83a3a";
        svg += `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" ` +
          `font-size="8" fill="${fill}"${changed ? ' font-weight="700"' : ""}>${i + 1}</text>`;
      }
    }

    svg += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + plotH}" stroke="#1f2733" stroke-width="1.5"/>`;
    svg += `<line x1="${m.left}" y1="${m.top + plotH}" x2="${W - m.right}" y2="${m.top + plotH}" stroke="#1f2733" stroke-width="1.5"/>`;
    els.compareBars.innerHTML = svg;
  }

  // -------------------------------------------------------------------------
  // Student tab — one student's work across every test, grouped by type.
  // Read-only. Students match across tests by name (case-insensitive).
  // -------------------------------------------------------------------------
  function renderStudentTab() {
    syncCurrentTest();

    // Roster across all tests: nameKey -> first spelling seen.
    const roster = {};
    tests.forEach((t) => t.students.forEach((s) => {
      const k = nameKey(s.name);
      if (k && !(k in roster)) roster[k] = s.name;
    }));
    const keys = Object.keys(roster).sort((a, b) => roster[a].localeCompare(roster[b]));

    els.studentEmpty.hidden = keys.length > 0;
    els.studentPanel.hidden = keys.length === 0;
    if (!keys.length) {
      els.studentSelect.innerHTML = "";
      els.studentMeta.textContent = "";
      return;
    }
    if (keys.indexOf(studentSelKey) === -1) studentSelKey = keys[0];
    els.studentSelect.innerHTML = keys
      .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(roster[k])}</option>`).join("");
    els.studentSelect.value = studentSelKey;

    // Every test this student is on (first roster match per test).
    const entries = [];
    tests.forEach((t) => {
      const stu = t.students.find((s) => nameKey(s.name) === studentSelKey);
      if (stu) entries.push({ test: t, stu, stats: studentStats(stu), createdAt: t.createdAt });
    });
    const graded = entries.filter((e) => e.stats.attempted > 0);

    els.studentTitle.textContent = roster[studentSelKey];
    els.studentMeta.textContent = `on ${entries.length} test${entries.length !== 1 ? "s" : ""}`;

    // ---- stat cards ----
    const avg = graded.length ? Math.round(graded.reduce((a, e) => a + e.stats.pct, 0) / graded.length) : null;
    const best = graded.slice().sort((a, b) => b.stats.pct - a.stats.pct)[0];
    const worst = graded.slice().sort((a, b) => a.stats.pct - b.stats.pct)[0];
    const byDate = graded.slice().sort(byCreated);
    const testCard = (e, lbl) => e
      ? card(`${e.stats.pct}% <span class="num-sub">${escapeHtml(e.test.name || "Untitled test")}</span>`, lbl, e.test.name)
      : card("—", lbl);
    els.studentCards.innerHTML = [
      card(entries.length, "Tests taken"),
      card(avg == null ? "—" : avg + "%", "Average score", "Mean of graded tests"),
      testCard(best, "Best test"),
      testCard(worst, "Lowest test"),
      card(byDate.length >= 2 ? deltaChip(byDate[0].stats.pct, byDate[byDate.length - 1].stats.pct, " pts") : "—",
        "Trend", "Oldest graded test to newest"),
    ].join("");

    // ---- groups by type: A→Z, untyped last; oldest test first within a group ----
    const groups = {};
    entries.forEach((e) => {
      const k = typeKeyOf(e.test);
      (groups[k] = groups[k] || []).push(e);
    });
    const groupKeys = Object.keys(groups).sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      return typeLabelOf(groups[a][0].test).localeCompare(typeLabelOf(groups[b][0].test));
    });

    els.studentGroups.innerHTML = groupKeys.map((k) => {
      const list = groups[k].slice().sort(byCreated);
      const color = k ? typeColorOf(list[0].test) : null;
      const label = k ? typeLabelOf(list[0].test) : "Untyped";
      const g = list.filter((e) => e.stats.attempted > 0);
      const gAvg = g.length ? Math.round(g.reduce((a, e) => a + e.stats.pct, 0) / g.length) : null;

      const rowsHtml = list.map((e) => {
        const t = e.test, s = e.stats;
        const marks = e.stu.marks.map((m, q) =>
          `<span class="cell state-${m}" data-tip="Q${q + 1}: ${m === "none" ? "blank" : m}">${GLYPH[m]}</span>`).join("");
        const date = t.createdAt != null ? shortDate(t.createdAt) : "date unknown";
        return `<div class="student-test-row">` +
          `<div class="str-head">${typeChip(t)} <strong>${escapeHtml(t.name || "Untitled test")}</strong> ` +
          `<span class="meta">${date} · ${t.numQuestions} question${t.numQuestions !== 1 ? "s" : ""}</span> ` +
          `<span class="score-pill band-${scoreBand(s.pct)}">${s.attempted ? s.pct + "%" : "—"}</span>` +
          (e.stu.done ? ' <span class="done-badge">Done ✓</span>' : "") +
          `<button type="button" class="link-btn" data-open-test="${t.id}">Open in Grade</button></div>` +
          `<div class="str-marks">${marks}</div></div>`;
      }).join("");

      return `<section class="student-group"${color ? ` style="--type-color:${color}"` : ""}>` +
        `<h3><span class="type-dot"></span>${escapeHtml(label)} <span class="meta">· ${list.length} test${list.length !== 1 ? "s" : ""}` +
        `${gAvg != null ? " · avg " + gAvg + "%" : ""}</span></h3>${rowsHtml}</section>`;
    }).join("");
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
    rows.push(["Created", t && t.createdAt != null ? new Date(t.createdAt).toISOString() : ""]);
    rows.push(["Type", t ? (t.type || "").trim() : ""]);
    rows.push([]); // spacer

    const header = ["Student"];
    for (let q = 1; q <= numQuestions; q++) header.push("Q" + q);
    header.push("Done", "Score");
    rows.push(header);

    students.forEach((stu) => {
      const s = studentStats(stu);
      const row = [stu.name];
      for (let q = 0; q < numQuestions; q++) {
        const m = stu.marks[q];
        row.push(m === "correct" ? "Correct" : m === "wrong" ? "Wrong" : m === "half" ? "Half" : "");
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
    if (["half", "h", "partial", "p", "0.5", ".5", "/"].includes(v)) return "half";
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
    let name = "", metaN = null, headerIdx = -1, created = NaN, type = "";

    // Metadata rows only count above the "Student" header, so a student who
    // happens to be named e.g. "Created" isn't misread as metadata.
    rows.forEach((r, idx) => {
      if (headerIdx !== -1) return;
      const key = (r[0] || "").trim().toLowerCase();
      if (key === "test name") name = (r[1] || "").trim();
      else if (key === "questions") metaN = parseInt(r[1], 10);
      else if (key === "created") created = Date.parse((r[1] || "").trim());
      else if (key === "type") type = (r[1] || "").trim();
      else if (key === "student") headerIdx = idx;
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
      type: type,
      numQuestions: qCount,
      students: roster,
      createdAt: Number.isFinite(created) ? created : Date.now(),
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

      // Title + kicker: the test, or the subject (all tests of a type).
      const subject = analysisMode.kind === "type";
      const subjectTests = subject ? tests.filter((t) => typeKeyOf(t) === analysisMode.key) : [];
      const subjectLabel = subject ? typeLabelOf(subjectTests[0]) || analysisMode.label : "";
      const curTest = getCurrentTest();
      const titleText = subject
        ? `${subjectLabel} (${subjectTests.length} test${subjectTests.length !== 1 ? "s" : ""})`
        : (curTest && curTest.name) || "Untitled test";

      // Header
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(59, 108, 255);
      doc.text(subject ? "SUBJECT ANALYSIS · " + subjectLabel.toUpperCase() : "LIVE ANALYSIS", M, y + 4);
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUT);
      doc.text("Printed " + dateStr(), PW - M, y + 4, { align: "right" });
      y += 24;
      doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...INK);
      doc.text(titleText, M, y);
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
      doc.text(els.barTitle.textContent, barX, chartTop + 8);
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
      let yL = section(M, y, col2, els.hardestTitle.textContent, listText(els.hardestList));
      let yR = section(M + col2 + 20, y, col2, els.easiestTitle.textContent, listText(els.easiestList));
      y = Math.max(yL, yR) + 12;

      // Highlights (full width)
      y = section(M, y, CW, "Highlights", listText(els.insightStrip)) + 12;

      // Top performers / Needs attention
      yL = section(M, y, col2, "Top performers", listText(els.topList));
      yR = section(M + col2 + 20, y, col2, "Students needing attention", listText(els.strugglingList));
      y = Math.max(yL, yR);

      const tName = subject ? subjectLabel : (curTest ? curTest.name : "grading-export");
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
