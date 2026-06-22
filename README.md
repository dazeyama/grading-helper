# Grading Helper

### 👉 [Open the live app: dazeyama.github.io/grading-helper](https://dazeyama.github.io/grading-helper/)

**Mrs. Amanita's Grading Helper** — a classroom grading tool that lets a teacher grade a whole class at once and see live data analysis as they go.

- **Live:** https://dazeyama.github.io/grading-helper/
- **Runs entirely in your browser.** No backend, no accounts, no data leaves your machine. Your work is cached locally and resumes automatically.

---

## Table of contents

- [Overview](#overview)
- [Core concepts](#core-concepts)
  - [Tests](#tests)
  - [Cell states & scoring](#cell-states--scoring)
  - [Performance bands](#performance-bands)
  - [Done](#done)
- [The three tabs](#the-three-tabs)
  - [Setup tab](#setup-tab)
  - [Grade tab](#grade-tab)
  - [Analysis tab](#analysis-tab)
- [Saving & loading](#saving--loading)
- [Print PDF](#print-pdf)
- [Auto-save / session cache](#auto-save--session-cache)
- [Running locally](#running-locally)
- [Tech & files](#tech--files)

---

## Overview

Grading Helper turns a class roster and a test into a single grid you click through to grade everyone at once. As you mark answers, the **Analysis** tab updates live with a score-distribution pie chart, a per-question bar graph, plain-English highlights, and class statistics. You can keep **multiple tests** side by side, switch between them, export/import them as CSV, and print a one-page PDF report.

The interface is organized into three tabs — **Setup**, **Grade**, and **Analysis** — each with a **Test** dropdown at the top so you always know (and can change) which test you're working on.

---

## Core concepts

### Tests

A **test** is one assignment for one class. Each test has its own:

- **Name** (e.g. "Quiz 1", "Unit 3 Math Test")
- **Class list** (the roster of student names)
- **Number of questions**
- **Grades** (every student's marks, plus Done flags)

The app holds a whole **collection** of tests. The **Test dropdown** (mirrored on all three tabs) selects which one is active; switching it swaps the entire grid and analysis. Tests are fully independent — different rosters, different question counts, different data.

If two tests share a name, the dropdown disambiguates them with a suffix: `Quiz 1 (1)`, `Quiz 1 (2)`.

### Cell states & scoring

Every grade cell cycles through **four states** when clicked, in this order:

| State | Looks like | Meaning | Credit |
|-------|-----------|---------|--------|
| Blank | _(empty)_ | Did not participate / not yet graded | excluded |
| Correct | green **✓** | Full marks | 100% |
| Half | yellow **/** | Partial credit | 50% |
| Wrong | red **✗** | No marks | 0% |

Click a cell again to advance to the next state; it wraps back to blank after wrong.

A student's **score** = earned credit ÷ attempted, where *attempted* counts correct + half + wrong (blanks are excluded — a blank means "did not participate," not a zero). A half mark contributes 0.5. Example: 1 correct + 1 half out of 2 attempted = **75%**.

### Performance bands

Scores are grouped into three color-coded bands, used by the pie chart, legend, and the Done-row highlight color:

- 🟢 **Meets** — 70% and up
- 🟡 **Nearly meets** — 51%–69%
- 🔴 **Does not meet** — 50% and below

### Done

A row is marked **Done** when every question for that student has been graded (no blanks remain). This happens **automatically** as you fill the last cell, and reverts if you blank a cell again. You can also toggle Done manually with the row's **Done** button (e.g. to mark a partially-graded student finished anyway).

Done rows are **highlighted in their band color** (green / yellow / red), with a matching accent bar; the ✓/✗ marks keep their own colors so the row stays readable.

Only **Done** students are counted in the Analysis pie chart, so the distribution reflects finished grading.

---

## The three tabs

### Setup tab

The Setup tab is a **live editor** for the selected test — edits apply to that test immediately.

**Test selection bar (top):**

- **Test dropdown** — pick which test to view/edit.
- **Delete Test** (red) — permanently deletes the selected test (asks to confirm first). If you delete the last test, a fresh empty one is created so there's always at least one.
- **New Test** (blue, top-right) — creates a fresh test titled "New Test" and selects it, **copying the current test's class list and question count** so you can re-grade the same class on a new assignment. The name field is focused for renaming.

**Setup form:**

- **Test name** — live-edits the selected test's name (the dropdowns and the Analysis title update as you type).
- **# of questions** — sets the number of question columns. Changing it resizes the selected test's grid: growing adds blank questions; shrinking removes the last columns (you're only warned before losing **marked** data — removing blank columns happens silently). After a resize, Done is recalculated so newly-complete rows are marked Done.
- **Clear** — empties the selected test's name and class list (asks to confirm if it has students).
- **Load CSV** (blue) — imports a test from a `.csv` file as a **new** test and switches to it (see [Saving & loading](#saving--loading)).
- **Class list** — one student name per line; live-edits the roster. Adding, removing, and reordering names preserves existing students' marks (matched by name).

### Grade tab

This is where you actually grade.

**Top bar:** the **Test dropdown**.

**Pinned student panel (appears when a student is pinned):** shows one student's full row on its own at the top of the page for focused grading. See pinning below.

**Tip line + actions:**

- A reminder of the cell cycle: **✓ correct · / half (50%) · ✗ wrong · — did not participate**.
- **Clear** (right) — resets every mark and Done flag for the current test, keeping the roster and questions (asks to confirm).
- **Save CSV** (blue, right) — downloads the current test as a `.csv` file (see below).

**The grading grid:**

- One **row per student**, one **column per question** (Q1, Q2, …), plus a **Score** column and a **Done** column.
- The **Student** name column and the header row stay pinned while you scroll.
- **Click a cell** to cycle its state (✓ → / → ✗ → blank).
- The **Score** pill shows each student's live percentage (hover for a correct/half/wrong breakdown).
- A footer row shows the **class % correct per question**.
- The whole grid shows on one long page — no inner scrollbar — so every student is visible.

**Collapsible sheet:** the grid has a **"Class sheet" header** — click it to collapse/expand the whole grid. Pinning a student auto-collapses it (to hide everyone else's data while you focus on one student); click the header to reopen.

**Pinning a student:**

- **Click a student's name** → a small **"Pin Student"** menu pops up. Click it to pin that student.
- The pinned student appears in their own panel at the top, fully editable and in sync with the grid.
- Only one student can be pinned at a time; pinning another replaces it.
- **Click the pinned name** (★) to unpin.

### Analysis tab

Live data analysis for the selected test. Split into two panels.

**Hero panel (always visible):**

- The **Test name** as a large title, with a **Print PDF** button (top-right, blue) — see [Print PDF](#print-pdf).
- **Score distribution pie chart** with a legend showing each band's live **percentage (bold)** and student count. Hover a slice to see the names of the students in that band. (Counts only **Done** students.)
- **"% correct by question" bar graph** — X axis = each question, Y axis = % correct (bars colored by band; black axes). Hover a bar for that question's exact `correct/attempted`.
- **Hardest** and **Easiest** questions (top 3 each) beside the graph.

**Details & student breakdown panel (collapsible):**

Click its header to collapse/expand — handy for **hiding student-name information** when projecting the charts to the class.

- **Highlights** — auto-generated, color-coded, plain-English takeaways that recompute live. Examples: grading completion, how many students meet/nearly/don't meet, the toughest question, questions the whole class got right or that no one got right, blank-cell counts and the most-skipped question, plus **half-credit-aware** insights (total partial marks and the question with the most, whole-class partial-credit questions, and students leaning most on partial credit). Hover any highlight to see the specific students it refers to.
- **Stat cards** — Students, Questions, Class average, score Range, **Students Meeting** (with live %), and Graded (Done count). Hover for details.
- **Top performers** and **Students needing attention** — the highest- and lowest-scoring students.

---

## Saving & loading

Grading is portable via CSV (one test per file).

- **Save CSV** (Grade tab) downloads the current test as `*.csv`, named `<test name> <date> <time>.csv`. The file includes the test name, question count, every student's per-question marks (`Correct` / `Half` / `Wrong` / blank), their Done flag, and score.
- **Load CSV** (Setup tab) imports a `.csv` as a **new test** and switches to it. Marks are recognized flexibly on import (e.g. `Correct`/`C`/`✓`, `Wrong`/`X`/`✗`, `Half`/`H`/`Partial`/`/`).

CSV is the portable backup; the in-browser cache (below) is the convenience layer.

## Print PDF

The **Print PDF** button (Analysis tab) builds a clean, **one-page portrait PDF report** of the analysis and downloads it (and opens it in a new tab). It includes the test title, stat cards, the pie chart with legend, the bar graph, Hardest/Easiest questions, the Highlights, and the Top performers / Needs attention lists. Generated entirely in the browser.

## Auto-save / session cache

Everything is saved **live to your browser** (`localStorage`) as you work — all tests, the active test, the active tab, pin/collapse states, and the Setup form. **Reopening or refreshing resumes exactly where you left off.** This is per-browser and survives refreshes and closing the tab, but clearing your browser data wipes it — use **Save CSV** for portable backups.

---

## Running locally

The app is fully static — just serve the folder.

**Windows (included scripts):**

- Double-click **`start.bat`** — serves the app at http://localhost:8090, opens it, and waits. Press **SPACE** to stop.
- **`stop.bat`** frees port 8090.

Because it's static, **edit a file and refresh the browser (Ctrl+F5)** to see changes — no server restart needed.

**Any platform:**

```
python -m http.server 8090 --directory <path to grading-helper>
```

Then open http://localhost:8090.

## Tech & files

Pure client-side, no build step, no dependencies to install:

- **`index.html`** — markup for the three tabs and all controls.
- **`styles.css`** — all styling.
- **`app.js`** — all logic: tests/state, grid rendering, scoring, the SVG pie & bar charts, highlights, tooltips, CSV save/load, Print PDF, and the localStorage session cache.
- **`config.js`** — small config object (`window.GRADING_HELPER_CONFIG`).
- **`start.bat` / `stop.bat`** — local dev server helpers.

External libraries are loaded from a CDN at runtime: **jsPDF** (Print PDF). The charts are hand-drawn inline **SVG** — no chart library.

Hosted on **GitHub Pages** from `main` (root), so the app must stay fully static.
