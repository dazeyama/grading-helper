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
  // Four performance bands, one scheme for every tab (and for rubric tests):
  // blue = exceeds, green = meets, amber = nearly, red = does not meet.
  // Blue/green/amber/red are reserved for these ratings.
  const BANDS = ["notmeet", "nearly", "meets", "exceeds"]; // low -> high
  const BAND_LABEL = { exceeds: "Exceeds", meets: "Meets", nearly: "Nearly meets", notmeet: "Does not meet" };
  const BAND_COLOR = { exceeds: "#2f6fe4", meets: "#1f9d55", nearly: "#e0a400", notmeet: "#d83a3a" };
  const BAND_BG = { exceeds: "#e4ecfb", meets: "#e4f6ec", nearly: "#fdf4dc", notmeet: "#fde7e7" };
  const BAND_RANGE = { exceeds: "90% and up", meets: "70–89%", nearly: "51–69%", notmeet: "50% and below" };
  // Rubric Score pills: "DNM" for does-not-meet, otherwise the full label.
  const BAND_SHORT = { exceeds: "Exceeds", meets: "Meets", nearly: "Nearly meets", notmeet: "DNM" };
  const BAND_VERB = { exceeds: "exceed", meets: "meet", nearly: "nearly", notmeet: "do not meet" };

  // "Exceeds band" toggle (Analysis, Compare and Student only; shared and
  // remembered). Off = the old three-band view: Exceeds is shown as green
  // Meets, so no blue appears on those screens. Saved data never changes,
  // and the Grade tab always shows all four bands.
  let showExceeds = true;
  const viewBand = (b) => (!showExceeds && b === "exceeds" ? "meets" : b);
  const shownBands = () => (showExceeds ? BANDS : BANDS.filter((b) => b !== "exceeds")); // low -> high
  const shownRange = (b) => (!showExceeds && b === "meets" ? "70% and up" : BAND_RANGE[b]);
  const shownRubricColor = (c) => (!showExceeds && c === "blue" ? "green" : c);

  function applyExceedsToggleUI() {
    document.querySelectorAll(".exceeds-toggle").forEach((btn) => {
      btn.setAttribute("aria-pressed", showExceeds ? "true" : "false");
      btn.classList.toggle("on", showExceeds);
      btn.querySelector(".ex-state").textContent = showExceeds ? "On" : "Off";
      btn.setAttribute("data-tip", showExceeds
        ? "90%+ shows as blue Exceeds — click to show it as green Meets (the three-band view)"
        : "90%+ shows as green Meets — click to bring back the blue Exceeds band");
    });
  }

  // "1 exceed, 2 meet, 0 nearly, 1 do not meet" (+ the matching tooltip) for
  // { band: [names] }, best band first, following the Exceeds toggle.
  function bandCountsText(byBand) {
    const order = shownBands().slice().reverse();
    return {
      text: order.map((b) => `${(byBand[b] || []).length} ${BAND_VERB[b]}`).join(", "),
      tip: order.map((b) => `${b === "nearly" ? "Nearly" : BAND_LABEL[b]}: ${(byBand[b] || []).join(", ") || "(none)"}`).join("\n"),
    };
  }
  // Before bars are neutral gray so they never read as a rating; After = Compare purple.
  const CMP_BEFORE_COLOR = "#c3c9d3", CMP_AFTER_COLOR = "#8b5fcf";
  const nameKey = (s) => String(s || "").trim().toLowerCase();

  // -------------------------------------------------------------------------
  // Grading types — how a test is graded. (Not to be confused with t.type,
  // which is the test's Subject.) Adding a third type is one entry here.
  // -------------------------------------------------------------------------
  const GRADING_TYPES = [
    { id: "standard", label: "Standard", hint: "Questions marked ✓ / ✗ / half" },
    { id: "rubric",   label: "Rubric",   hint: "Score each student against rubric tables" },
    // third type: reserved — see RUBRIC.md §1 note
  ];
  const isRubric = (t) => !!t && t.gradingType === "rubric";
  const gradingTypeLabel = (id) => (GRADING_TYPES.find((g) => g.id === id) || GRADING_TYPES[0]).label;

  // -------------------------------------------------------------------------
  // Test types (e.g. Math, Reading). The color belongs to the TYPE, not the
  // test: every test sharing a type shares one color.
  // -------------------------------------------------------------------------
  // The 12 pastel colors offered by the Setup tab's color picker (also used, in
  // order, to auto-color new types). Deliberately no blue, green, yellow or red,
  // so subject colors never look like the meets / nearly / does-not-meet bands.
  // Pastels are too light for white text or for text on white, so text and
  // lines use inkOf() (a dark shade of the same hue) — see below.
  const TYPE_PALETTE = [
    "#c8b6f5", "#ffc6a5", "#92e0db", "#f7a6d2",
    "#e3caa5", "#a68ad9", "#f8ab70", "#64c7c8",
    "#e3a3ee", "#c29e88", "#cf9fb8", "#c4c6ce",
  ];
  const TYPE_PALETTE_NAMES = [
    "Lavender", "Peach", "Aqua", "Bubblegum",
    "Sand", "Grape", "Apricot", "Turquoise",
    "Orchid", "Cocoa", "Mauve", "Stone",
  ];
  // The previous palette: subjects saved with one of these move to the color in
  // the same slot of the new palette when a session loads.
  const OLD_TYPE_PALETTE = [
    "#3b6cff", "#1f9d55", "#e0853a", "#8b5fcf", "#d9557f", "#0f9ba8",
    "#b07f00", "#5a6b7f", "#d83a3a", "#1e40af", "#8d5a3b", "#b8329e",
  ];
  let typeColors = {};      // typeKey -> hex color (persisted)

  // Same hue at a chosen lightness (0–1) — turns a pastel into a readable shade.
  function shadeOf(hex, light) {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0, s = 0;
    if (d) {
      s = Math.min(0.7, d / (1 - Math.abs(max + min - 1)));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    const c = (1 - Math.abs(2 * light - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = light - c / 2;
    const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
  }
  // Dark shade of a subject color, for text and lines on white.
  const inkOf = (hex) => (hex ? shadeOf(hex, 0.32) : null);
  // Text color to put ON a subject color: a deep same-hue shade on light colors, white on dark ones.
  function onColorOf(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? shadeOf(hex, 0.2) : "#fff";
  }
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

  // Dark shade of a test's subject color (null when it has no subject).
  function typeInkOf(t) { return inkOf(typeColorOf(t)); }

  function typeChip(t, extraClass) {  // "" when untyped
    const c = typeColorOf(t);
    if (!c) return "";
    return `<span class="type-chip ${extraClass || ""}" style="--type-color:${c};--type-on:${onColorOf(c)}">` +
      `${escapeHtml(typeLabelOf(t))}</span>`;
  }

  // Distinct non-empty types across `list` (default: all tests): [{ key, label, color, count }], A→Z.
  function typeGroups(from) {
    const map = {}, list = [];
    (from || tests).forEach((t) => {
      const k = typeKeyOf(t);
      if (!k) return;
      if (!map[k]) {
        map[k] = { key: k, label: typeLabelOf(t), color: typeColorOf(t), ink: typeInkOf(t), count: 0 };
        list.push(map[k]);
      }
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

  // -------------------------------------------------------------------------
  // Tags — free-form labels per test (e.g. "Pre-test", "Unit 3"), entered on
  // Setup as a comma-separated list. Matching ignores capitals. The Analysis
  // and Student tabs can filter to one tag.
  // -------------------------------------------------------------------------
  const tagKey = (s) => String(s || "").trim().toLowerCase();

  // De-duplicated (ignoring capitals), trimmed, non-empty tags.
  function normalizeTags(arr) {
    const seen = {}, out = [];
    (arr || []).forEach((x) => {
      const s = String(x == null ? "" : x).trim(), k = tagKey(s);
      if (k && !seen[k]) { seen[k] = true; out.push(s); }
    });
    return out;
  }
  const parseTags = (text) => normalizeTags(String(text || "").split(","));
  const tagLabel = (key) => { const g = allTags().find((x) => x.key === key); return g ? g.label : key; };
  const hasTag = (t, key) => !key || ((t && t.tags) || []).some((x) => tagKey(x) === key);

  // Every tag in use: [{ key, label, count }], A→Z (label = first spelling seen).
  function allTags() {
    const map = {}, list = [];
    tests.forEach((t) => (t.tags || []).forEach((x) => {
      const k = tagKey(x);
      if (!map[k]) { map[k] = { key: k, label: x, count: 0 }; list.push(map[k]); }
      map[k].count++;
    }));
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }

  // Active tag filters ("" = any tag), both remembered across sessions.
  let analysisTag = "", studentTag = "";
  // Include (true, default) = only tests WITH the tag; Exclude (false) = every test WITHOUT it.
  let analysisTagInclude = true, studentTagInclude = true;

  // Does test t pass a tag filter? No tag chosen = everything passes.
  const tagFilterPasses = (t, key, include) => !key || hasTag(t, key) === include;

  // " tagged “X”" / " not tagged “X”" for titles and notes ("" when no tag is chosen).
  const tagFilterNote = (key, include) =>
    key ? ` ${include ? "tagged" : "not tagged"} “${tagLabel(key)}”` : "";

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
      "bandNumbersToggle", "compareBandLegend", "compareBarsNote", "pieHalf", "chartOnlyToggle", "growthGrid", "growthFoot", "showHiddenBtn", "hiddenCount", "compareTables", "compareRows2",
      "compareBarsLegend", "compareDetails", "compareDetailsHeader", "compareInsights", "compareRows",
      "gradingType", "numQuestionsField", "rubricSetup",
      "rubricSelect", "rubricEditBtn", "rubricDeleteBtn", "rubricExportBtn", "rubricImportBtn",
      "rubricImportFile", "rubricPrintBtn", "rubricCreateBtn", "rubricSummary",
      "modalBackdrop", "modalDialog", "modalTitle", "modalClose", "modalBody", "modalFoot",
      "titleDate", "titleCreated", "testType", "testTypeColor", "typeColorMenu", "typeSuggestions", "sheetTitle",
      "testTags", "tagSuggest", "analysisTagWrap", "analysisTagSelect", "studentTagWrap", "studentTagSelect",
      "analysisTagMode", "studentTagMode",
      "studentSelect", "studentMeta", "studentEmpty", "studentPanel", "studentTitle", "studentCards", "studentGroups",
      "avgChip", "avgChipNum", "barTitle", "hardestTitle", "easiestTitle",
    ].forEach((id) => (els[id] = document.getElementById(id)));

    initTooltip();
    initModal();
    initRubricGrid();

    els.newTestBtn.addEventListener("click", createTest);
    els.clearBtn.addEventListener("click", clearSetupForm);
    els.clearMarksBtn.addEventListener("click", clearMarks);

    // Setup form fields live-edit the SELECTED test.
    els.testName.addEventListener("input", applyNameEdit);
    els.classList.addEventListener("input", applyClassListEdit);
    els.numQuestions.addEventListener("change", applyQuestionCountEdit);
    // Grading type dropdown, built from the GRADING_TYPES registry.
    els.gradingType.innerHTML = GRADING_TYPES.map((g) =>
      `<option value="${g.id}" data-tip="${escapeHtml(g.hint)}">${escapeHtml(g.label)}</option>`).join("");
    els.gradingType.addEventListener("change", (e) => applyGradingTypeEdit(e.target.value));

    // Rubric block (Setup, rubric tests)
    els.rubricSelect.addEventListener("change", (e) => {
      const t = getCurrentTest();
      if (!t) return;
      if (!setTestRubric(t, e.target.value)) { renderRubricSetup(); return; } // cancelled
      persist();
      renderRubricSetup();
      renderCurrentTest();
    });
    els.rubricCreateBtn.addEventListener("click", () => openRubricEditor(null));
    els.rubricEditBtn.addEventListener("click", () => {
      const r = getRubric(els.rubricSelect.value);
      if (r) openRubricEditor(r);
    });
    els.rubricDeleteBtn.addEventListener("click", deleteSelectedRubric);
    els.rubricExportBtn.addEventListener("click", exportSelectedRubric);
    els.rubricImportBtn.addEventListener("click", () => els.rubricImportFile.click());
    els.rubricImportFile.addEventListener("change", handleRubricImportFile);
    els.rubricPrintBtn.addEventListener("click", () => {
      const r = getRubric(els.rubricSelect.value);
      if (r) printRubricPdf(r, null); // the blank rubric, one page
    });

    els.testType.addEventListener("input", applyTypeEdit);
    els.testTags.addEventListener("input", applyTagsEdit);
    els.tagSuggest.addEventListener("click", (e) => {
      const b = e.target.closest ? e.target.closest("[data-add-tag]") : null;
      if (!b) return;
      const cur = parseTags(els.testTags.value);
      els.testTags.value = cur.concat([b.getAttribute("data-add-tag")]).join(", ");
      applyTagsEdit();
      els.testTags.focus();
    });

    // Tag filters (Analysis, Student)
    els.analysisTagSelect.addEventListener("change", (e) => { analysisTag = e.target.value; renderAnalysis(); });
    els.studentTagSelect.addEventListener("change", (e) => {
      studentTag = e.target.value;
      renderTagFilters(); // shows/hides the With | Without switch
      renderStudentTab();
      persist();
    });
    // "Exceeds band" toggle — one shared setting, a button on each of the
    // Analysis, Compare and Student bars.
    document.querySelectorAll(".exceeds-toggle").forEach((btn) => btn.addEventListener("click", () => {
      showExceeds = !showExceeds;
      applyExceedsToggleUI();
      updateAnalysis();
      if (document.querySelector('.tab-pane[data-pane="compare"].active')) renderCompare();
      refreshStudentTabIfActive();
      persist();
    }));

    // With | Without switches beside the tag filters ("with" = only tests that have the tag).
    const tagModeOf = (e) => {
      const b = e.target.closest ? e.target.closest("[data-mode]") : null;
      return b && !b.disabled ? b.getAttribute("data-mode") === "with" : null;
    };
    els.analysisTagMode.addEventListener("click", (e) => {
      const w = tagModeOf(e);
      if (w === null) return;
      analysisTagInclude = w;
      renderAnalysis();
    });
    els.studentTagMode.addEventListener("click", (e) => {
      const w = tagModeOf(e);
      if (w === null) return;
      studentTagInclude = w;
      renderTagFilters();
      renderStudentTab();
      persist();
    });

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
    applyExceedsToggleUI();

    // Snap the ruled-line grid so the first line lands on the red tab shelf.
    alignPaperLines();
    window.addEventListener("resize", alignPaperLines);
    window.addEventListener("resize", fitCompareTitle);
    window.addEventListener("resize", () => {
      if (analysisMode.kind === "type" && document.querySelector('.tab-pane[data-pane="analysis"].active')) updateAnalysis();
    });
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

  // -------------------------------------------------------------------------
  // Modal — one shared pop-up window over the UI. Only one is open at a time.
  // Esc, ×, or a click on the dimmed backdrop closes it; if the content marked
  // itself dirty (modalDirty = true, e.g. unsaved rubric edits) it asks first.
  // -------------------------------------------------------------------------
  let modalDirty = false;
  let modalOnClose = null;
  let modalReturnFocus = null;
  let modalKind = null; // what's showing, so clicks/typing inside reach the right handler

  function initModal() {
    els.modalClose.addEventListener("click", () => requestCloseModal());
    els.modalBackdrop.addEventListener("mousedown", (e) => {
      if (e.target === els.modalBackdrop) requestCloseModal(); // backdrop only, not the dialog
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.modalBackdrop.hidden) { e.preventDefault(); requestCloseModal(); }
    });
    // Delegated handlers for whatever the modal is showing.
    const onClick = (e) => {
      const btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn || btn.disabled) return;
      if (modalKind === "rubric-editor") onRubricEditorClick(btn);
      else if (modalKind === "student-rubric" && btn.getAttribute("data-act") !== "close") onStudentPanelClick(btn);
      else if (btn.getAttribute("data-act") === "close") requestCloseModal();
    };
    els.modalBody.addEventListener("click", onClick);
    els.modalFoot.addEventListener("click", onClick);
    els.modalBody.addEventListener("input", (e) => {
      const path = e.target.getAttribute && e.target.getAttribute("data-path");
      if (modalKind === "rubric-editor" && path) { setDraftPath(path, e.target.value); modalDirty = true; }
    });
    els.modalBody.addEventListener("change", (e) => {
      const ui = e.target.getAttribute && e.target.getAttribute("data-ui");
      if (modalKind === "rubric-editor" && ui) rubricEditorUI[ui] = Number(e.target.value);
      else if (modalKind === "student-rubric") onStudentPanelChange(e.target);
    });
  }

  // opts: { kind, title, bodyHtml, footHtml, size ("lg" = wide), onClose }.
  // Returns the body element so the caller can wire up its contents.
  function openModal(opts) {
    if (!els.modalBackdrop.hidden) closeModal();
    modalReturnFocus = document.activeElement;
    modalDirty = false;
    modalKind = opts.kind || null;
    modalOnClose = opts.onClose || null;
    els.modalTitle.textContent = opts.title || "";
    els.modalBody.innerHTML = opts.bodyHtml || "";
    els.modalFoot.innerHTML = opts.footHtml || "";
    els.modalFoot.hidden = !opts.footHtml;
    els.modalDialog.classList.toggle("modal-lg", opts.size === "lg");
    els.modalBackdrop.hidden = false;
    document.body.classList.add("modal-open");
    els.modalBody.scrollTop = 0;
    els.modalDialog.focus();
    return els.modalBody;
  }

  function requestCloseModal() {
    if (els.modalBackdrop.hidden) return;
    if (modalDirty && !window.confirm("Discard unsaved changes?")) return;
    closeModal();
  }

  function closeModal() {
    if (els.modalBackdrop.hidden) return;
    els.modalBackdrop.hidden = true;
    document.body.classList.remove("modal-open");
    els.modalBody.innerHTML = "";
    els.modalFoot.innerHTML = "";
    modalDirty = false;
    modalKind = null;
    const cb = modalOnClose;
    modalOnClose = null;
    if (cb) cb();
    if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
  }

  function syncTestTitle() {
    if (analysisMode.kind === "type") return; // subject view owns the title
    const t = getCurrentTest();
    els.analysisTitle.innerHTML =
      escapeHtml((t && t.name) ? t.name : "Untitled test") + " " + typeChip(t, "title-chip") +
      (isRubric(t) ? ' <span class="gt-chip">Rubric</span>' : "");
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
    // The subject trend chart sizes itself to its on-screen width, which is only
    // measurable while the Analysis tab is showing.
    if (name === "analysis" && analysisMode.kind === "type") updateAnalysis();
    persist();
  }

  // Keep the Student tab current if it's showing when data changes.
  function refreshStudentTabIfActive() {
    if (document.querySelector('.tab-pane[data-pane="student"].active')) renderStudentTab();
  }

  // -------------------------------------------------------------------------
  // Student records per grading type. Standard students carry `marks`;
  // rubric students carry scores/picks/band instead (never both).
  //   standard: { name, marks: [state, ...], done }
  //   rubric:   { name, done, scores: {tableId: number|null}, picks: {tableId: [[row, col], ...]},
  //               band: "exceeds"|"meets"|"nearly"|"notmeet"|null, bandManual }
  // -------------------------------------------------------------------------
  function sanitizeStandardStudent(s, nq) {
    const marks = Array.isArray(s.marks) ? s.marks.slice(0, nq) : [];
    while (marks.length < nq) marks.push("none");
    return {
      name: String(s.name || ""),
      marks: marks.map((m) => (m === "correct" || m === "wrong" || m === "half" ? m : "none")),
      done: !!s.done,
    };
  }

  function sanitizeRubricStudent(s) {
    const scores = {}, picks = {};
    if (s.scores && typeof s.scores === "object") {
      Object.keys(s.scores).forEach((k) => {
        const v = s.scores[k];
        scores[k] = v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
      });
    }
    if (s.picks && typeof s.picks === "object") {
      Object.keys(s.picks).forEach((k) => {
        if (!Array.isArray(s.picks[k])) return;
        picks[k] = s.picks[k]
          .filter((p) => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]))
          .map((p) => [p[0], p[1]]);
      });
    }
    const band = BANDS.indexOf(s.band) !== -1 ? s.band : null;
    return { name: String(s.name || ""), done: !!s.done, scores, picks, band, bandManual: !!s.bandManual && !!band };
  }

  // A student's question marks for READ-ONLY use — [] for rubric students, so
  // shared code (stats, analysis, CSV) never trips over a missing array.
  const NO_MARKS = Object.freeze([]);
  const marksOf = (s) => (s && s.marks) || NO_MARKS;

  // A fresh, ungraded student for test t's grading type.
  function blankStudent(name, t) {
    return isRubric(t)
      ? { name, done: false, scores: {}, picks: {}, band: null, bandManual: false }
      : { name, marks: new Array(t.numQuestions).fill("none"), done: false };
  }

  // Deep copy of a student record (for saving and for the stash).
  function copyStudent(s, gradingType) {
    return gradingType === "rubric"
      ? sanitizeRubricStudent(JSON.parse(JSON.stringify(s)))
      : { name: s.name, marks: (s.marks || []).slice(), done: !!s.done };
  }

  // A stashed snapshot of one grading type's data (see applyGradingTypeEdit).
  function sanitizeSnapshot(snap, gradingType, nqFallback) {
    if (!snap || typeof snap !== "object") return null;
    const list = Array.isArray(snap.students) ? snap.students : [];
    if (gradingType === "rubric") {
      return {
        rubricTemplateId: typeof snap.rubricTemplateId === "string" ? snap.rubricTemplateId : null,
        students: list.map(sanitizeRubricStudent),
      };
    }
    const nq = Math.max(1, parseInt(snap.numQuestions, 10) || nqFallback || 1);
    return { numQuestions: nq, students: list.map((s) => sanitizeStandardStudent(s, nq)) };
  }

  // -------------------------------------------------------------------------
  // Session cache — keep the last session in localStorage, restore on launch.
  // -------------------------------------------------------------------------
  function sanitizeTest(t) {
    const nq = Math.max(1, parseInt(t.numQuestions, 10) || 1);
    // Old caches (v2/v3) have no gradingType: every one of those tests is Standard.
    const gradingType = GRADING_TYPES.some((g) => g.id === t.gradingType) ? t.gradingType : "standard";
    const studs = (Array.isArray(t.students) ? t.students : []).map((s) =>
      gradingType === "rubric" ? sanitizeRubricStudent(s) : sanitizeStandardStudent(s, nq));
    const stash = {};
    if (t.stash && typeof t.stash === "object") {
      GRADING_TYPES.forEach((g) => {
        if (g.id === gradingType) return; // the live type is never stashed
        const snap = sanitizeSnapshot(t.stash[g.id], g.id, nq);
        if (snap) stash[g.id] = snap;
      });
    }
    const id = t.id || genId();
    // Old caches have no createdAt — recover it from the id ("t<N>_<epoch ms>").
    let createdAt = Number.isFinite(t.createdAt) ? t.createdAt : parseInt(String(id).split("_")[1], 10);
    if (!Number.isFinite(createdAt)) createdAt = null;
    return {
      id: id,
      name: t.name || "Untitled test",
      numQuestions: nq, // kept on rubric tests too (ignored there) so switching back is painless
      students: studs,
      createdAt: createdAt,
      type: String(t.type || ""),
      tags: Array.isArray(t.tags) ? normalizeTags(t.tags) : [],
      gradingType: gradingType,
      rubricTemplateId: typeof t.rubricTemplateId === "string" ? t.rubricTemplateId : null,
      stash: stash,
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
        v: 4,
        tests: tests.map((t) => ({
          id: t.id, name: t.name, numQuestions: t.numQuestions, createdAt: t.createdAt, type: t.type || "",
          tags: (t.tags || []).slice(),
          gradingType: t.gradingType || "standard",
          rubricTemplateId: t.rubricTemplateId || null,
          students: t.students.map((s) => copyStudent(s, t.gradingType)),
          stash: t.stash || {}, // the other grading type's data, kept for switching back
        })),
        currentTestId: currentTestId,
        activeTab: activeTabEl ? activeTabEl.dataset.tab : "setup",
        detailsCollapsed: detailsCollapsed,
        typeColors: typeColors,
        rubricTemplates: rubricTemplates,
        analysisMode: analysisMode,
        hiddenGrowth: hiddenGrowth,
        studentSelKey: studentSelKey,
        analysisTag: analysisTag,
        studentTag: studentTag,
        analysisTagInclude: analysisTagInclude,
        showExceeds: showExceeds,
        studentTagInclude: studentTagInclude,
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
    rubricTemplates = Array.isArray(state.rubricTemplates)
      ? state.rubricTemplates.map(sanitizeRubric).filter(Boolean) : [];
    typeColors = {};
    if (state.typeColors && typeof state.typeColors === "object") {
      Object.keys(state.typeColors).forEach((k) => {
        const c = state.typeColors[k];
        if (typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c)) return;
        // Colors from the old (bold) palette move to the same slot of the pastel one.
        const old = OLD_TYPE_PALETTE.indexOf(c.toLowerCase());
        typeColors[typeKey(k)] = old !== -1 ? TYPE_PALETTE[old] : c;
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
    // Tag filters for a tag that no longer exists are reset by renderTagFilters().
    analysisTag = typeof state.analysisTag === "string" ? tagKey(state.analysisTag) : "";
    studentTag = typeof state.studentTag === "string" ? tagKey(state.studentTag) : "";
    analysisTagInclude = state.analysisTagInclude !== false; // default: Include
    showExceeds = state.showExceeds !== false;               // default: On (blue Exceeds)
    studentTagInclude = state.studentTagInclude !== false;

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

  function makeTest(name, nq, names, type, gradingType, rubricTemplateId) {
    const q = Math.max(1, Math.min(100, nq || 1));
    const t = {
      id: genId(),
      name: (name || "Untitled test").trim() || "Untitled test",
      type: String(type || ""),
      tags: [], // tags describe one test (e.g. "Pre-test"), so New Test doesn't copy them
      numQuestions: q,
      gradingType: GRADING_TYPES.some((g) => g.id === gradingType) ? gradingType : "standard",
      rubricTemplateId: gradingType === "rubric" && rubricTemplateId ? rubricTemplateId : null,
      stash: {},
      students: [],
      createdAt: Date.now(),
      pinnedIndex: null,
      sheetCollapsed: false,
    };
    t.students = names.map((n) => blankStudent(n, t));
    return t;
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
    rubricBandEditRow = null;
    // Mirror the test into the Setup editor form.
    els.testName.value = t.name;
    els.numQuestions.value = t.numQuestions;
    els.classList.value = t.students.map((s) => s.name).join("\n");
    els.testType.value = t.type || "";
    els.testTags.value = (t.tags || []).join(", ");
    syncTypeColorInput();
    applyGradingTypeUI();
    renderCurrentTest();
  }

  // -------------------------------------------------------------------------
  // Switching grading type: the old type's data is stashed on the test (and
  // persisted), the new type gets its own stash back or a clean slate.
  // -------------------------------------------------------------------------
  function hasGradingData(t) {
    return t.students.some((s) => s.done || (isRubric(t)
      ? Object.keys(s.scores || {}).some((k) => s.scores[k] != null) ||
        Object.keys(s.picks || {}).some((k) => (s.picks[k] || []).length) || s.bandManual
      : marksOf(s).some((m) => m !== "none")));
  }

  function snapshotFor(gradingType, t) {
    const students = t.students.map((s) => copyStudent(s, gradingType));
    return gradingType === "rubric"
      ? { rubricTemplateId: t.rubricTemplateId || null, students }
      : { numQuestions: t.numQuestions, students };
  }

  function applyGradingTypeEdit(newType) {
    const t = getCurrentTest();
    if (!t || !GRADING_TYPES.some((g) => g.id === newType)) return;
    const oldType = t.gradingType || "standard";
    if (newType === oldType) return;
    syncCurrentTest();

    if (hasGradingData(t)) {
      const oldLbl = gradingTypeLabel(oldType), newLbl = gradingTypeLabel(newType);
      const what = oldType === "rubric" ? "rubric scores" : "marks";
      if (!window.confirm(`Switch this test to ${newLbl} grading? Your ${oldLbl} ${what} are kept and ` +
          `come back if you switch this test back to ${oldLbl}. Continue?`)) {
        els.gradingType.value = oldType; // cancelled — put the dropdown back
        return;
      }
    }

    // 1) Stash what's live now.
    t.stash = t.stash || {};
    t.stash[oldType] = snapshotFor(oldType, t);

    // 2) Restore the new type's stash (matched to the CURRENT roster by name),
    //    or start it clean.
    const snap = t.stash[newType];
    delete t.stash[newType];
    t.gradingType = newType;
    if (newType === "rubric") t.rubricTemplateId = snap ? snap.rubricTemplateId : null;
    else if (snap) t.numQuestions = snap.numQuestions;
    const pool = {};
    (snap ? snap.students : []).forEach((s) => { (pool[nameKey(s.name)] = pool[nameKey(s.name)] || []).push(s); });
    t.students = t.students.map((cur) => {
      const kept = (pool[nameKey(cur.name)] || []).shift();
      if (!kept) return blankStudent(cur.name, t); // added to the roster since the stash
      kept.name = cur.name; // keep today's spelling
      return kept;
    });

    loadTestIntoGlobals(t);
    persist();
  }

  // Show the controls that fit the selected test's grading type.
  function applyGradingTypeUI() {
    const t = getCurrentTest();
    const gt = (t && t.gradingType) || "standard";
    const rubric = gt === "rubric";
    els.gradingType.value = gt;
    els.numQuestionsField.hidden = rubric;  // rubric tests are scored per rubric table
    els.rubricSetup.hidden = !rubric;
    if (rubric) renderRubricSetup();
    // body.gt-<type> lets CSS swap Grade-tab chrome (e.g. the tip line).
    GRADING_TYPES.forEach((g) => document.body.classList.toggle("gt-" + g.id, g.id === gt));
    els.clearMarksBtn.setAttribute("data-tip", rubric
      ? "Reset every rubric score, pick, band and Done flag (keeps the roster and rubric)"
      : "Reset every mark and Done flag (keeps the roster and questions)");
  }

  // Grade tab: show the grid, or a message saying what's missing.
  const GRADE_EMPTY_ROSTER = "Add a class list on the <strong>Setup</strong> tab and click <strong>New Test</strong> to begin.";
  const GRADE_EMPTY_RUBRIC = "Choose or create a rubric template on the <strong>Setup</strong> tab to grade this test.";
  function applyGradeEmptyState() {
    const t = getCurrentTest();
    const msg = !students.length ? GRADE_EMPTY_ROSTER
      : isRubric(t) && !rubricReady(t) ? GRADE_EMPTY_RUBRIC : null;
    els.gradeTable.hidden = !!msg;
    els.emptyState.hidden = !msg;
    if (msg) els.emptyState.innerHTML = msg;
  }

  // Can this rubric test be graded yet? It needs a rubric template.
  function rubricReady(t) {
    return !!rubricForTest(t);
  }

  function renderCurrentTest() {
    renderHead();
    renderBody();
    applyGradeEmptyState();
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
      ? `<option value="${t.id}" style="color:${inkOf(color)}" data-color="${color}">● ${label}</option>`
      : `<option value="${t.id}" style="color:${OPTION_INK}">${label}</option>`;
  }

  // Tint a <select> with the type color of the test (or subject) it shows:
  // a pastel bar on the left, text in the color's dark shade.
  function tintSelect(sel, t) {
    const color = typeColorOf(t);
    sel.style.borderLeft = color ? "6px solid " + color : "";
    sel.style.color = color ? inkOf(color) : "";
  }

  // Set the accent custom properties on an element (documentElement, or the
  // Analysis panel in subject view); null clears them back to the default blue.
  function setAccentVars(el, color) {
    const vars = {
      "--test-accent": color,                         // fills (pastel)
      "--test-accent-line": color && shadeOf(color, 0.6), // borders
      "--test-accent-ink": color && inkOf(color),     // text on white
      "--test-accent-on": color && onColorOf(color),  // text on the fill
    };
    Object.keys(vars).forEach((k) => {
      if (vars[k]) el.style.setProperty(k, vars[k]);
      else el.style.removeProperty(k);
    });
  }

  function renderTestOptions() {
    const opts = tests.map(testOptionHtml).join("");
    const cur = getCurrentTest();
    [els.setupTestSelect, els.gradeTestSelect].forEach((sel) => {
      sel.innerHTML = opts;
      sel.value = currentTestId;
      tintSelect(sel, cur);
    });

    // Tag filters first: they reset themselves if their tag has disappeared.
    renderTagFilters();

    // Analysis: Tests, plus Subjects (all tests of a subject) when any test has one.
    // Both lists follow the Analysis tag filter; the current test always stays listed.
    validateAnalysisMode();
    const pool = analysisTests();
    const listed = pool.indexOf(cur) === -1 && cur ? pool.concat([cur]) : pool;
    const groups = typeGroups(pool);
    const sel = els.analysisTestSelect;
    sel.innerHTML = `<optgroup label="Tests" style="color:${OPTION_INK}">${listed.map(testOptionHtml).join("")}</optgroup>` + (groups.length
      ? `<optgroup label="Subjects (all tests in a subject)" style="color:${OPTION_INK}">` + groups.map((g) =>
        `<option value="type:${escapeHtml(g.key)}" style="color:${g.ink}" data-color="${g.color}">` +
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
    setAccentVars(document.documentElement, typeColorOf(t));
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
    // …and the grading type (plus the rubric, for rubric tests).
    const t = makeTest("New Test", nq, names, prev ? prev.type : "",
      prev ? prev.gradingType : "standard", prev ? prev.rubricTemplateId : null);
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

  // Tags are re-parsed on every keystroke; the box itself is left as typed.
  function applyTagsEdit() {
    const t = getCurrentTest();
    if (!t) return;
    t.tags = parseTags(els.testTags.value);
    updateAnalysis();     // a subject view filtered by tag may gain/lose this test
    renderTestOptions();  // refreshes the tag filters and suggestions too
    refreshStudentTabIfActive();
    persist();
  }

  // Setup: the tags other tests use that this test doesn't have yet, as "+ tag" buttons.
  function renderTagSuggest() {
    const mine = parseTags(els.testTags.value).map(tagKey);
    const others = allTags().filter((g) => mine.indexOf(g.key) === -1);
    els.tagSuggest.hidden = !others.length;
    els.tagSuggest.innerHTML = others.length
      ? '<span class="tag-suggest-lbl">Add a tag:</span>' + others.map((g) =>
        `<button type="button" class="tag-chip tag-add" data-add-tag="${escapeHtml(g.label)}" ` +
        `data-tip="Used on ${g.count} test${g.count !== 1 ? "s" : ""}">+ ${escapeHtml(g.label)}</button>`).join("")
      : "";
  }

  // Fill every Tag filter <select>; a filter whose tag no longer exists resets to "any tag".
  // Each bar reads as a sentence: Show tests [With | Without] tag [name ▾]. While
  // no tag is chosen it's just "Show tests [any tag ▾]" (the switch is hidden).
  function renderTagFilters() {
    const tags = allTags();
    const keys = tags.map((g) => g.key);
    if (keys.indexOf(analysisTag) === -1) analysisTag = "";
    if (keys.indexOf(studentTag) === -1) studentTag = "";
    const opts = '<option value="">any tag</option>' + tags.map((g) =>
      `<option value="${escapeHtml(g.key)}">${escapeHtml(g.label)} (${g.count})</option>`).join("");
    [[els.analysisTagSelect, analysisTag, els.analysisTagMode, analysisTagInclude],
      [els.studentTagSelect, studentTag, els.studentTagMode, studentTagInclude],
    ].forEach(([sel, v, seg, include]) => {
      sel.innerHTML = opts;
      sel.value = v;
      sel.classList.toggle("is-filtering", !!v);
      sel.classList.toggle("is-excluding", !!v && !include);
      // With | Without only means something once a tag is chosen.
      seg.hidden = !v;
      seg.parentNode.querySelector(".tag-word").hidden = !v;
      seg.querySelectorAll("[data-mode]").forEach((b) => {
        const on = (b.getAttribute("data-mode") === "with") === include;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.disabled = !v;
      });
    });
    // No tags anywhere yet → hide the filters entirely.
    const none = !tags.length;
    els.analysisTagWrap.hidden = none;
    els.studentTagWrap.hidden = none;
    renderTagSuggest();
  }

  // Small outline chips for a test's tags (Student tab rows, etc.).
  function tagChips(t) {
    return (t.tags || []).map((x) => `<span class="tag-chip">${escapeHtml(x)}</span>`).join(" ");
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
        : blankStudent(n, t));
    t.students = students;
    pinnedIndex = pinnedStudent ? students.indexOf(pinnedStudent) : -1;
    if (pinnedIndex < 0) { pinnedIndex = null; els.pinnedPanel.hidden = true; }
    renderBody();
    applyGradeEmptyState(); // e.g. the first names were just added
    if (pinnedIndex != null) renderPinned();
    updateAnalysis();
    refreshStudentTabIfActive();
    persist();
  }

  function applyQuestionCountEdit() {
    const t = getCurrentTest();
    if (!t || isRubric(t)) return; // the field is hidden for rubric tests
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

  // The Setup-tab "Clear" button empties the selected test's name, type, tags and roster.
  function clearSetupForm() {
    if (!getCurrentTest()) return;
    if (students.length && !window.confirm("Clear this test's name, subject, tags and class list?")) return;
    els.testName.value = "";
    els.testType.value = "";
    els.testTags.value = "";
    els.classList.value = "";
    applyNameEdit();
    applyTypeEdit();
    applyTagsEdit();
    applyClassListEdit();
    els.testName.focus();
  }

  // Reset every mark and Done flag for the current test, keeping the roster.
  // Only clears the live grading type; anything stashed for the other type stays.
  function clearMarks() {
    if (!students.length) return;
    const t = getCurrentTest();
    if (isRubric(t)) {
      if (!window.confirm("Clear all rubric scores, picks, bands and Done flags for every student? The roster and rubric stay.")) return;
      students.forEach((s) => { Object.assign(s, blankStudent(s.name, t)); });
    } else {
      if (!window.confirm("Clear all marks and Done flags for every student? The roster and questions stay.")) return;
      students.forEach((s) => {
        s.marks = s.marks.map(() => "none");
        s.done = false;
      });
    }
    renderBody();
    if (pinnedIndex != null) renderPinned();
    updateAnalysis();
    persist();
  }

  // The question grid (head/body/foot/scores) is Standard; rubric tests hand
  // off to the rubric grid (empty until a rubric is chosen).
  function renderHead() {
    if (isRubric(getCurrentTest())) {
      const template = rubricForTest(getCurrentTest());
      if (template) renderRubricHead(template); else els.gradeHead.innerHTML = "";
      return;
    }
    let html = '<tr><th class="name-col">Student</th>';
    for (let q = 0; q < numQuestions; q++) {
      html += `<th class="q-col">Q${q + 1}</th>`;
    }
    html += '<th class="score-col">Score</th><th class="done-col">Done</th></tr>';
    els.gradeHead.innerHTML = html;
  }

  function renderBody() {
    if (isRubric(getCurrentTest())) {
      const template = rubricForTest(getCurrentTest());
      if (template) renderRubricBody(template);
      else { els.gradeBody.innerHTML = ""; els.gradeFoot.innerHTML = ""; }
      return;
    }
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
    if (pct >= 90) return "exceeds";
    if (pct >= 70) return "meets";
    if (pct >= 51) return "nearly";
    return "notmeet";
  }

  function applyDoneStyling(tr, stu) {
    const done = !!stu.done;
    tr.classList.toggle("row-done", done);
    tr.classList.remove("band-exceeds", "band-meets", "band-nearly", "band-notmeet", "band-none");
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
    marksOf(stu).forEach((m) => {
      if (m === "correct") correct++;
      else if (m === "wrong") wrong++;
      else if (m === "half") half++;
    });
    const attempted = correct + half + wrong;
    const credit = correct + 0.5 * half;
    const pct = attempted ? Math.round((credit / attempted) * 100) : null;
    return { correct, wrong, half, attempted, pct };
  }

  // One stats entry point for both grading types, in the Standard shape plus a band:
  //   { correct, wrong, half, attempted, pct, band, rubric, sum, maxSum }
  // Rubric: attempted = tables scored, pct = points earned ÷ points possible over
  // those tables, and band = the effective band (a manual override wins over the %).
  function statsFor(t, stu) {
    if (!isRubric(t)) {
      const s = studentStats(stu);
      return Object.assign(s, { band: scoreBand(s.pct), rubric: false });
    }
    const template = rubricForTest(t);
    const tot = rubricTotals(template, stu);
    return {
      correct: 0, wrong: 0, half: 0, attempted: tot.scored, pct: tot.pct, rubric: true,
      band: (template && effectiveBand(template, stu)) || "none", sum: tot.sum, maxSum: tot.maxSum,
    };
  }

  function refreshScores() {
    if (isRubric(getCurrentTest())) return; // rubric rows carry their band pill already
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
    if (isRubric(getCurrentTest())) {
      const template = rubricForTest(getCurrentTest());
      if (template) renderRubricFoot(template); else els.gradeFoot.innerHTML = "";
      return;
    }
    let html = '<tr><td class="name-col">Class % correct</td>';
    for (let q = 0; q < numQuestions; q++) {
      let correct = 0, half = 0, attempted = 0;
      students.forEach((stu) => {
        if (marksOf(stu)[q] === "correct") { correct++; attempted++; }
        else if (marksOf(stu)[q] === "half") { half++; attempted++; }
        else if (marksOf(stu)[q] === "wrong") attempted++;
      });
      const pct = attempted ? Math.round(((correct + 0.5 * half) / attempted) * 100) : null;
      html += `<td>${pct === null ? "—" : pct + "%"}</td>`;
    }
    html += "<td></td><td></td></tr>";
    els.gradeFoot.innerHTML = html;
  }

  // Tests the Analysis tab works with: all, or only those with the chosen tag.
  function analysisTests() {
    return tests.filter((t) => tagFilterPasses(t, analysisTag, analysisTagInclude));
  }

  // A subject view with no (tag-matching) tests left falls back to the single test.
  function validateAnalysisMode() {
    if (analysisMode.kind === "type" && !analysisTests().some((t) => typeKeyOf(t) === analysisMode.key)) {
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
    if (isRubric(getCurrentTest())) { updateAnalysisForRubricTest(getCurrentTest()); return; }
    // Single-test view: reset anything the subject / rubric views relabel.
    setAccentVars(els.analysisPanel, null);
    els.hardestTitle.textContent = "Hardest questions";
    els.easiestTitle.textContent = "Easiest questions";
    els.avgChip.setAttribute("data-tip", "Mean of student scores (graded only)");
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
        if (marksOf(stu)[q] === "correct") { correct++; attempted++; }
        else if (marksOf(stu)[q] === "half") { half++; attempted++; }
        else if (marksOf(stu)[q] === "wrong") attempted++;
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

    // Students per band; "meeting" (stat card) still means 70%+, i.e. meets OR exceeds.
    // (With the Exceeds toggle off, 90%+ simply counts as Meets.)
    const bandNamesOf = (b) => gradedStudents.filter((s) => viewBand(scoreBand(s.pct)) === b).map((s) => s.name);
    const exceedsNames = bandNamesOf("exceeds"), meetsOnlyNames = bandNamesOf("meets");
    const nearlyNames = bandNamesOf("nearly"), notMeetNames = bandNamesOf("notmeet");
    const exceedsCount = exceedsNames.length;
    const meetsCount = exceedsCount + meetsOnlyNames.length;
    const nearlyCount = nearlyNames.length;
    const notMeetCount = notMeetNames.length;

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
      const bc = bandCountsText({ exceeds: exceedsNames, meets: meetsOnlyNames, nearly: nearlyNames, notmeet: notMeetNames });
      ins.push({ tone: notMeetCount > meetsCount ? "warn" : "good",
        text: `${bc.text} (of ${n} graded).`, tip: bc.tip });
      if (exceedsCount) ins.push({ tone: "best",
        text: `${exceedsCount} student${exceedsCount !== 1 ? "s" : ""} exceed${exceedsCount === 1 ? "s" : ""} the standard (90%+).`,
        tip: `Exceeds: ${joinNames(exceedsNames)}` });
    }
    if (gradedQs.length) {
      const worst = gradedQs.slice().sort((a, b) => a.pct - b.pct)[0];
      const wrongNames = namesWhere((s) => marksOf(s)[worst.q - 1] === "wrong");
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
      const halfNames = namesWhere((s) => marksOf(s)[topHalfQ.q - 1] === "half");
      ins.push({ tone: "warn",
        text: `${totalHalf} half-credit mark${totalHalf !== 1 ? "s" : ""} given; most on Q${topHalfQ.q} (${topHalfQ.half}).`,
        tip: `Half credit on Q${topHalfQ.q}: ${joinNames(halfNames)}` });

      // Whole-class partial: a question everyone who answered got half on.
      const allHalf = perQuestion.filter((q) => q.attempted > 0 && q.half === q.attempted);
      if (allHalf.length) ins.push({ tone: "info",
        text: `Everyone got partial credit on Q${allHalf.map((q) => q.q).join(", Q")}.`,
        tip: `All answers were half credit: ${allHalf.map((q) => "Q" + q.q).join(", ")}` });

      // Students leaning on partial credit.
      const perStudentHalf = students.map((s) => ({ name: s.name, half: marksOf(s).filter((m) => m === "half").length }));
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
      const skipNames = namesWhere((s) => marksOf(s)[mostSkipped.q - 1] === "none");
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
    const group = analysisTests().filter((t) => typeKeyOf(t) === key).sort(byCreated);
    const label = typeLabelOf(group[0]);
    const color = typeColorOf(group[0]);
    const sums = group.map((t) => ({ t: t, S: summarizeTest(t) }));
    const testName = (t) => t.name || "Untitled test";

    setAccentVars(els.analysisPanel, color);
    els.analysisTitle.innerHTML = `${escapeHtml(label)} ${typeChip(group[0], "title-chip")} ` +
      `<span class="meta title-meta">${group.length} test${group.length !== 1 ? "s" : ""}` +
      (analysisTag ? ` ·${escapeHtml(tagFilterNote(analysisTag, analysisTagInclude))}` : "") + `</span>`;
    els.avgChip.setAttribute("data-tip", "Mean of each student's subject average");
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
    const inBand = (b) => gradedPeople.filter((p) => viewBand(scoreBand(p.avgPct)) === b);
    const exceeds = inBand("exceeds"), meetsOnly = inBand("meets");
    const meets = exceeds.concat(meetsOnly); // "meeting" = 70%+ (meets or exceeds)
    const nearly = inBand("nearly"), notMeet = inBand("notmeet");

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
    if (n) {
      const bc = bandCountsText({ exceeds: names(exceeds), meets: names(meetsOnly), nearly: names(nearly), notmeet: names(notMeet) });
      ins.push({ tone: notMeet.length > meets.length ? "warn" : "good", text: `By average: ${bc.text} (of ${n}).`, tip: bc.tip });
    }
    if (exceeds.length) ins.push({ tone: "best",
      text: `${exceeds.length} student${exceeds.length !== 1 ? "s" : ""} average${exceeds.length === 1 ? "s" : ""} 90%+ (exceeds).`,
      tip: `Exceeds: ${joinNames(names(exceeds))}` });
    // Rubric and standard tests mix by % — say how rubric scores are counted.
    const rubricTests = group.filter(isRubric);
    if (rubricTests.length) ins.push({ tone: "info",
      text: `Includes ${rubricTests.length} rubric-graded test${rubricTests.length !== 1 ? "s" : ""}; ` +
        "scores are points earned ÷ points possible.",
      tip: rubricTests.map(testName).join("\n") });

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

    // ---- charts: pie by subject average; class average over time (date order) ----
    renderScorePie(gradedPeople.map((p) => ({ name: p.name, pct: p.avgPct, done: true, attempted: 1 })));
    renderTrendChart(sums.map((x) => ({
      name: testName(x.t),
      pct: x.S.mean,
      tip: `${testName(x.t)}` + (x.t.createdAt != null ? ` (${shortDate(x.t.createdAt)})` : "") +
        `\n${x.S.mean == null ? "Not graded yet" : x.S.mean + "% class average · " + x.S.n + " graded"}`,
    })), color);

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

  // -------------------------------------------------------------------------
  // Single rubric test. Fills the same DOM slots as the other views (so the
  // layout and Print PDF keep working): bands come from each student's
  // effective band, bars are one per rubric table.
  // -------------------------------------------------------------------------
  function updateAnalysisForRubricTest(t) {
    const template = rubricForTest(t);
    setAccentVars(els.analysisPanel, null);
    els.hardestTitle.textContent = "Lowest-scoring tables";
    els.easiestTitle.textContent = "Highest-scoring tables";
    els.avgChip.setAttribute("data-tip", "Mean of student scores — points earned ÷ points possible across the tables scored");
    syncTestTitle();
    const pc = (v) => (v == null ? "—" : v + "%");
    const short = (s) => (s.length > 8 ? s.slice(0, 7) + "…" : s);

    if (!template) {
      els.statCards.innerHTML = [card(students.length, "Students"), card("—", "Tables")].join("");
      els.avgChipNum.textContent = "—";
      els.insightStrip.innerHTML = '<div class="insight tone-info">Choose a rubric for this test on the Setup tab to see its analysis.</div>';
      renderScorePie([]);
      drawBars([], { title: "Average score by table" });
      ["hardestList", "easiestList", "topList", "strugglingList"].forEach((id) => {
        els[id].innerHTML = '<li class="meta">No rubric chosen yet.</li>';
      });
      return;
    }

    // ---- per student ----
    const per = students.map((stu) => {
      const s = Object.assign({ name: stu.name, done: !!stu.done, manual: !!stu.bandManual }, statsFor(t, stu));
      s.band = viewBand(s.band); // Exceeds toggle off → shown as Meets
      return s;
    });
    const graded = per.filter((s) => s.attempted > 0 && s.pct != null);
    const pcts = graded.map((s) => s.pct);
    const n = pcts.length;
    const meanPct = n ? Math.round(pcts.reduce((a, b) => a + b, 0) / n) : null;
    const namesIn = (b) => graded.filter((s) => s.band === b).map((s) => s.name);
    const exceedsN = namesIn("exceeds"), meetsN = namesIn("meets"), nearlyN = namesIn("nearly"), notMeetN = namesIn("notmeet");
    const meetsCount = exceedsN.length + meetsN.length; // "meeting" = meets or exceeds
    const fullyDone = per.filter((s) => s.done).length;

    // ---- per table: mean score, as % of the table's top score, colored by the nearest level ----
    const perTable = template.tables.map((tb) => {
      const vals = students.map((s) => scoreOf(s, tb)).filter((v) => v != null);
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const max = tableMax(tb);
      let near = -1;
      if (mean != null) {
        let bestD = Infinity;
        tb.cols.forEach((c, i) => {
          const d = Math.abs(c.score - mean);
          if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && c.score > tb.cols[near].score)) { near = i; bestD = d; }
        });
      }
      return { tb, n: vals.length, mean, max, pct: mean == null || !max ? null : Math.round((mean / max) * 100),
        color: near === -1 ? null : RUBRIC_COLORS[shownRubricColor(tb.cols[near].color)] };
    });
    const scoredTables = perTable.filter((x) => x.mean != null);
    const meanTxt = (x) => `${fmtNum(+x.mean.toFixed(1))} / ${fmtNum(x.max)}`;

    // ---- stat cards ----
    els.statCards.innerHTML = [
      card(students.length, "Students"),
      card(template.tables.length, "Tables", template.name),
      card(pc(meanPct), "Class average", "Mean of student scores (points earned ÷ points possible)"),
      card(n ? Math.min.apply(null, pcts) + "–" + Math.max.apply(null, pcts) + "%" : "—", "Range", "Lowest to highest score"),
      card(n ? `${meetsCount}/${n} <span class="num-sub">${Math.round((meetsCount / n) * 100)}%</span>` : "—",
        "Students Meeting", "Students whose band is Meets or Exceeds"),
      card(`${fullyDone}/${students.length}`, "Graded", "Rows marked Done"),
    ].join("");
    els.avgChipNum.textContent = pc(meanPct);

    // ---- highlights ----
    const joinNames = (arr) => (arr.length ? arr.join(", ") : "(none)");
    const ins = [];
    const donePct = students.length ? Math.round((fullyDone / students.length) * 100) : 0;
    ins.push({ tone: "info", text: `Grading ${donePct}% complete — ${fullyDone} of ${students.length} marked done.`,
      tip: `Not done: ${joinNames(per.filter((s) => !s.done).map((s) => s.name))}` });
    if (n) {
      const bc = bandCountsText({ exceeds: exceedsN, meets: meetsN, nearly: nearlyN, notmeet: notMeetN });
      ins.push({ tone: notMeetN.length > meetsCount ? "warn" : "good", text: `${bc.text} (of ${n} scored).`, tip: bc.tip });
      if (exceedsN.length) ins.push({ tone: "best",
        text: `${exceedsN.length} student${exceedsN.length !== 1 ? "s" : ""} exceed${exceedsN.length === 1 ? "s" : ""} the standard.`,
        tip: `Exceeds: ${joinNames(exceedsN)}` });
    }
    if (scoredTables.length) {
      const asc = scoredTables.slice().sort((a, b) => a.pct - b.pct);
      const low = asc[0], high = asc[asc.length - 1];
      ins.push({ tone: low.pct <= 50 ? "bad" : "warn", text: `Lowest table: ${escapeHtml(low.tb.title)} at ${meanTxt(low)}.`,
        tip: `${low.n} of ${students.length} scored · ${low.pct}% of the top score` });
      if (high.pct > low.pct) ins.push({ tone: "good", text: `Highest table: ${escapeHtml(high.tb.title)} at ${meanTxt(high)}.`,
        tip: `${high.n} of ${students.length} scored · ${high.pct}% of the top score` });
    }
    const partial = per.filter((s) => s.attempted < template.tables.length);
    if (partial.length) ins.push({ tone: "warn",
      text: `${partial.length} student${partial.length !== 1 ? "s haven't" : " hasn't"} been scored on every table.`,
      tip: partial.map((s) => `${s.name} (${s.attempted} of ${template.tables.length})`).join("\n") });
    const manual = per.filter((s) => s.manual);
    if (manual.length) ins.push({ tone: "info",
      text: `${manual.length} band${manual.length !== 1 ? "s" : ""} set by hand.`,
      tip: manual.map((s) => `${s.name}: ${BAND_LABEL[s.band] || "—"}`).join("\n") });
    els.insightStrip.innerHTML = ins.map((i) =>
      `<div class="insight tone-${i.tone}" data-tip="${escapeHtml(i.tip || "")}">${i.text}</div>`).join("");

    // ---- charts: pie by effective band (Done students); one bar per table ----
    renderScorePie(per.filter((s) => s.done && s.attempted > 0).map((s) => ({ name: s.name, pct: s.pct, band: s.band })));
    drawBars(perTable.map((x) => ({
      pct: x.pct, color: x.color || undefined, label: short(x.tb.title),
      tip: x.mean == null ? `${x.tb.title}: not scored yet` : `${x.tb.title}: avg ${meanTxt(x)} (${x.pct}%)`,
    })), { title: "Average score by table", aria: "Average score for each rubric table" });

    // ---- lowest / highest tables; top / bottom students ----
    const tLi = (x) => `<li>${escapeHtml(x.tb.title)} <span class="meta">${meanTxt(x)} (${x.pct}%)</span></li>`;
    els.hardestList.innerHTML = scoredTables.slice().sort((a, b) => a.pct - b.pct).slice(0, 3).map(tLi).join("") ||
      '<li class="meta">No tables scored yet.</li>';
    els.easiestList.innerHTML = scoredTables.slice().sort((a, b) => b.pct - a.pct).slice(0, 3).map(tLi).join("") ||
      '<li class="meta">No tables scored yet.</li>';
    const sLi = (s) => `<li>${escapeHtml(s.name)} <span class="meta">${s.pct}% (${fmtNum(s.sum)}/${fmtNum(s.maxSum)})` +
      `${BAND_SHORT[s.band] ? " · " + BAND_SHORT[s.band] : ""}</span></li>`;
    els.topList.innerHTML = graded.slice().sort((a, b) => b.pct - a.pct).slice(0, 5).map(sLi).join("") ||
      '<li class="meta">No students scored yet.</li>';
    els.strugglingList.innerHTML = graded.slice().sort((a, b) => a.pct - b.pct).slice(0, 5).map(sLi).join("") ||
      '<li class="meta">No students scored yet.</li>';
  }

  // --- score-distribution pie chart (pure SVG, no dependencies) ---
  // graded: [{ name, pct, band? }] — an explicit band (e.g. a rubric override)
  // wins over the band of the %.
  function renderScorePie(graded) {
    const byBand = { exceeds: [], meets: [], nearly: [], notmeet: [] };
    graded.forEach((s) => {
      const b = viewBand(s.band && byBand[s.band] ? s.band : scoreBand(s.pct));
      if (byBand[b]) byBand[b].push(s.name);
    });

    // Best band first (legend order; the PDF legend reads the same order).
    // Exceeds toggle off → three slices, Meets = 70% and up.
    const buckets = shownBands().slice().reverse().map((b) => ({
      label: BAND_LABEL[b], range: shownRange(b), names: byBand[b], count: byBand[b].length, color: BAND_COLOR[b],
    }));
    const total = buckets.reduce((a, b) => a + b.count, 0);

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
    if (pct == null) return "#cdd3dd";
    return BAND_COLOR[viewBand(scoreBand(pct))]; // only used on Analysis, so it follows the Exceeds toggle
  }

  // One bar per question: [{ q, pct, correct, attempted }].
  function renderQuestionBars(perQuestion) {
    drawBars(perQuestion.map((s) => ({
      pct: s.pct,
      label: String(s.q),
      tip: s.attempted ? `Q${s.q}: ${s.pct}% (${s.correct}/${s.attempted})` : `Q${s.q}: not graded`,
    })), { title: "% correct by question", aria: "Percent correct for each question" });
  }

  // Bars in the Analysis hero chart. items: [{ pct (0–100 or null), label, tip, color? }].
  // Short text labels (e.g. rubric table titles) are spaced out so they don't collide.
  function drawBars(items, opts) {
    els.barTitle.textContent = opts.title;
    els.questionBars.setAttribute("aria-label", opts.aria || opts.title);
    els.questionBars.setAttribute("viewBox", "0 0 520 220"); // the trend chart resizes it
    const W = 520, H = 220;
    const m = { top: 10, right: 6, bottom: 22, left: 26 };
    const plotW = W - m.left - m.right;
    const plotH = H - m.top - m.bottom;
    const n = items.length;

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
    const longest = Math.max.apply(null, items.map((s) => String(s.label).length).concat([1]));
    const labelEvery = longest > 3
      ? Math.max(1, Math.ceil((n * (longest * 5 + 6)) / plotW)) // ~5 units per character at font-size 8
      : (n <= 20 ? 1 : Math.ceil(n / 15));

    items.forEach((s, i) => {
      const cx = m.left + slot * (i + 0.5);
      const x = cx - bw / 2;
      const pct = s.pct == null ? 0 : s.pct;
      const h = plotH * (pct / 100);
      const top = m.top + plotH - h;
      svg += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" ` +
        `height="${Math.max(0, h).toFixed(1)}" rx="1.5" fill="${s.color || barColor(s.pct)}" ` +
        `data-tip="${escapeHtml(s.tip)}"></rect>`;
      if (i % labelEvery === 0) {
        svg += `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" ` +
          `font-size="8" fill="#1f2733">${escapeHtml(String(s.label))}</text>`;
      }
    });

    // Axes (black)
    svg += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + plotH}" stroke="#1f2733" stroke-width="1.5"/>`;
    svg += `<line x1="${m.left}" y1="${m.top + plotH}" x2="${W - m.right}" y2="${m.top + plotH}" stroke="#1f2733" stroke-width="1.5"/>`;

    els.questionBars.innerHTML = svg;
  }

  // --- subject view: class average over time — dot plot + trend line (pure SVG) ---
  // points: [{ name, pct (null = not graded), tip }] oldest first; color = subject color.
  // Draws into the same <svg> as the question bars so Print PDF picks it up.
  function renderTrendChart(points, color) {
    els.barTitle.textContent = "Class average over time";
    const svgEl = els.questionBars;
    svgEl.setAttribute("aria-label", "Class average for each test, oldest to newest, with a trend line");
    // Match the coordinate system to the chart's real on-screen size, so font
    // sizes below are true pixels (readable) instead of being scaled down.
    const W = Math.round(svgEl.clientWidth) || 520;
    const H = Math.max(240, Math.min(340, Math.round(W * 0.55)));
    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const n = points.length;
    // Trend line in a mid shade of the subject color, its label in the dark shade.
    const ink = "#1f2733";
    const lineColor = color ? shadeOf(color, 0.5) : "#3b6cff", labelColor = color ? inkOf(color) : "#3b6cff";

    // Test-name labels: wrap onto up to two lines; tilt only if they still can't fit.
    const NAME_FONT = 14, CHAR_W = NAME_FONT * 0.56;
    const m0 = { top: 30, right: 20, left: 50 };
    const slot0 = (W - m0.left - m0.right) / Math.max(1, n);
    const perLine = Math.floor((slot0 - 8) / CHAR_W);
    const cut = (s, max) => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s);
    const wrap2 = (name, max) => {
      const words = name.split(/\s+/);
      let line1 = "";
      while (words.length && (line1 ? line1 + " " + words[0] : words[0]).length <= max) {
        line1 = line1 ? line1 + " " + words.shift() : words.shift();
      }
      if (!line1) return [cut(name, max)];           // first word alone is too long
      return words.length ? [line1, cut(words.join(" "), max)] : [line1];
    };
    const tilt = perLine < 6;
    const labels = points.map((p) => (tilt ? [cut(p.name, 16)] : wrap2(p.name, perLine)));
    const lines = Math.max.apply(null, labels.map((l) => l.length).concat([1]));
    const longest = Math.max.apply(null, labels.map((l) => l[0].length).concat([1]));
    const m = Object.assign({}, m0, {
      bottom: tilt ? Math.min(110, 22 + longest * CHAR_W * 0.6) : 14 + lines * (NAME_FONT + 3),
    });
    const plotW = W - m.left - m.right, plotH = H - m.top - m.bottom;
    const slot = plotW / Math.max(1, n);
    const xAt = (i) => m.left + slot * (i + 0.5);
    const yAt = (pct) => m.top + plotH * (1 - pct / 100);

    let svg = `<g font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">`;

    // Gridlines + Y labels every 25%
    [0, 25, 50, 75, 100].forEach((g) => {
      const gy = yAt(g).toFixed(1);
      svg += `<line x1="${m.left}" y1="${gy}" x2="${W - m.right}" y2="${gy}" stroke="#e2e7ef" stroke-width="1"/>`;
      svg += `<text x="${m.left - 8}" y="${(+gy + 4.5).toFixed(1)}" text-anchor="end" font-size="13" fill="${ink}">${g}%</text>`;
    });

    // X labels (test names, oldest → newest)
    labels.forEach((l, i) => {
      const x = xAt(i).toFixed(1), y = m.top + plotH + (tilt ? 14 : NAME_FONT + 6);
      const fill = points[i].pct == null ? "#9aa3b2" : ink;
      const full = `<title>${escapeHtml(points[i].name)}</title>`;
      svg += tilt
        ? `<text x="${x}" y="${y}" text-anchor="end" font-size="${NAME_FONT}" font-weight="600" fill="${fill}" ` +
          `transform="rotate(-35 ${x} ${y})">${full}${escapeHtml(l[0])}</text>`
        : `<text x="${x}" y="${y}" text-anchor="middle" font-size="${NAME_FONT}" font-weight="600" fill="${fill}">${full}` +
          l.map((t, k) => `<tspan x="${x}" dy="${k ? NAME_FONT + 3 : 0}">${escapeHtml(t)}</tspan>`).join("") + "</text>";
    });

    // Axes (black)
    svg += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + plotH}" stroke="${ink}" stroke-width="1.5"/>`;
    svg += `<line x1="${m.left}" y1="${m.top + plotH}" x2="${W - m.right}" y2="${m.top + plotH}" stroke="${ink}" stroke-width="1.5"/>`;

    // Trend line: least-squares fit through the graded tests (needs 2+).
    const graded = points.map((p, i) => ({ i, pct: p.pct })).filter((p) => p.pct != null);
    if (graded.length >= 2) {
      const xm = graded.reduce((a, p) => a + p.i, 0) / graded.length;
      const ym = graded.reduce((a, p) => a + p.pct, 0) / graded.length;
      const sxx = graded.reduce((a, p) => a + (p.i - xm) * (p.i - xm), 0);
      const slope = sxx ? graded.reduce((a, p) => a + (p.i - xm) * (p.pct - ym), 0) / sxx : 0;
      const fit = (i) => Math.max(0, Math.min(100, ym + slope * (i - xm)));
      const i0 = graded[0].i, i1 = graded[graded.length - 1].i;
      const step = Math.abs(slope) < 0.05 ? "flat" : `${slope > 0 ? "+" : "−"}${Math.abs(slope).toFixed(1)} pts per test`;
      const tip = `Trend: ${step}`;
      const line = `x1="${xAt(i0).toFixed(1)}" y1="${yAt(fit(i0)).toFixed(1)}" x2="${xAt(i1).toFixed(1)}" y2="${yAt(fit(i1)).toFixed(1)}"`;
      svg += `<line ${line} stroke="${lineColor}" stroke-width="2.5" stroke-dasharray="7 5" stroke-linecap="round" opacity="0.85"/>`;
      svg += `<line ${line} stroke="transparent" stroke-width="12" data-tip="${escapeHtml(tip)}"/>`; // wide hover target
      const arrow = Math.abs(slope) < 0.05 ? "■" : slope > 0 ? "▲" : "▼";
      svg += `<text x="${W - m.right}" y="17" text-anchor="end" font-size="14" font-weight="700" fill="${labelColor}">` +
        `${arrow} Trend: ${step}</text>`;
    } else {
      svg += `<text x="${W - m.right}" y="17" text-anchor="end" font-size="13" fill="#9aa3b2">` +
        `Grade at least 2 tests to see a trend</text>`;
    }

    // Dots (band-colored), drawn last so they sit on top of the trend line
    graded.forEach((p) => {
      svg += `<circle cx="${xAt(p.i).toFixed(1)}" cy="${yAt(p.pct).toFixed(1)}" r="8" fill="${barColor(p.pct)}" ` +
        `stroke="#fff" stroke-width="2.5" data-tip="${escapeHtml(points[p.i].tip)}"/>`;
    });

    els.questionBars.innerHTML = svg + "</g>";
  }

  // -------------------------------------------------------------------------
  // Compare tab — two tests side by side (e.g. pre-test vs post-test).
  // Read-only: never modifies tests or saved data. Students match by name.
  // -------------------------------------------------------------------------
  function summarizeTest(t) {
    const perStudent = t.students.map((stu) => ({ name: stu.name, ...statsFor(t, stu) }));
    const graded = perStudent.filter((s) => s.attempted > 0 && s.pct != null);
    const pcts = graded.map((s) => s.pct);
    const n = pcts.length;
    const bandNames = { exceeds: [], meets: [], nearly: [], notmeet: [] };
    graded.forEach((s) => { const b = viewBand(s.band); if (bandNames[b]) bandNames[b].push(s.name); });

    // Per-question % correct (Standard tests only; rubric tests have no questions).
    const perQuestion = [];
    for (let q = 0; !isRubric(t) && q < t.numQuestions; q++) {
      let correct = 0, half = 0, attempted = 0;
      t.students.forEach((stu) => {
        const m = marksOf(stu)[q];
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
      rubric: isRubric(t),
      numQuestions: isRubric(t) ? 0 : t.numQuestions,
      perStudent, byName, n, bandNames, perQuestion,
      mean: n ? Math.round(pcts.reduce((a, b) => a + b, 0) / n) : null,
      low: n ? Math.min.apply(null, pcts) : null,
      high: n ? Math.max.apply(null, pcts) : null,
      // "Meeting" = 70%+, so it counts exceeds too.
      meets: bandNames.meets.length + bandNames.exceeds.length,
      meetsPct: n ? Math.round(((bandNames.meets.length + bandNames.exceeds.length) / n) * 100) : null,
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
      const c = typeInkOf(t);
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
      const segs = shownBands().filter((b) => S.bandNames[b].length).map((b) => {
        const c = S.bandNames[b].length;
        const tip = `${BAND_LABEL[b]} (${c}):\n` + S.bandNames[b].join("\n");
        return `<div class="band-seg" style="width:${(c / S.n) * 100}%;background:${BAND_COLOR[b]}" ` +
          `data-tip="${escapeHtml(tip)}"><span class="band-num">${c}</span></div>`;
      }).join("");
      return `<div class="band-row"><span class="band-row-lbl">${label}</span>` +
        `<div class="band-track">${segs || '<div class="band-empty">no data</div>'}</div></div>`;
    };
    els.compareBands.innerHTML = bandRow("Before", A) + bandRow("After", B);
    // Legend under the band bars, worst → best like the bars (follows the Exceeds toggle).
    els.compareBandLegend.innerHTML = shownBands().map((b) =>
      `<li data-tip="${shownRange(b)}"><span class="swatch" style="background:${BAND_COLOR[b]}"></span>${BAND_LABEL[b]}</li>`).join("");

    // ---- per-question grouped bars (Standard vs Standard only) ----
    const noQuestions = A.rubric || B.rubric;
    els.compareBars.hidden = noQuestions;
    els.compareBarsLegend.hidden = noQuestions;
    els.compareBarsNote.hidden = !noQuestions;
    els.compareBarsNote.textContent = A.rubric && B.rubric
      ? "Rubric tests have no questions — per-question comparison hidden. Compare their tables on the Analysis tab."
      : "Questions and rubric tables don't line up — per-question comparison hidden.";
    if (!noQuestions) renderCompareBars(A, B);
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
        // Bands come from the stats (a rubric band may be a manual override).
        aBand: aPct != null ? viewBand(a.band) : null, bBand: bPct != null ? viewBand(b.band) : null,
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
      const rank = (b) => BANDS.indexOf(b);
      const MEETS = rank("meets");
      const up = both.filter((r) => rank(r.bBand) > rank(r.aBand)).map((r) => r.name);
      const down = both.filter((r) => rank(r.bBand) < rank(r.aBand)).map((r) => r.name);
      const newlyMeet = both.filter((r) => rank(r.aBand) < MEETS && rank(r.bBand) >= MEETS).map((r) => r.name);
      if (up.length) ins.push({ tone: "good",
        text: `${up.length} student${up.length !== 1 ? "s" : ""} moved up a band.`,
        tip: `Moved up: ${joinNames(up)}` });
      if (newlyMeet.length) ins.push({ tone: "good",
        text: `${newlyMeet.length} student${newlyMeet.length !== 1 ? "s" : ""} now meet${newlyMeet.length === 1 ? "s" : ""} the standard.`,
        tip: `Now meeting (Meets or Exceeds): ${joinNames(newlyMeet)}` });
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
    if (!noQuestions && A.numQuestions !== B.numQuestions) ins.push({ tone: "info",
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
    const scoreCell = (entry, pct, band) => {
      if (!entry) return '<td class="num-col score-cell"><span class="cmp-missing">not on test</span></td>';
      if (pct == null) return '<td class="num-col score-cell">—</td>';
      return `<td class="num-col score-cell band-${band}">${pct}%</td>`;
    };
    const rowHtml = (r) =>
      `<tr><td>${escapeHtml(r.name)}</td>` +
      scoreCell(r.a, r.aPct, r.aBand) +
      '<td class="arrow-col">&rarr;</td>' +
      scoreCell(r.b, r.bPct, r.bBand) +
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

    // Every (tag-matching) test this student is on (first roster match per test).
    // The student list itself always comes from all tests, so a pick never vanishes.
    const pool = tests.filter((t) => tagFilterPasses(t, studentTag, studentTagInclude));
    const tagNote = tagFilterNote(studentTag, studentTagInclude);
    const entries = [];
    pool.forEach((t) => {
      const stu = t.students.find((s) => nameKey(s.name) === studentSelKey);
      if (stu) entries.push({ test: t, stu, stats: statsFor(t, stu), createdAt: t.createdAt });
    });
    const graded = entries.filter((e) => e.stats.attempted > 0 && e.stats.pct != null);

    els.studentTitle.textContent = roster[studentSelKey];
    els.studentMeta.textContent = `on ${entries.length} test${entries.length !== 1 ? "s" : ""}${tagNote}`;

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
    const groupInfo = {};
    groupKeys.forEach((k) => {
      const list = groups[k].slice().sort(byCreated);
      const g = list.filter((e) => e.stats.attempted > 0);
      groupInfo[k] = {
        list: list,
        color: k ? typeColorOf(list[0].test) : null,
        label: k ? typeLabelOf(list[0].test) : "No subject",
        graded: g.length,
        avg: g.length ? Math.round(g.reduce((a, e) => a + e.stats.pct, 0) / g.length) : null,
      };
    });

    // ---- stat cards: an average per subject (not overall), …, Tests taken last ----
    const best = graded.slice().sort((a, b) => b.stats.pct - a.stats.pct)[0];
    const worst = graded.slice().sort((a, b) => a.stats.pct - b.stats.pct)[0];
    const testCard = (e, lbl) => e
      ? card(`${e.stats.pct}% <span class="num-sub">${escapeHtml(e.test.name || "Untitled test")}</span>`, lbl, e.test.name)
      : card("—", lbl);
    const typeAvgCard = (k) => {
      const gi = groupInfo[k];
      const tip = `Mean of ${gi.graded} graded ${gi.label} test${gi.graded !== 1 ? "s" : ""}`;
      return `<div class="stat-card type-avg-card"${gi.color ? ` style="--type-color:${gi.color}"` : ""} ` +
        `data-tip="${escapeHtml(tip)}"><div class="num">${gi.avg == null ? "—" : gi.avg + "%"}</div>` +
        `<div class="lbl">${escapeHtml(gi.label)} average</div></div>`;
    };
    els.studentCards.innerHTML = groupKeys.map(typeAvgCard).concat([
      testCard(best, "Best test"),
      testCard(worst, "Lowest test"),
      card(`${entries.length} <span class="num-sub">/ ${pool.length}</span>`, "Tests taken",
        studentTag ? `On ${entries.length} of the ${pool.length} tests${tagNote}`
          : `On ${entries.length} of the ${pool.length} tests in the app`),
    ]).join("");

    if (!entries.length) {
      els.studentGroups.innerHTML = `<p class="cmp-missing student-none">${escapeHtml(roster[studentSelKey])} ` +
        `isn't on any tests${escapeHtml(tagNote)}.</p>`;
      return;
    }

    els.studentGroups.innerHTML = groupKeys.map((k) => {
      const { list, color, label, avg: gAvg } = groupInfo[k];

      const rowsHtml = list.map((e) => {
        const t = e.test, s = e.stats;
        const date = t.createdAt != null ? shortDate(t.createdAt) : "date unknown";
        const classAvg = summarizeTest(t).mean;
        const scored = s.attempted > 0 && s.pct != null;
        const band = viewBand(s.band); // Exceeds toggle off → shown as Meets
        let detail, size, pill;
        if (s.rubric) {
          // Rubric: one chip per table ("Thesis 4") in its level's color, and the
          // band (which may be a manual override) instead of a % — % is in the tooltip.
          const template = rubricForTest(t);
          const tbls = template ? template.tables : [];
          detail = `<div class="str-tables">` + tbls.map((tb) => {
            const v = scoreOf(e.stu, tb), c = colForScore(tb, v);
            if (c === -1) return `<span class="rt-chip unscored">${escapeHtml(tb.title)} —</span>`;
            const k = shownRubricColor(tb.cols[c].color);
            return `<span class="rt-chip" style="background:${RUBRIC_COLOR_BG[k]};border-color:${RUBRIC_COLORS[k]}">` +
              `${escapeHtml(tb.title)} <strong>${fmtNum(v)}</strong></span>`;
          }).join("") + "</div>";
          size = `${tbls.length} table${tbls.length !== 1 ? "s" : ""} · rubric`;
          pill = `<span class="score-pill band-${band}" data-tip="${scored ? `${s.pct}% (${fmtNum(s.sum)}/${fmtNum(s.maxSum)})` +
            (e.stu.bandManual ? " · band set by hand" : "") : "Not scored yet"}">${BAND_SHORT[band] || "—"}</span>`;
        } else {
          detail = `<div class="str-marks">` + marksOf(e.stu).map((m, q) =>
            `<span class="cell state-${m}" data-tip="Q${q + 1}: ${m === "none" ? "blank" : m}">${GLYPH[m]}</span>`).join("") + "</div>";
          size = `${t.numQuestions} question${t.numQuestions !== 1 ? "s" : ""}`;
          pill = `<span class="score-pill band-${band}">${scored ? s.pct + "%" : "—"}</span>`;
        }
        return `<div class="student-test-row">` +
          `<div class="str-head">${typeChip(t)} <strong>${escapeHtml(t.name || "Untitled test")}</strong> ` +
          `${tagChips(t)} <span class="meta">${date} · ${size}</span> ` + pill + " " +
          `<span class="class-avg-chip" data-tip="Mean score of everyone graded on this test">` +
          `Class average: ${classAvg == null ? "—" : classAvg + "%"}</span>` +
          (e.stu.done ? ' <span class="done-badge">Done ✓</span>' : "") +
          `<button type="button" class="link-btn" data-open-test="${t.id}">Open in Grade</button></div>` +
          detail + "</div>";
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
  // Rubric templates — shared by every rubric test, persisted as
  // state.rubricTemplates. A template is
  //   { id, name, createdAt, updatedAt, tables: [Table] }
  //   Table: { id, title, cols: [{ score, color }], rows: [[text, ...], ...] }
  // cols and rows are each 2..10 and every row has one cell per column. A
  // column's color is one of the four band colors, so the rubric's own
  // coloring drives the suggested band (blue = exceeds … red = does not meet).
  // -------------------------------------------------------------------------
  let rubricTemplates = [];
  const RUBRIC_MIN = 2, RUBRIC_MAX = 10;
  const RUBRIC_COLORS = { blue: BAND_COLOR.exceeds, green: BAND_COLOR.meets, amber: BAND_COLOR.nearly, red: BAND_COLOR.notmeet };
  const RUBRIC_COLOR_BG = { blue: BAND_BG.exceeds, green: BAND_BG.meets, amber: BAND_BG.nearly, red: BAND_BG.notmeet };
  const RUBRIC_COLOR_RANK = { red: 0, amber: 1, green: 2, blue: 3 }; // higher = better; = index into BANDS
  const RUBRIC_COLOR_ORDER = ["blue", "green", "amber", "red"];    // swatch order, best → worst
  const RUBRIC_COLOR_LABEL = { blue: "Blue — exceeds", green: "Green — meets", amber: "Amber — nearly", red: "Red — does not meet" };
  let rubricCounter = 0;
  const genRubricId = () => "r" + (++rubricCounter) + "_" + Date.now();
  const genTableId = () => "rt" + (++rubricCounter) + "_" + Date.now();

  // Default column colors, best → worst by position.
  function defaultRubricColors(n) {
    if (n <= 2) return ["green", "red"].slice(0, n);
    if (n === 3) return ["green", "amber", "red"];
    return Array.from({ length: n }, (_, i) => {
      const rank = Math.round(3 - (3 * i) / (n - 1)); // first = blue (3) … last = red (0)
      return Object.keys(RUBRIC_COLOR_RANK).find((c) => RUBRIC_COLOR_RANK[c] === rank);
    });
  }

  // Clamp sizes to 2..10, coerce scores/colors/text; keeps ids when present.
  function sanitizeRubric(r) {
    if (!r || typeof r !== "object") return null;
    const tables = (Array.isArray(r.tables) ? r.tables : []).map((tb, ti) => {
      tb = tb || {};
      let cols = (Array.isArray(tb.cols) ? tb.cols : []).slice(0, RUBRIC_MAX);
      while (cols.length < RUBRIC_MIN) cols.push({});
      cols = cols.map((c, i) => {
        c = c || {};
        const n = Number(c.score);
        const color = String(c.color || "").toLowerCase();
        return {
          score: c.score !== "" && c.score != null && Number.isFinite(n) ? n : cols.length - i,
          color: RUBRIC_COLORS[color] ? color : "green",
        };
      });
      let rows = (Array.isArray(tb.rows) ? tb.rows : []).slice(0, RUBRIC_MAX);
      while (rows.length < RUBRIC_MIN) rows.push([]);
      rows = rows.map((row) => {
        const cells = (Array.isArray(row) ? row : []).slice(0, cols.length).map((x) => String(x == null ? "" : x));
        while (cells.length < cols.length) cells.push("");
        return cells;
      });
      return {
        id: typeof tb.id === "string" && tb.id ? tb.id : genTableId(),
        title: String(tb.title || "").trim() || `Table ${ti + 1}`,
        cols, rows,
      };
    });
    const now = Date.now();
    return {
      id: typeof r.id === "string" && r.id ? r.id : genRubricId(),
      name: String(r.name || "").trim() || "Untitled rubric",
      createdAt: Number.isFinite(r.createdAt) ? r.createdAt : now,
      updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : now,
      tables,
    };
  }

  // ---- helpers ----
  const getRubric = (id) => rubricTemplates.find((r) => r.id === id) || null;
  const rubricForTest = (t) => (isRubric(t) && t.rubricTemplateId ? getRubric(t.rubricTemplateId) : null);
  const tableMax = (tb) => Math.max.apply(null, tb.cols.map((c) => c.score));
  const tableMin = (tb) => Math.min.apply(null, tb.cols.map((c) => c.score));
  // Column holding a given score in a table (scores are unique within a table), or -1.
  const colForScore = (tb, score) => (score == null ? -1 : tb.cols.findIndex((c) => c.score === score));

  // Points earned ÷ points possible over the tables scored so far.
  function rubricTotals(template, stu) {
    let scored = 0, sum = 0, maxSum = 0;
    const tables = template ? template.tables : [];
    tables.forEach((tb) => {
      const v = (stu.scores || {})[tb.id];
      if (v == null || colForScore(tb, v) === -1) return;
      scored++;
      sum += v;
      maxSum += tableMax(tb);
    });
    return { scored, tables: tables.length, sum, maxSum, pct: maxSum ? Math.round((100 * sum) / maxSum) : null };
  }

  // Suggested band = mean color rank of the chosen columns; .5 rounds DOWN
  // (conservative: 2.5 → meets). Uses the rubric's header colors, so a rubric
  // whose top level is green never suggests Exceeds.
  function suggestBand(template, stu) {
    if (!template) return null;
    const ranks = [];
    template.tables.forEach((tb) => {
      const c = colForScore(tb, (stu.scores || {})[tb.id]);
      if (c !== -1) ranks.push(RUBRIC_COLOR_RANK[tb.cols[c].color]);
    });
    if (!ranks.length) return null;
    const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    return BANDS[Math.ceil(mean - 0.5)];
  }

  const effectiveBand = (template, stu) => (stu.bandManual ? stu.band : suggestBand(template, stu));

  // Tests that use a template — live, or stashed while the test is Standard.
  function templateUsers(id) {
    return tests.filter((t) => (isRubric(t) && t.rubricTemplateId === id) ||
      (t.stash && t.stash.rubric && t.stash.rubric.rubricTemplateId === id));
  }

  // After a template is edited: drop scores/picks that no longer fit and
  // refresh auto bands.
  function reconcileRubricStudents(list, template) {
    const byId = {};
    template.tables.forEach((tb) => { byId[tb.id] = tb; });
    list.forEach((s) => {
      s.scores = s.scores || {};
      s.picks = s.picks || {};
      Object.keys(s.scores).forEach((k) => {
        if (!byId[k]) delete s.scores[k];
        else if (s.scores[k] != null && colForScore(byId[k], s.scores[k]) === -1) s.scores[k] = null;
      });
      Object.keys(s.picks).forEach((k) => {
        const tb = byId[k];
        if (!tb) delete s.picks[k];
        else s.picks[k] = s.picks[k].filter((p) => p[0] < tb.rows.length && p[1] < tb.cols.length);
      });
      if (!s.bandManual) s.band = suggestBand(template, s);
    });
  }

  // Did an edit remove/resize a table or change any score value?
  function rubricStructureChanged(oldR, newR) {
    return oldR.tables.some((ot) => {
      const nt = newR.tables.find((x) => x.id === ot.id);
      if (!nt) return true;
      if (nt.rows.length !== ot.rows.length || nt.cols.length !== ot.cols.length) return true;
      return ot.cols.some((c, i) => c.score !== nt.cols[i].score);
    });
  }

  // -------------------------------------------------------------------------
  // One table renderer, three modes:
  //   "edit" — score inputs, color swatches and text areas (the editor)
  //   "view" — read-only (the table viewer), optional highlightCol
  //   "pick" — read-only text, cells toggle as picks (the student panel)
  // -------------------------------------------------------------------------
  function renderRubricTableHtml(tb, o) {
    o = o || {};
    const mode = o.mode || "view";
    const picked = {};
    (o.picks || []).forEach((p) => { picked[p[0] + "," + p[1]] = true; });
    const colorOf = (c) => (RUBRIC_COLORS[tb.cols[c].color] ? tb.cols[c].color : "green");

    let h = `<table class="rtable rtable-${mode}" data-table="${escapeHtml(tb.id || "")}"><thead><tr>`;
    tb.cols.forEach((col, c) => {
      const k = colorOf(c);
      const hl = o.highlightCol === c;
      const style = `background:${RUBRIC_COLOR_BG[k]};border-top-color:${RUBRIC_COLORS[k]}`;
      if (mode === "edit") {
        h += `<th class="rcol-head" style="${style}">` +
          `<input type="number" step="any" class="rscore-in" data-path="t:${o.tIndex}:c:${c}:score" ` +
          `value="${escapeHtml(String(col.score))}" aria-label="Score for level ${c + 1}" />` +
          `<span class="rcolors">` + RUBRIC_COLOR_ORDER.map((sw) =>
            `<button type="button" class="rcolor${sw === k ? " on" : ""}" data-act="color" data-ti="${o.tIndex}" ` +
            `data-c="${c}" data-color="${sw}" style="background:${RUBRIC_COLORS[sw]}" ` +
            `data-tip="${RUBRIC_COLOR_LABEL[sw]}" aria-label="${RUBRIC_COLOR_LABEL[sw]}"></button>`).join("") +
          `</span></th>`;
      } else {
        h += `<th class="rcol-head${hl ? " rcol-hl" : ""}" style="${style}${hl ? `;box-shadow:inset 0 0 0 2px ${RUBRIC_COLORS[k]}` : ""}">` +
          `<span class="rscore-big" style="color:${RUBRIC_COLORS[k]}">${escapeHtml(String(col.score))}</span>` +
          (hl ? '<span class="rchosen">← chosen</span>' : "") + `</th>`;
      }
    });
    h += "</tr></thead><tbody>";
    tb.rows.forEach((row, r) => {
      h += "<tr>";
      row.forEach((txt, c) => {
        const k = colorOf(c);
        if (mode === "edit") {
          h += `<td><textarea rows="3" data-path="t:${o.tIndex}:r:${r}:${c}" placeholder="Describe this level…">` +
            `${escapeHtml(txt)}</textarea></td>`;
        } else if (mode === "pick") {
          const on = !!picked[r + "," + c];
          h += `<td class="rcell-pick${on ? " picked" : ""}"` +
            (on ? ` style="background:${RUBRIC_COLOR_BG[k]};box-shadow:inset 0 0 0 2px ${RUBRIC_COLORS[k]}"` : "") + `>` +
            `<button type="button" class="rpick" data-act="pick" data-r="${r}" data-c="${c}" aria-pressed="${on}">` +
            `${escapeHtml(txt) || "&nbsp;"}</button></td>`;
        } else {
          // View: the student's picked cells if there are any (exactly as marked in
          // their panel), otherwise the whole chosen column is shaded.
          if ((o.picks || []).length) {
            const on = !!picked[r + "," + c];
            h += `<td${on ? ` class="rcell-pick picked" style="background:${RUBRIC_COLOR_BG[k]};box-shadow:inset 0 0 0 2px ${RUBRIC_COLORS[k]}"` : ""}>` +
              `${escapeHtml(txt)}</td>`;
          } else {
            const hl = o.highlightCol === c;
            h += `<td${hl ? ` class="rcol-hl-cell" style="background:${RUBRIC_COLOR_BG[k]}"` : ""}>${escapeHtml(txt)}</td>`;
          }
        }
      });
      h += "</tr>";
    });
    return h + "</tbody></table>";
  }

  // -------------------------------------------------------------------------
  // Setup tab: the rubric block (rubric tests only)
  // -------------------------------------------------------------------------
  function renderRubricSetup() {
    const t = getCurrentTest();
    if (!isRubric(t)) return;
    const cur = t.rubricTemplateId && getRubric(t.rubricTemplateId) ? t.rubricTemplateId : "";
    const list = rubricTemplates.slice().sort((a, b) => a.name.localeCompare(b.name));
    els.rubricSelect.innerHTML = '<option value="">— choose a rubric —</option>' + list.map((r) =>
      `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)} · ${r.tables.length} table${r.tables.length !== 1 ? "s" : ""}</option>`).join("");
    els.rubricSelect.value = cur;
    const r = getRubric(cur);
    [els.rubricEditBtn, els.rubricDeleteBtn, els.rubricExportBtn, els.rubricPrintBtn].forEach((b) => { b.disabled = !r; });
    els.rubricSummary.textContent = r
      ? `${r.tables.length} table${r.tables.length !== 1 ? "s" : ""} · ` +
        r.tables.map((tb) => `${tb.title} (${tableMax(tb)}–${tableMin(tb)})`).join(", ")
      : rubricTemplates.length ? "Choose a rubric for this test, or create a new one."
        : "No rubrics yet — click Create Rubric to make one.";
  }

  // Point test t at a rubric. Changing it clears the test's rubric scores
  // (after asking, if there are any). Returns false if the teacher cancels.
  function setTestRubric(t, id) {
    id = id || null;
    if ((t.rubricTemplateId || null) === id) return true;
    if (hasGradingData(t) &&
        !window.confirm("Changing the rubric clears this test's rubric scores. Continue?")) return false;
    syncCurrentTest();
    t.rubricTemplateId = id;
    t.students = t.students.map((s) => blankStudent(s.name, t));
    if (t.id === currentTestId) loadTestIntoGlobals(t);
    return true;
  }

  function deleteSelectedRubric() {
    const r = getRubric(els.rubricSelect.value);
    if (!r) return;
    // Choosing a rubric in the dropdown assigns it to this test, so this test
    // only blocks deletion if it actually has rubric scores.
    const cur = getCurrentTest();
    const users = templateUsers(r.id).filter((t) => !(t === cur && !hasGradingData(t)));
    if (users.length) {
      alert(`This rubric is used by: ${users.map(disambiguatedName).join(", ")}. Change their rubric first.`);
      return;
    }
    if (!window.confirm(`Delete the rubric "${r.name}"? This cannot be undone.`)) return;
    rubricTemplates = rubricTemplates.filter((x) => x !== r);
    if (cur && cur.rubricTemplateId === r.id) cur.rubricTemplateId = null;
    persist();
    renderRubricSetup();
    renderCurrentTest();
  }

  // -------------------------------------------------------------------------
  // Rubric editor (modal). Edits go into a draft and only land on Save.
  // Inputs carry data-path ("name", "t:<ti>:title", "t:<ti>:c:<c>:score",
  // "t:<ti>:r:<row>:<c>") and write straight into the draft as you type.
  // -------------------------------------------------------------------------
  let rubricDraft = null;
  let rubricEditorUI = { addOpen: false, addRows: 4, addCols: 4 };

  function openRubricEditor(template) {
    rubricDraft = template ? JSON.parse(JSON.stringify(template)) : { id: null, name: "", tables: [] };
    rubricEditorUI = { addOpen: !template, addRows: 4, addCols: 4 };
    openModal({
      kind: "rubric-editor",
      title: template ? `Edit Rubric: ${template.name}` : "Create Rubric",
      size: "lg",
      footHtml: '<button type="button" class="btn ghost" data-act="cancel">Cancel</button>' +
        '<button type="button" class="btn primary" data-act="save">Save rubric</button>',
      onClose: () => { rubricDraft = null; },
    });
    renderRubricEditor();
    const name = els.modalBody.querySelector('[data-path="name"]');
    if (name && !template) name.focus();
  }

  function renderRubricEditor() {
    const d = rubricDraft, ui = rubricEditorUI;
    const sizeOpts = (v) => Array.from({ length: RUBRIC_MAX - RUBRIC_MIN + 1 }, (_, i) => i + RUBRIC_MIN)
      .map((n) => `<option value="${n}"${n === v ? " selected" : ""}>${n}</option>`).join("");
    let h = '<div class="redit-top"><label class="field redit-name"><span class="field-label">Rubric name</span>' +
      `<input type="text" data-path="name" value="${escapeHtml(d.name)}" placeholder="e.g. Essay Rubric" /></label>` +
      '<div class="redit-add">' + (ui.addOpen
        ? `<span class="field-label">New table:</span> Rows <select data-ui="addRows">${sizeOpts(ui.addRows)}</select>` +
          ` × Score levels <select data-ui="addCols">${sizeOpts(ui.addCols)}</select>` +
          ' <button type="button" class="btn primary" data-act="add-table">Add</button>' +
          (d.tables.length ? ' <button type="button" class="btn ghost" data-act="add-cancel">Cancel</button>' : "")
        : '<button type="button" class="btn ghost" data-act="add-open">+ Create table</button>') +
      "</div></div>";
    if (!d.tables.length) h += '<p class="meta redit-none">No tables yet — choose a size and click <strong>Add</strong>.</p>';
    d.tables.forEach((tb, ti) => {
      h += `<section class="rcard" data-ti="${ti}"><div class="rcard-head">` +
        `<label class="rcard-title">Title <input type="text" data-path="t:${ti}:title" value="${escapeHtml(tb.title)}" placeholder="Table ${ti + 1}" /></label>` +
        '<span class="rcard-btns">' +
        `<button type="button" class="btn ghost" data-act="up" data-ti="${ti}"${ti === 0 ? " disabled" : ""} data-tip="Move up">↑</button>` +
        `<button type="button" class="btn ghost" data-act="down" data-ti="${ti}"${ti === d.tables.length - 1 ? " disabled" : ""} data-tip="Move down">↓</button>` +
        `<button type="button" class="btn danger" data-act="remove" data-ti="${ti}">Remove table</button></span></div>` +
        `<div class="rtable-wrap">${renderRubricTableHtml(tb, { mode: "edit", tIndex: ti })}</div></section>`;
    });
    const y = els.modalBody.scrollTop;
    els.modalBody.innerHTML = h;
    els.modalBody.scrollTop = y;
  }

  function setDraftPath(path, value) {
    const p = path.split(":");
    if (p[0] === "name") { rubricDraft.name = value; return; }
    const tb = rubricDraft.tables[+p[1]];
    if (!tb) return;
    if (p[2] === "title") tb.title = value;
    else if (p[2] === "c") tb.cols[+p[3]].score = value; // validated on Save
    else if (p[2] === "r") tb.rows[+p[3]][+p[4]] = value;
  }

  function onRubricEditorClick(btn) {
    const d = rubricDraft, ui = rubricEditorUI;
    const act = btn.getAttribute("data-act"), ti = +btn.getAttribute("data-ti");
    if (act === "add-open") { ui.addOpen = true; renderRubricEditor(); return; }
    if (act === "add-cancel") { ui.addOpen = false; renderRubricEditor(); return; }
    if (act === "add-table") {
      const n = ui.addCols, colors = defaultRubricColors(n);
      d.tables.push({
        id: genTableId(), title: `Table ${d.tables.length + 1}`,
        cols: colors.map((color, i) => ({ score: n - i, color })),
        rows: Array.from({ length: ui.addRows }, () => new Array(n).fill("")),
      });
      ui.addOpen = false;
      modalDirty = true;
      renderRubricEditor();
      const cards = els.modalBody.querySelectorAll(".rcard");
      if (cards.length) cards[cards.length - 1].scrollIntoView({ block: "nearest" });
      return;
    }
    if (act === "up" || act === "down") {
      const to = act === "up" ? ti - 1 : ti + 1;
      if (to < 0 || to >= d.tables.length) return;
      const tmp = d.tables[ti]; d.tables[ti] = d.tables[to]; d.tables[to] = tmp;
      modalDirty = true;
      renderRubricEditor();
      return;
    }
    if (act === "remove") {
      const tb = d.tables[ti];
      const hasText = tb.rows.some((row) => row.some((x) => String(x).trim()));
      if (hasText && !window.confirm(`Remove the table "${tb.title || "Table " + (ti + 1)}" and its text?`)) return;
      d.tables.splice(ti, 1);
      if (!d.tables.length) ui.addOpen = true;
      modalDirty = true;
      renderRubricEditor();
      return;
    }
    if (act === "color") {
      d.tables[ti].cols[+btn.getAttribute("data-c")].color = btn.getAttribute("data-color");
      modalDirty = true;
      renderRubricEditor();
      return;
    }
    if (act === "cancel") { requestCloseModal(); return; }
    if (act === "save") saveRubricDraft();
  }

  function saveRubricDraft() {
    const d = rubricDraft;
    const focusPath = (path) => {
      const el = els.modalBody.querySelector(`[data-path="${path}"]`);
      if (el) { el.focus(); if (el.select) el.select(); }
    };
    if (!String(d.name || "").trim()) { alert("Give the rubric a name."); focusPath("name"); return; }
    if (!d.tables.length) { alert("Add at least one table."); return; }
    for (let ti = 0; ti < d.tables.length; ti++) {
      const tb = d.tables[ti];
      if (!String(tb.title || "").trim()) tb.title = `Table ${ti + 1}`;
      const seen = {};
      for (let c = 0; c < tb.cols.length; c++) {
        const raw = String(tb.cols[c].score).trim(), n = Number(raw);
        if (raw === "" || !Number.isFinite(n)) {
          alert(`"${tb.title}": every score level needs a number.`);
          focusPath(`t:${ti}:c:${c}:score`);
          return;
        }
        if (seen[n]) {
          alert(`"${tb.title}": two levels have the score ${n}. Scores must be different within a table.`);
          focusPath(`t:${ti}:c:${c}:score`);
          return;
        }
        seen[n] = true;
        tb.cols[c].score = n;
      }
    }

    const old = d.id ? getRubric(d.id) : null;
    const clean = sanitizeRubric(Object.assign({}, d, { updatedAt: Date.now(), createdAt: old ? old.createdAt : Date.now() }));
    const users = old ? templateUsers(old.id) : [];
    if (old && users.length && rubricStructureChanged(old, clean) &&
        !window.confirm(`This rubric is used by ${users.length} test${users.length !== 1 ? "s" : ""}. ` +
          "Scores that no longer fit will be cleared. Save anyway?")) return;

    syncCurrentTest();
    if (old) {
      rubricTemplates[rubricTemplates.indexOf(old)] = clean;
      users.forEach((t) => {
        if (isRubric(t) && t.rubricTemplateId === clean.id) reconcileRubricStudents(t.students, clean);
        if (t.stash && t.stash.rubric && t.stash.rubric.rubricTemplateId === clean.id) {
          reconcileRubricStudents(t.stash.rubric.students, clean);
        }
      });
    } else {
      rubricTemplates.push(clean);
      // A new rubric is selected for the current rubric test — unless that
      // would throw away scores it already has against another rubric.
      const t = getCurrentTest();
      if (isRubric(t) && (!t.rubricTemplateId || !hasGradingData(t))) setTestRubric(t, clean.id);
    }
    modalDirty = false;
    closeModal();
    persist();
    renderRubricSetup();
    renderCurrentTest();
  }

  // -------------------------------------------------------------------------
  // Rubric CSV — one rubric per file, readable as text and in Excel/Sheets:
  //   Rubric Name,<name> / Tables,<n> / (blank) / Table,<title> / Score,4,3,2,1 /
  //   Color,blue,green,amber,red / Level 1,<cell>,… / … / (blank) / Table,…
  // -------------------------------------------------------------------------
  function rubricCsvRows(r) {
    const rows = [["Rubric Name", r.name], ["Tables", String(r.tables.length)], []];
    r.tables.forEach((tb) => {
      rows.push(["Table", tb.title]);
      rows.push(["Score"].concat(tb.cols.map((c) => String(c.score))));
      rows.push(["Color"].concat(tb.cols.map((c) => c.color)));
      tb.rows.forEach((row, i) => rows.push([`Level ${i + 1}`].concat(row)));
      rows.push([]);
    });
    return rows;
  }
  const buildRubricCsv = (r) => rubricCsvRows(r).map((row) => row.map(csvEscape).join(",")).join("\r\n");

  // Parse a rubric from CSV rows (a whole rubric file, or the "Rubric
  // Definition" section of a test file). Returns { rubric, warned } with new
  // ids; throws on input it can't make sense of.
  function parseRubricRows(rows) {
    const key = (r) => String((r && r[0]) || "").trim().toLowerCase();
    const blank = (r) => !r || r.every((c) => !String(c || "").trim());
    const trimEnd = (cells) => {
      const out = cells.map((c) => String(c == null ? "" : c));
      while (out.length && !out[out.length - 1].trim()) out.pop();
      return out;
    };
    const start = rows.findIndex((r) => key(r) === "rubric name");
    if (start === -1) throw new Error('no "Rubric Name" row found.');
    const name = String(rows[start][1] || "").trim();
    const tables = [];
    let warned = false;
    for (let i = start + 1; i < rows.length; i++) {
      if (key(rows[i]) !== "table") continue;
      const title = String(rows[i][1] || "").trim() || `Table ${tables.length + 1}`;
      let j = i + 1;
      if (key(rows[j]) !== "score") throw new Error(`table "${title}" has no "Score" row.`);
      const scores = trimEnd(rows[j].slice(1)).map((x) => Number(String(x).trim()));
      j++;
      const n = scores.length;
      if (n < RUBRIC_MIN || n > RUBRIC_MAX) throw new Error(`table "${title}" has ${n} score levels (2–10 allowed).`);
      if (scores.some((s) => !Number.isFinite(s))) throw new Error(`table "${title}" has a score that isn't a number.`);
      if (new Set(scores).size !== n) throw new Error(`table "${title}" uses the same score twice.`);
      let colors = defaultRubricColors(n);
      if (key(rows[j]) === "color") {
        const given = rows[j].slice(1).map((x) => String(x || "").trim().toLowerCase());
        colors = colors.map((auto, c) => (given[c] ? (RUBRIC_COLORS[given[c]] ? given[c] : "green") : auto));
        j++;
      }
      const body = [];
      while (j < rows.length && !blank(rows[j]) && key(rows[j]) !== "table" && key(rows[j]) !== "rubric name") {
        const cells = trimEnd(rows[j].slice(1)); // first cell ("Level N") is just a label
        if (cells.length > n) warned = true;
        body.push(cells.slice(0, n));
        j++;
      }
      if (body.length < RUBRIC_MIN || body.length > RUBRIC_MAX) {
        throw new Error(`table "${title}" has ${body.length} rows (2–10 allowed).`);
      }
      tables.push({ title, cols: scores.map((s, c) => ({ score: s, color: colors[c] })), rows: body });
      i = j - 1;
    }
    if (!tables.length) throw new Error("no tables found.");
    return { rubric: sanitizeRubric({ name, tables }), warned };
  }

  function exportSelectedRubric() {
    const r = getRubric(els.rubricSelect.value);
    if (r) downloadCsv(buildRubricCsv(r), `${fileBase(r.name) || "rubric"} rubric.csv`);
  }

  function handleRubricImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      els.rubricImportFile.value = ""; // allow re-importing the same file
      let res;
      try {
        res = parseRubricRows(parseCsv(String(reader.result)));
      } catch (err) {
        alert("Could not import that rubric: " + err.message);
        return;
      }
      const r = res.rubric;
      if (rubricTemplates.some((x) => x.name.toLowerCase() === r.name.toLowerCase())) r.name += " (imported)";
      rubricTemplates.push(r);
      const t = getCurrentTest();
      if (isRubric(t)) setTestRubric(t, r.id); // asks first if that would clear scores
      persist();
      renderRubricSetup();
      renderCurrentTest();
      if (res.warned) alert("Some rows had more cells than the table has score levels; the extra cells were left out.");
    };
    reader.readAsText(file);
  }

  // -------------------------------------------------------------------------
  // Grade tab, rubric mode — one score dropdown per rubric table, a band pill
  // (suggested from the scores, or set by hand) and Done. Clicking a name
  // opens the student's full rubric (picks → suggested score → suggested band).
  // -------------------------------------------------------------------------
  let rubricBandEditRow = null; // grid row whose band pill is showing its dropdown
  const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
  const scoreOf = (stu, tb) => {
    const v = (stu.scores || {})[tb.id];
    return v == null || colForScore(tb, v) === -1 ? null : v;
  };

  // <select> of a table's scores, tinted with the chosen column's color.
  function rubricScoreSelectHtml(tb, value, attrs) {
    const c = colForScore(tb, value);
    const k = c === -1 ? null : tb.cols[c].color;
    const style = k ? ` style="background:${RUBRIC_COLOR_BG[k]};border-color:${RUBRIC_COLORS[k]}"` : "";
    return `<select class="rscore" ${attrs || ""}${style} aria-label="Score for ${escapeHtml(tb.title)}">` +
      '<option value="">—</option>' + tb.cols.map((col) =>
        `<option value="${col.score}"${col.score === value ? " selected" : ""}>${fmtNum(col.score)}</option>`).join("") +
      "</select>";
  }

  // "Thesis 4 · Evidence 3 — total 7/8 (88%)", plus "manual" when overridden.
  function rubricScoreSummary(template, stu) {
    const parts = template.tables.filter((tb) => scoreOf(stu, tb) != null)
      .map((tb) => `${tb.title} ${fmtNum(scoreOf(stu, tb))}`);
    if (!parts.length) return "Not scored yet";
    const tot = rubricTotals(template, stu);
    return `${parts.join(" · ")} — total ${fmtNum(tot.sum)}/${fmtNum(tot.maxSum)} (${tot.pct}%)`;
  }

  function rubricBandPillHtml(template, stu, clickable) {
    const b = effectiveBand(template, stu);
    const tip = rubricScoreSummary(template, stu) + (stu.bandManual ? " · band set by hand" : "") +
      (clickable ? "\nClick to change the band" : "");
    const tag = clickable ? 'button type="button" data-act="rband"' : "span";
    return `<${tag} class="score-pill rband-pill band-${b || "none"}${stu.bandManual ? " manual" : ""}" ` +
      `data-tip="${escapeHtml(tip)}">${b ? BAND_SHORT[b] : "—"}</${clickable ? "button" : "span"}>`;
  }

  function rubricBandSelectHtml(template, stu, attrs) {
    const sug = suggestBand(template, stu);
    const cur = stu.bandManual && stu.band ? stu.band : "auto";
    const opt = (v, lbl) => `<option value="${v}"${v === cur ? " selected" : ""}>${lbl}</option>`;
    return `<select class="rband" ${attrs || ""} aria-label="Band">` +
      opt("auto", `Auto (suggested: ${sug ? BAND_LABEL[sug] : "—"})`) +
      BANDS.slice().reverse().map((b) => opt(b, b === "notmeet" ? "DNM — does not meet" : BAND_LABEL[b])).join("") +
      "</select>";
  }

  function renderRubricHead(template) {
    let h = '<tr><th class="name-col">Student</th>';
    template.tables.forEach((tb) => {
      const tip = `${tb.title}: ` + tb.cols.map((c) => `${fmtNum(c.score)} (${c.color})`).join(" · ") +
        "\n▦ in a cell shows the full table";
      h += `<th class="rt-col" data-tip="${escapeHtml(tip)}">${escapeHtml(tb.title)}` +
        `<small>${fmtNum(tableMin(tb))}–${fmtNum(tableMax(tb))}</small></th>`;
    });
    els.gradeHead.innerHTML = h + '<th class="score-col">Score</th><th class="done-col">Done</th></tr>';
  }

  function rubricRowHtml(template, stu, r) {
    const b = effectiveBand(template, stu);
    let h = `<tr data-r="${r}" class="${stu.done ? "row-done band-" + (b || "none") : ""}">` +
      `<td class="name-col rname" data-act="ropen" data-tip="Grade ${escapeHtml(stu.name)} with the full rubric">` +
      `${escapeHtml(stu.name)}</td>`;
    template.tables.forEach((tb) => {
      h += `<td class="rcell">${rubricScoreSelectHtml(tb, scoreOf(stu, tb), `data-table="${escapeHtml(tb.id)}"`)}` +
        `<button type="button" class="rview" data-act="rview" data-table="${escapeHtml(tb.id)}" ` +
        `data-tip="Show this rubric table" aria-label="Show the ${escapeHtml(tb.title)} table">▦</button></td>`;
    });
    h += `<td class="score-col">${rubricBandEditRow === r
      ? rubricBandSelectHtml(template, stu, "")
      : rubricBandPillHtml(template, stu, true)}</td>`;
    h += `<td class="done-col"><button type="button" class="done-btn${stu.done ? " is-done" : ""}" data-act="rdone" ` +
      `data-tip="${stu.done ? "Marked fully graded — click to reopen" : "Mark this student fully graded"}">` +
      `${stu.done ? "Done ✓" : "Done"}</button></td></tr>`;
    return h;
  }

  function renderRubricBody(template) {
    els.gradeBody.innerHTML = students.map((stu, r) => rubricRowHtml(template, stu, r)).join("");
    renderRubricFoot(template);
  }

  function refreshRubricRow(r) {
    const template = rubricForTest(getCurrentTest());
    const tr = els.gradeBody.querySelector(`tr[data-r="${r}"]`);
    if (template && tr && students[r]) tr.outerHTML = rubricRowHtml(template, students[r], r);
  }

  // Footer: class average per table ("3.2 / 4") and the band spread.
  function renderRubricFoot(template) {
    let h = '<tr><td class="name-col">Class average</td>';
    template.tables.forEach((tb) => {
      const vals = students.map((s) => scoreOf(s, tb)).filter((v) => v != null);
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      h += `<td data-tip="${vals.length} of ${students.length} scored">` +
        (mean == null ? "—" : `${fmtNum(+mean.toFixed(1))} / ${fmtNum(tableMax(tb))}`) + "</td>";
    });
    const by = { exceeds: [], meets: [], nearly: [], notmeet: [] };
    students.forEach((s) => { const b = effectiveBand(template, s); if (by[b]) by[b].push(s.name); });
    const order = BANDS.slice().reverse();
    const tip = order.map((b) => `${BAND_LABEL[b]} (${by[b].length}): ${by[b].join(", ") || "—"}`).join("\n");
    h += `<td class="score-col"><span class="rband-dist" data-tip="${escapeHtml(tip)}">` +
      order.map((b) => `<span style="color:${BAND_COLOR[b]}">${by[b].length}</span>`).join("·") + "</span></td><td></td></tr>";
    els.gradeFoot.innerHTML = h;
  }

  // ---- changes (grid and student panel share these) ----
  function afterRubricChange(r, opts) {
    const template = rubricForTest(getCurrentTest()), stu = students[r];
    if (!template || !stu) return;
    // Done = every table scored (like Standard's auto-Done); the button can still override.
    if (!opts || !opts.keepDone) stu.done = template.tables.every((tb) => scoreOf(stu, tb) != null);
    if (!stu.bandManual) stu.band = suggestBand(template, stu);
    refreshRubricRow(r);
    renderRubricFoot(template);
    updateAnalysis();
    refreshStudentTabIfActive();
    persist();
  }

  function setRubricScore(r, tableId, value) {
    const stu = students[r];
    if (!stu) return;
    stu.scores = stu.scores || {};
    stu.scores[tableId] = value; // the dropdown never changes picks
    afterRubricChange(r);
  }

  // "auto" = follow the suggestion; anything else is a manual override.
  function setRubricBand(r, value) {
    const template = rubricForTest(getCurrentTest()), stu = students[r];
    if (!template || !stu) return;
    if (value === "auto") { stu.bandManual = false; stu.band = suggestBand(template, stu); }
    else if (BANDS.indexOf(value) !== -1) { stu.bandManual = true; stu.band = value; }
    afterRubricChange(r, { keepDone: true });
  }

  function toggleRubricDone(r) {
    const stu = students[r];
    if (!stu) return;
    stu.done = !stu.done;
    afterRubricChange(r, { keepDone: true });
  }

  // Mean score of the picked cells' columns, rounded to the nearest score the
  // table offers (ties → the higher score). null when nothing is picked.
  function suggestedTableScore(tb, picks) {
    const vals = (picks || []).map((p) => tb.cols[p[1]] && tb.cols[p[1]].score).filter((v) => Number.isFinite(v));
    if (!vals.length) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    let best = null, bestD = Infinity;
    tb.cols.forEach((col) => {
      const d = Math.abs(col.score - mean);
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && col.score > best)) { best = col.score; bestD = d; }
    });
    return best;
  }

  // Toggle a picked cell; picks set the table's score (they're the more deliberate act).
  function toggleRubricPick(r, tableId, row, col) {
    const template = rubricForTest(getCurrentTest()), stu = students[r];
    const tb = template && template.tables.find((x) => x.id === tableId);
    if (!tb || !stu) return;
    stu.picks = stu.picks || {};
    const list = stu.picks[tableId] || [];
    const i = list.findIndex((p) => p[0] === row && p[1] === col);
    if (i === -1) list.push([row, col]); else list.splice(i, 1);
    stu.picks[tableId] = list;
    const sug = suggestedTableScore(tb, list);
    if (sug != null) { stu.scores = stu.scores || {}; stu.scores[tableId] = sug; } // no picks → score left as is
    afterRubricChange(r);
  }

  // Grid events (delegated; the rubric grid is rebuilt as HTML).
  function initRubricGrid() {
    els.gradeBody.addEventListener("change", (e) => {
      if (!isRubric(getCurrentTest())) return;
      const tr = e.target.closest && e.target.closest("tr[data-r]");
      if (!tr) return;
      const r = +tr.getAttribute("data-r");
      if (e.target.matches("select.rscore")) {
        const tableId = e.target.getAttribute("data-table");
        setRubricScore(r, tableId, e.target.value === "" ? null : Number(e.target.value));
        // The row was redrawn — keep keyboard focus on the same dropdown.
        const again = [...els.gradeBody.querySelectorAll(`tr[data-r="${r}"] select.rscore`)]
          .find((s) => s.getAttribute("data-table") === tableId);
        if (again) again.focus();
      } else if (e.target.matches("select.rband")) {
        rubricBandEditRow = null;
        setRubricBand(r, e.target.value);
      }
    });
    els.gradeBody.addEventListener("click", (e) => {
      if (!isRubric(getCurrentTest())) return;
      const el = e.target.closest && e.target.closest("[data-act]");
      const tr = el && el.closest("tr[data-r]");
      if (!tr) return;
      e.stopPropagation();
      const r = +tr.getAttribute("data-r");
      const act = el.getAttribute("data-act");
      if (act === "ropen") openStudentRubric(r);
      else if (act === "rdone") toggleRubricDone(r);
      else if (act === "rview") openTableViewer(el.getAttribute("data-table"), r);
      else if (act === "rband") {
        const prev = rubricBandEditRow;
        rubricBandEditRow = r;
        if (prev != null && prev !== r) refreshRubricRow(prev);
        refreshRubricRow(r);
        const sel = els.gradeBody.querySelector(`tr[data-r="${r}"] select.rband`);
        if (sel) sel.focus();
      }
    });
    // Leaving the band dropdown without choosing puts the pill back.
    els.gradeBody.addEventListener("focusout", (e) => {
      if (!e.target.matches || !e.target.matches("select.rband")) return;
      const r = rubricBandEditRow;
      setTimeout(() => {
        if (rubricBandEditRow === r && r != null) { rubricBandEditRow = null; refreshRubricRow(r); }
      }, 0);
    });
  }

  // ---- table viewer (read-only; highlights the student's chosen column) ----
  function openTableViewer(tableId, r) {
    const template = rubricForTest(getCurrentTest());
    const tb = template && template.tables.find((x) => x.id === tableId);
    if (!tb) return;
    const stu = r != null ? students[r] : null;
    const col = stu ? colForScore(tb, scoreOf(stu, tb)) : -1;
    const picks = (stu && stu.picks && stu.picks[tb.id]) || [];
    openModal({
      kind: "table-view",
      title: tb.title,
      size: "lg",
      bodyHtml: `<p class="meta rview-sub">${escapeHtml(template.name)}` +
        (stu ? ` · ${escapeHtml(stu.name)}: ${col === -1 ? "not scored" : "scored " + fmtNum(tb.cols[col].score)}` +
          (picks.length ? ` · ${picks.length} cell${picks.length !== 1 ? "s" : ""} picked in their rubric` : "") : "") +
        `</p><div class="rtable-wrap">${renderRubricTableHtml(tb, { mode: "view", highlightCol: col === -1 ? null : col, picks })}</div>`,
      footHtml: '<button type="button" class="btn primary" data-act="close">Close</button>',
    });
  }

  // ---- student rubric panel (modal): every change saves immediately ----
  let panelIndex = null;

  function openStudentRubric(r) {
    if (!students[r] || !rubricForTest(getCurrentTest())) return;
    panelIndex = r;
    openModal({ kind: "student-rubric", title: "", size: "lg", footHtml: " ", onClose: () => { panelIndex = null; } });
    renderStudentRubric();
  }

  function renderStudentRubric() {
    const template = rubricForTest(getCurrentTest()), stu = students[panelIndex];
    if (!template || !stu) { closeModal(); return; }
    const n = students.length;
    els.modalTitle.textContent = `${stu.name} (${panelIndex + 1} of ${n})`;
    const nav = `<button type="button" class="btn ghost" data-act="prev"${panelIndex === 0 ? " disabled" : ""}>◀ Prev</button>` +
      `<button type="button" class="btn ghost" data-act="next"${panelIndex === n - 1 ? " disabled" : ""}>Next ▶</button>`;
    const sug = suggestBand(template, stu), tot = rubricTotals(template, stu);

    let h = `<div class="rpanel-bar"><div class="rpanel-nav">${nav}</div>` +
      `<div class="rpanel-band"><span class="field-label">Overall:</span> ${rubricBandPillHtml(template, stu, false)} ` +
      `${rubricBandSelectHtml(template, stu, "")} <span class="meta">Suggested: ` +
      `${sug ? BAND_LABEL[sug] : "—"}${tot.maxSum ? ` — ${fmtNum(tot.sum)}/${fmtNum(tot.maxSum)} (${tot.pct}%)` : ""}</span></div></div>`;
    template.tables.forEach((tb) => {
      const v = scoreOf(stu, tb), col = colForScore(tb, v);
      const picks = (stu.picks || {})[tb.id] || [];
      h += `<section class="rpanel-table" data-table="${escapeHtml(tb.id)}"><div class="rpanel-head">` +
        `<strong>${escapeHtml(tb.title)}</strong>` +
        `<label class="rpanel-score">Score: ${rubricScoreSelectHtml(tb, v, `data-table="${escapeHtml(tb.id)}"`)}</label>` +
        (picks.length ? `<button type="button" class="link-btn" data-act="clear-picks" data-table="${escapeHtml(tb.id)}">clear picks</button>` : "") +
        `<span class="meta">Click the cells that describe this student's work.</span></div>` +
        `<div class="rtable-wrap">${renderRubricTableHtml(tb, { mode: "pick", picks, highlightCol: col === -1 ? null : col })}</div></section>`;
    });
    const y = els.modalBody.scrollTop;
    els.modalBody.innerHTML = h;
    els.modalBody.scrollTop = y;
    els.modalFoot.innerHTML =
      '<button type="button" class="btn ghost rpanel-print" data-act="print" data-tip="Save this student\'s whole rubric as a one-page PDF">Print PDF</button>' +
      nav +
      `<button type="button" class="btn ${stu.done ? "ghost" : "primary"}" data-act="toggle-done">${stu.done ? "Reopen" : "Mark Done ✓"}</button>` +
      '<button type="button" class="btn ghost" data-act="close">Close</button>';
  }

  function onStudentPanelClick(btn) {
    const act = btn.getAttribute("data-act");
    if (act === "print") {
      printRubricPdf(rubricForTest(getCurrentTest()), { test: getCurrentTest(), stu: students[panelIndex] });
      return;
    }
    if (act === "prev" || act === "next") {
      const to = panelIndex + (act === "prev" ? -1 : 1);
      if (to < 0 || to >= students.length) return;
      panelIndex = to;
      els.modalBody.scrollTop = 0;
      renderStudentRubric();
      return;
    }
    if (act === "pick") {
      const tableId = btn.closest("[data-table]").getAttribute("data-table");
      toggleRubricPick(panelIndex, tableId, +btn.getAttribute("data-r"), +btn.getAttribute("data-c"));
    } else if (act === "clear-picks") {
      const stu = students[panelIndex];
      if (stu && stu.picks) stu.picks[btn.getAttribute("data-table")] = [];
      afterRubricChange(panelIndex, { keepDone: true }); // the score stays as it was
    } else if (act === "toggle-done") {
      toggleRubricDone(panelIndex);
    } else return;
    renderStudentRubric();
  }

  function onStudentPanelChange(el) {
    if (el.matches("select.rscore")) {
      setRubricScore(panelIndex, el.getAttribute("data-table"), el.value === "" ? null : Number(el.value));
    } else if (el.matches("select.rband")) {
      setRubricBand(panelIndex, el.value);
    } else return;
    renderStudentRubric();
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
    const template = rubricForTest(t);
    const rows = [];
    rows.push(["Test Name", (t && t.name ? t.name : "").trim()]);
    if (template) {
      rows.push(["Grading Type", gradingTypeLabel("rubric")]);
      rows.push(["Rubric", template.name]);
    } else {
      rows.push(["Questions", String(numQuestions)]);
      rows.push(["Grading Type", gradingTypeLabel("standard")]);
    }
    rows.push(["Created", t && t.createdAt != null ? new Date(t.createdAt).toISOString() : ""]);
    rows.push(["Subject", t ? (t.type || "").trim() : ""]);
    rows.push(["Tags", t ? (t.tags || []).join(", ") : ""]);
    rows.push([]); // spacer

    // Rubric test: one column per table, the band, Done and the %, then the
    // rubric itself so the file is self-contained. (Picks are working notes —
    // not exported.)
    if (template) {
      rows.push(["Student"].concat(template.tables.map((tb) => tb.title), ["Band", "Done", "Score"]));
      students.forEach((stu) => {
        const s = statsFor(t, stu);
        rows.push([stu.name].concat(
          template.tables.map((tb) => { const v = scoreOf(stu, tb); return v == null ? "" : fmtNum(v); }),
          [BAND_LABEL[s.band] || "", stu.done ? "Done" : "", s.pct != null ? s.pct + "%" : ""]));
      });
      rows.push([]);
      rows.push(["Rubric Definition"]);
      rubricCsvRows(template).forEach((r) => rows.push(r));
      return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    }

    const header = ["Student"];
    for (let q = 1; q <= numQuestions; q++) header.push("Q" + q);
    header.push("Done", "Score");
    rows.push(header);

    students.forEach((stu) => {
      const s = studentStats(stu);
      const row = [stu.name];
      for (let q = 0; q < numQuestions; q++) {
        const m = marksOf(stu)[q];
        row.push(m === "correct" ? "Correct" : m === "wrong" ? "Wrong" : m === "half" ? "Half" : "");
      }
      row.push(stu.done ? "Done" : "");
      row.push(s.attempted ? s.pct + "%" : "");
      rows.push(row);
    });

    return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  }

  // A name made safe to use in a file name (no \ / : * ? " < > |).
  const fileBase = (name) => (name || "").trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();

  function safeFilename(name) {
    const base = fileBase(name);
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}-${pad(d.getMinutes())}`;
    return `${base || "grading-export"} ${stamp}.csv`;
  }

  function downloadCsv(text, filename) {
    // Prepend a UTF-8 BOM so Excel reads accented names correctly.
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function saveCsv() {
    downloadCsv(buildCsv(), safeFilename(getCurrentTest() ? getCurrentTest().name : "grading-export"));
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

  // "Meets", "Nearly meets", "DNM", "Does not meet"… → band key (or null).
  function parseBandLabel(cell) {
    const v = String(cell || "").trim().toLowerCase();
    if (!v) return null;
    if (v === "dnm" || v.indexOf("not") !== -1) return "notmeet";
    if (v.indexOf("exceed") === 0) return "exceeds";
    if (v.indexOf("nearly") === 0) return "nearly";
    if (v.indexOf("meet") === 0) return "meets";
    return null;
  }

  // An existing template with the same name AND the same tables (titles,
  // scores, colors, text) — so re-importing a file doesn't pile up copies.
  function findMatchingRubric(r) {
    const shape = (x) => JSON.stringify(x.tables.map((tb) => [tb.title, tb.cols, tb.rows]));
    return rubricTemplates.find((x) => x.name.toLowerCase() === r.name.toLowerCase() && shape(x) === shape(r)) || null;
  }

  function loadFromCsv(text) {
    const rows = parseCsv(text);
    let name = "", metaN = null, headerIdx = -1, created = NaN, type = "", tags = [], gradingType = "standard";

    // Metadata rows only count above the "Student" header, so a student who
    // happens to be named e.g. "Created" isn't misread as metadata.
    rows.forEach((r, idx) => {
      if (headerIdx !== -1) return;
      const key = (r[0] || "").trim().toLowerCase();
      if (key === "test name") name = (r[1] || "").trim();
      else if (key === "questions") metaN = parseInt(r[1], 10);
      else if (key === "grading type") gradingType = /rubric/i.test(r[1] || "") ? "rubric" : "standard";
      else if (key === "created") created = Date.parse((r[1] || "").trim());
      else if (key === "subject" || key === "type") type = (r[1] || "").trim(); // "Type" = older exports
      else if (key === "tags") tags = parseTags(r[1]);
      else if (key === "student") headerIdx = idx;
    });

    if (headerIdx === -1) throw new Error('no "Student" header row found.');

    const header = rows[headerIdx].map((h) => (h || "").trim().toLowerCase());
    const doneCol = header.indexOf("done");
    // Student rows run to the end, or to the "Rubric Definition" section.
    const defIdx = rows.findIndex((r, i) => i > headerIdx && (r[0] || "").trim().toLowerCase() === "rubric definition");
    const studentRows = rows.slice(headerIdx + 1, defIdx === -1 ? rows.length : defIdx)
      .filter((r) => (r[0] || "").trim()); // skip blank lines

    let qCount, roster, template = null;
    if (gradingType === "rubric") {
      if (defIdx === -1) throw new Error('it\'s a rubric test, but the file has no "Rubric Definition" section.');
      const parsed = parseRubricRows(rows.slice(defIdx + 1)).rubric;
      template = findMatchingRubric(parsed);
      if (!template) {
        if (rubricTemplates.some((x) => x.name.toLowerCase() === parsed.name.toLowerCase())) parsed.name += " (imported)";
        rubricTemplates.push(parsed);
        template = parsed;
      }
      // Student columns are matched to tables by title.
      const used = {}, colOf = {};
      template.tables.forEach((tb) => {
        const i = header.findIndex((h, j) => j > 0 && !used[j] && h === tb.title.trim().toLowerCase());
        if (i !== -1) used[i] = true;
        colOf[tb.id] = i;
      });
      const bandCol = header.indexOf("band");
      roster = studentRows.map((r) => {
        const stu = { name: r[0].trim(), done: false, scores: {}, picks: {}, band: null, bandManual: false };
        template.tables.forEach((tb) => {
          const raw = colOf[tb.id] > 0 ? String(r[colOf[tb.id]] || "").trim() : "";
          if (raw && colForScore(tb, Number(raw)) !== -1) stu.scores[tb.id] = Number(raw);
        });
        // A Band that differs from what the scores suggest was set by hand.
        const sug = suggestBand(template, stu);
        const given = bandCol >= 0 ? parseBandLabel(r[bandCol]) : null;
        if (given && given !== sug) { stu.band = given; stu.bandManual = true; } else stu.band = sug;
        stu.done = doneCol >= 0 ? mapDone(r[doneCol]) : template.tables.every((tb) => scoreOf(stu, tb) != null);
        return stu;
      });
      qCount = metaN > 0 ? metaN : 10; // unused by rubric tests; kept for switching to Standard
    } else {
      if (metaN && !isNaN(metaN) && metaN > 0) qCount = metaN;
      else if (doneCol > 1) qCount = doneCol - 1; // columns between Student and Done
      else qCount = header.length - 1 - (header[header.length - 1] === "score" ? 1 : 0);
      qCount = Math.max(1, qCount);
      roster = studentRows.map((r) => {
        const marks = [];
        for (let q = 0; q < qCount; q++) marks.push(mapMark(r[q + 1]));
        const done = doneCol >= 0 ? mapDone(r[doneCol]) : marks.every((m) => m !== "none");
        return { name: r[0].trim(), marks, done };
      });
    }

    if (!roster.length) throw new Error("no student rows found.");

    // Create a NEW test from the imported file and switch to it.
    const t = {
      id: genId(),
      name: name || "Imported test",
      type: type,
      tags: tags,
      numQuestions: qCount,
      gradingType: gradingType,
      rubricTemplateId: template ? template.id : null,
      stash: {},
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
      const subjectTests = subject ? analysisTests().filter((t) => typeKeyOf(t) === analysisMode.key) : [];
      const subjectLabel = subject ? typeLabelOf(subjectTests[0]) || analysisMode.label : "";
      const curTest = getCurrentTest();
      const titleText = subject
        ? `${subjectLabel} (${subjectTests.length} test${subjectTests.length !== 1 ? "s" : ""}` +
          (analysisTag ? `, ${analysisTagInclude ? "tagged" : "not tagged"} "${tagLabel(analysisTag)}"` : "") + ")"
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
      // Same order as renderScorePie's legend: best band first.
      const legendColors = shownBands().slice().reverse().map((b) => BAND_COLOR[b]);
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

  // -------------------------------------------------------------------------
  // Rubric PDF — the whole rubric on ONE page. From the student panel it shows
  // that student's scores, picked cells and overall band; from Setup it's the
  // blank rubric. Tries portrait and landscape at shrinking font sizes and keeps
  // whichever fits everything at the largest size.
  // -------------------------------------------------------------------------
  function printRubricPdf(template, ctx) {
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFCtor) { alert("PDF library failed to load."); return; }
    if (!template || !template.tables.length) return;
    const stu = ctx && ctx.stu, test = ctx && ctx.test;
    const INK = [31, 39, 51], MUT = [110, 118, 134], GRID = [205, 211, 221];
    const M = 30, HEAD_H = stu ? 74 : 58;

    // Lay out (and optionally draw) every table at font size f; returns the height used.
    function tables(doc, f, CW, y0, draw) {
      let y = y0;
      const lh = f * 1.2;
      const PAD = Math.max(1.5, Math.min(3, f * 0.35)); // cell padding shrinks with the text
      template.tables.forEach((tb) => {
        const n = tb.cols.length, colW = CW / n;
        const v = stu ? scoreOf(stu, tb) : null, chosen = stu ? colForScore(tb, v) : -1;
        const picked = {};
        ((stu && stu.picks && stu.picks[tb.id]) || []).forEach((p) => { picked[p[0] + "," + p[1]] = true; });

        // Title row: "Thesis" (+ "Score: 3 of 4" for a student)
        const titleH = (f + 2) * 1.35;
        if (draw) {
          doc.setFont("helvetica", "bold").setFontSize(f + 2).setTextColor(...INK);
          doc.text(tb.title, M, y + f + 1);
          if (stu) {
            doc.setFont("helvetica", "normal").setFontSize(f + 1).setTextColor(...MUT);
            doc.text(v == null ? "Not scored" : `Score: ${fmtNum(v)} of ${fmtNum(tableMax(tb))}`, M + CW, y + f + 1, { align: "right" });
          }
        }
        y += titleH;

        // Header row: each level's score in its color
        const headH = f * 2.3;
        tb.cols.forEach((col, c) => {
          const k = RUBRIC_COLORS[col.color] ? col.color : "green";
          const x = M + c * colW;
          if (!draw) return;
          doc.setFillColor(...hexToRgb(RUBRIC_COLOR_BG[k])).setDrawColor(...GRID).setLineWidth(0.5);
          doc.rect(x, y, colW, headH, "FD");
          doc.setFillColor(...hexToRgb(RUBRIC_COLORS[k])).rect(x, y, colW, 2.4, "F");
          doc.setFont("helvetica", "bold").setFontSize(f + 3).setTextColor(...hexToRgb(RUBRIC_COLORS[k]));
          doc.text(fmtNum(col.score) + (c === chosen ? "  (chosen)" : ""), x + colW / 2, y + headH / 2 + (f + 3) / 3, { align: "center" });
          if (c === chosen) {
            doc.setDrawColor(...hexToRgb(RUBRIC_COLORS[k])).setLineWidth(1.6).rect(x + 0.8, y + 0.8, colW - 1.6, headH - 1.6, "S");
          }
        });
        y += headH;

        // Body rows: wrapped text; a student's picked cells are filled + checked.
        // Wrap each cell in the font it's drawn in (picked = bold) and leave room
        // for the check mark, so nothing spills into the next cell.
        tb.rows.forEach((row, r) => {
          const wrapped = row.map((txt, c) => {
            const on = !!picked[r + "," + c];
            doc.setFont("helvetica", on ? "bold" : "normal").setFontSize(f);
            return doc.splitTextToSize(String(txt || ""), colW - 2 * PAD - (on ? 10 : 0));
          });
          const rowH = Math.max(1, ...wrapped.map((w) => w.length)) * lh + 2 * PAD;
          if (draw) {
            row.forEach((txt, c) => {
              const k = RUBRIC_COLORS[tb.cols[c].color] ? tb.cols[c].color : "green";
              const x = M + c * colW, on = !!picked[r + "," + c];
              if (on) {
                doc.setFillColor(...hexToRgb(RUBRIC_COLOR_BG[k])).setDrawColor(...GRID).setLineWidth(0.5).rect(x, y, colW, rowH, "FD");
                doc.setDrawColor(...hexToRgb(RUBRIC_COLORS[k])).setLineWidth(1.4).rect(x + 0.9, y + 0.9, colW - 1.8, rowH - 1.8, "S");
                // check mark in the corner (helvetica has no ✓ glyph)
                doc.setDrawColor(...INK).setLineWidth(1.1);
                doc.line(x + colW - 11, y + 6, x + colW - 8, y + 9);
                doc.line(x + colW - 8, y + 9, x + colW - 3.5, y + 3.5);
              } else {
                doc.setDrawColor(...GRID).setLineWidth(0.5).rect(x, y, colW, rowH, "S");
              }
              doc.setFont("helvetica", on ? "bold" : "normal").setFontSize(f).setTextColor(...INK);
              if (wrapped[c].length) doc.text(wrapped[c], x + PAD, y + PAD + f * 0.95, { lineHeightFactor: 1.2 });
            });
          }
          y += rowH;
        });
        y += f * 1.6; // gap before the next table
      });
      return y - y0;
    }

    // Pick the orientation + font size that fits everything on one letter page
    // (largest text wins). A huge rubric that won't fit even at the smallest
    // size gets a single taller page instead, so nothing is ever cut off.
    let best = null;
    ["portrait", "landscape"].forEach((orientation) => {
      const probe = new jsPDFCtor({ unit: "pt", format: "letter", orientation });
      const PW = probe.internal.pageSize.getWidth(), PH = probe.internal.pageSize.getHeight();
      const CW = PW - 2 * M, avail = PH - 2 * M - HEAD_H;
      let f = 13, h; // as large as fits, so a short rubric fills the page
      while ((h = tables(probe, f, CW, 0, false)) > avail && f > 3) f -= 0.25;
      const c = { orientation, f, PW, CW, h, fits: h <= avail };
      if (!best || (c.fits && !best.fits) || (c.fits === best.fits && (c.fits ? c.f > best.f : c.h < best.h))) best = c;
    });
    const { f, PW, CW } = best;
    const doc = best.fits
      ? new jsPDFCtor({ unit: "pt", format: "letter", orientation: best.orientation })
      : new jsPDFCtor({ unit: "pt", format: [PW, Math.ceil(2 * M + HEAD_H + best.h + 4)], orientation: "portrait" });

    // Header
    let y = M;
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(59, 108, 255);
    doc.text(stu ? "STUDENT RUBRIC" : "RUBRIC", M, y + 6);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUT);
    doc.text("Printed " + dateStr(), PW - M, y + 6, { align: "right" });
    y += 26;
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK);
    doc.text(stu ? stu.name : template.name, M, y);
    y += 15;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUT);
    doc.text(stu ? `${(test && test.name) || "Untitled test"} · ${template.name}`
      : `${template.tables.length} table${template.tables.length !== 1 ? "s" : ""}`, M, y);
    if (stu) {
      y += 15;
      const b = effectiveBand(template, stu), tot = rubricTotals(template, stu);
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...(b ? hexToRgb(BAND_COLOR[b]) : MUT));
      doc.text(`Overall: ${b ? BAND_LABEL[b] : "not scored yet"}` +
        (tot.maxSum ? ` — ${fmtNum(tot.sum)}/${fmtNum(tot.maxSum)} (${tot.pct}%)` : "") +
        (stu.bandManual ? "  (band set by hand)" : ""), M, y);
    }
    y = M + HEAD_H - 8;
    doc.setDrawColor(...GRID).setLineWidth(0.8).line(M, y, PW - M, y);

    tables(doc, f, CW, M + HEAD_H, true);

    const base = fileBase(stu ? `${stu.name} - ${(test && test.name) || "test"}` : template.name) || "rubric";
    doc.save(`${base} rubric.pdf`);
    try { window.open(doc.output("bloburl"), "_blank"); } catch (e) { /* popup blocked */ }
  }
})();
