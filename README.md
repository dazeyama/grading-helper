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
  - [Subjects & colors](#subjects--colors)
  - [Tags](#tags)
  - [Cell states & scoring](#cell-states--scoring)
  - [Performance bands](#performance-bands)
  - [Done](#done)
- [The five tabs](#the-five-tabs)
  - [Setup tab](#setup-tab)
  - [Grade tab](#grade-tab)
  - [Analysis tab](#analysis-tab)
  - [Compare tab](#compare-tab)
  - [Student tab](#student-tab)
- [Saving & loading](#saving--loading)
- [Print PDF](#print-pdf)
- [Auto-save / session cache](#auto-save--session-cache)
- [Running locally](#running-locally)
- [Tech & files](#tech--files)

---

## Overview

Grading Helper turns a class roster and a test into a single grid you click through to grade everyone at once. As you mark answers, the **Analysis** tab updates live with a score-distribution pie chart, a per-question bar graph, plain-English highlights, and class statistics. You can keep **multiple tests** side by side, tag them with a color-coded **subject** (Math, Reading…), analyze a whole subject at once, compare a pre-test with a post-test, follow one student across every test, export/import tests as CSV, and print a one-page PDF report.

The interface is organized into five tabs — **Setup**, **Grade**, **Analysis**, **Compare**, and **Student**. Setup, Grade and Analysis each have a **Test** dropdown at the top so you always know (and can change) which test you're working on.

The title corner shows today's date (it rolls over at midnight on its own) and, underneath, **when the selected test was created** along with its subject.

---

## Core concepts

### Tests

A **test** is one assignment for one class. Each test has its own:

- **Name** (e.g. "Quiz 1", "Unit 3 Math Test")
- **Subject** (optional, e.g. "Math", "Reading" — see below)
- **Tags** (optional, any number, e.g. "Pre-test", "Unit 3" — see below)
- **Class list** (the roster of student names)
- **Number of questions**
- **Grades** (every student's marks, plus Done flags)
- **Creation date** (set automatically when the test is made or imported)

The app holds a whole **collection** of tests. The **Test dropdown** (mirrored on the Setup, Grade and Analysis tabs) selects which one is active; switching it swaps the entire grid and analysis. Tests are fully independent — different rosters, different question counts, different data.

If two tests share a name, the dropdown disambiguates them with a suffix: `Quiz 1 (1)`, `Quiz 1 (2)`.

### Subjects & colors

Give a test a **Subject** on the Setup tab (e.g. "Math") and pick its accent color from the **12-color picker** beside it — a pastel palette (Lavender, Peach, Aqua, Bubblegum, Sand, Grape, Apricot, Turquoise, Orchid, Cocoa, Mauve, Stone) that deliberately avoids blue, green, yellow and red, so a subject color never looks like a meets / nearly / does-not-meet band. Wherever text is drawn in or on a subject color, the app uses a darker shade of the same color so it stays readable. The color belongs to the **subject**, not the test — every Math test shares the Math color, and changing it recolors all of them. New subjects automatically get the first of the 12 colors no other subject is using (subjects colored with the earlier bold palette move to the pastel in the same slot); the Subject box suggests subjects you've already used so spellings stay consistent (matching ignores capitals).

The subject color shows up wherever a test is mentioned: a colored `●` and tint in every test dropdown (tests with no subject stay black), a colored subject chip next to the test name (Analysis title, Compare title, the Grade tab's Class sheet header, the title-corner "created" line, Student tab rows), and as the accent color of the Analysis hero panel, its class-average chip and the pinned-student panel. Tests with no subject keep the standard blue.

### Tags

Tags are free-form labels for a test, typed on the Setup tab as a comma-separated list — e.g. `Pre-test, Unit 3`. A test can have any number of tags; matching ignores capitals. Beside the Tags field, **Add a tag:** lists tags you've used on other tests — click one to add it. New Test doesn't copy tags (they usually describe one specific test).

Tags appear as small dashed chips on the Student tab, and power **Tag filters**:

- **Analysis** — a **Tag** dropdown beside the Test dropdown narrows the list of tests and which tests a **subject** view includes (e.g. Math, tagged "Post-test" only). The title shows the active tag.
- **Student** — a **Tag** dropdown limits which of the student's tests are shown and counted (subject averages, best/lowest, Tests taken).

Each Tag filter has an **Include / Exclude** checkbox after it. **Checked (Include, the default)** keeps only tests *with* the chosen tag; **unchecked (Exclude)** keeps every test *without* it — e.g. pick "Pre-test" and uncheck to see everything except pre-tests. The checkbox is greyed out while the filter is on "All tags", and is remembered along with the filter. Titles and notes say which it is ("tagged …" or "not tagged …").

A filter that's narrowing things is outlined with a dashed accent (red when excluding) so it isn't forgotten. The filters only appear once at least one test has a tag.

### Cell states & scoring

Every grade cell cycles through **four states** when clicked, in this order:

| State | Looks like | Meaning | Credit |
|-------|-----------|---------|--------|
| Blank | _(empty)_ | Did not participate / not yet graded | excluded |
| Correct | green **✓** | Full marks | 100% |
| Wrong | red **✗** | No marks | 0% |
| Half | yellow **/** | Partial credit | 50% |

Click a cell again to advance to the next state (✓ → ✗ → / → blank); it wraps back to blank after half.

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

## The five tabs

### Setup tab

The Setup tab is a **live editor** for the selected test — edits apply to that test immediately.

**Test selection bar (top):**

- **Test dropdown** — pick which test to view/edit.
- **Delete Test** (red) — permanently deletes the selected test (asks to confirm first). If you delete the last test, a fresh empty one is created so there's always at least one.
- **New Test** (blue, top-right) — creates a fresh test titled "New Test" and selects it, **copying the current test's class list, question count and subject** so you can re-grade the same class on a new assignment. The name field is focused for renaming.

**Setup form:**

- **Test name** — live-edits the selected test's name (the dropdowns and the Analysis title update as you type).
- **# of questions** — sets the number of question columns. Changing it resizes the selected test's grid: growing adds blank questions; shrinking removes the last columns (you're only warned before losing **marked** data — removing blank columns happens silently). After a resize, Done is recalculated so newly-complete rows are marked Done.
- **Subject** + color swatch — the test's subject and that subject's accent color (see [Subjects & colors](#subjects--colors)). Click the swatch to choose from 12 colors (the current one is ringed); click outside or press Esc to close. The swatch is disabled while the subject is empty.
- **Tags** — comma-separated tags for the selected test (see [Tags](#tags)), with clickable suggestions underneath.
- **Clear** — empties the selected test's name, subject, tags and class list (asks to confirm if it has students).
- **Load CSV** (blue) — imports a test from a `.csv` file as a **new** test and switches to it (see [Saving & loading](#saving--loading)).
- **Class list** — one student name per line; live-edits the roster. Adding, removing, and reordering names preserves existing students' marks (matched by name).

### Grade tab

This is where you actually grade.

**Top bar:** the **Test dropdown**.

**Pinned student panel (appears when a student is pinned):** shows one student's full row on its own at the top of the page for focused grading. See pinning below.

**Tip line + actions:**

- A reminder of the cell cycle: **✓ correct · ✗ wrong · / half (50%) · — did not participate**.
- **Clear** (right) — resets every mark and Done flag for the current test, keeping the roster and questions (asks to confirm).
- **Save CSV** (blue, right) — downloads the current test as a `.csv` file (see below).

**The grading grid:**

- One **row per student**, one **column per question** (Q1, Q2, …), plus a **Score** column and a **Done** column.
- The **Student** name column and the header row stay pinned while you scroll.
- **Click a cell** to cycle its state (✓ → ✗ → / → blank).
- The **Score** pill shows each student's live percentage (hover for a correct/half/wrong breakdown).
- A footer row shows the **class % correct per question**.
- The whole grid shows on one long page — no inner scrollbar — so every student is visible.

**Collapsible sheet:** the grid has a **"Class sheet" header** (with the test's subject chip) — click it to collapse/expand the whole grid. Pinning a student auto-collapses it (to hide everyone else's data while you focus on one student); click the header to reopen.

**Pinning a student:**

- **Click a student's name** → a small **"Pin Student"** menu pops up. Click it to pin that student.
- The pinned student appears in their own panel at the top, fully editable and in sync with the grid.
- Only one student can be pinned at a time; pinning another replaces it.
- **Click the pinned name** (★) to unpin.

### Analysis tab

Live data analysis for the selected test — **or for a whole subject**. Split into two panels.

**Test or subject:** the Analysis dropdown has two groups. **Tests** lists every test (picking one also selects it on Setup and Grade, as before). **Subjects (all tests in a subject)** lists each subject, e.g. `● Math — 3 tests`, and appears once any test has a subject. Picking a subject analyzes every test in that subject together **without** changing the test selected on Setup and Grade. Your choice is remembered.

**Hero panel (always visible):**

- The **Test name** (or subject name and test count) as a large title with its subject chip, a **Print PDF** button (top-right) — see [Print PDF](#print-pdf) — and a big **class average** chip in the subject's color.
- **Score distribution pie chart** with a legend showing each band's live **percentage (bold)** and student count. Hover a slice to see the names of the students in that band. (Single test: counts only **Done** students. Subject: bands each student by their **average across the subject**.) Tick **Chart only** (top-right of the pie panel) to hide the legend and its numbers and show the pie large and centered on its own — handy for projecting. It's off whenever the app opens, and doesn't change the Print PDF.
- **Bar graph** filling the right half of the panel:
  - Single test: **"% correct by question"** — X axis = each question, Y axis = % correct (bars colored by band; black axes). Hover a bar for that question's exact `correct/attempted`.
  - Subject: **"Class average over time"** — a dot plot showing growth: one dot per test, oldest to newest, colored by band and labelled with the test name (names tilt when there are many tests; hover a dot for the full name, date and average). A dashed **trend line** in the subject's color runs through the graded tests, with the trend (e.g. `▲ Trend: +4.5 pts per test`) shown above the chart. Needs at least two graded tests.
**Details & student breakdown panel (collapsible):**

Click its header to collapse/expand — handy for **hiding student-name information** when projecting the charts to the class.

- **Highlights** — auto-generated, color-coded, plain-English takeaways that recompute live. Single test examples: grading completion, how many students meet/nearly/don't meet, the toughest question, questions the whole class got right or that no one got right, blank-cell counts and the most-skipped question, plus **half-credit-aware** insights (total partial marks and the question with the most, whole-class partial-credit questions, and students leaning most on partial credit). Subject examples: the subject average, meets/nearly/doesn't meet by average, the highest- and lowest-average tests, whether the class average rose or fell from the first to the latest test, students who improved or dropped most from their first to latest test, students on only some of the tests, and tests not yet fully graded. Hover any highlight to see the specific students (or tests) it refers to.
- **Stat cards** — single test: Students, Questions, Class average, score Range, **Students Meeting** (with live %), and Graded (Done count). Subject: Students, Tests, Class average, Range of student averages, Students Meeting (average ≥ 70%), and Graded (students with at least one graded test). Hover for details.
- Four lists side by side: **Top performers** and **Students needing attention** (subject: by average, e.g. `avg 84% over 3 tests`), then **Hardest questions** and **Easiest questions** (top 3 each; subject: **Lowest-average tests** and **Highest-average tests**).

### Compare tab

Read-only side-by-side of two tests — e.g. a pre-test and a post-test. Pick **Before** and **After** (each dropdown is tinted with the test's subject color; ⇄ swaps them). Students are matched by name, ignoring capitals.

- **Hero panel** — the title (each side in its subject color, with subject chips) with a big **Class average** card (Before → After with the change) right-aligned on the same line, then the **Where students landed** band bars (hover a segment for its students; tick **Show numbers** to print each band's count on the bars — it's off whenever the app opens) and the grouped **% correct by question** bars. On the bar graph's X axis, question numbers turn **green and bold** if that question improved and **red and bold** if it fell.
- **Top growth** — the five students with the biggest score gains, shown as cards with just the name and the change (hover a card for the before → after scores). Click a card's **×** to hide that student from the panel; their spot simply stays empty (nobody else moves up), so the panel never shows more than the original top five. Hidden students are remembered **per Before/After pair**, even after a refresh. To bring them back, use the small **Show Hidden** button tucked under the page footer at the very bottom of the Compare tab (it also shows how many are hidden).
- **Highlights & student breakdown** (collapsible) — highlights about how the class changed, then the student table: **Student | Before | → | After | Change**, biggest gains first. Before and After scores are shaded in their band color. Classes of more than six students are split into two tables side by side.
- **More stats** — a panel at the bottom of the tab with full-size cards for **Students meeting**, **Lowest score**, **Highest score** and **Students graded** (Before → After with the change; hover for details).

### Student tab

Everything one student has done across **every test** in the app. Pick a student from the dropdown (every name on any roster, matched ignoring capitals; it shows how many tests they're on).

- **Stat cards** — an **average per subject** (e.g. "Math average", "Reading average", each with its subject color; tests with no subject get a "No subject average"), then Best test, Lowest test, and **Tests taken** out of all tests in the app (e.g. `4 / 6`).
- **Tests grouped by subject** — one group per subject (alphabetical, tests with no subject last under **No subject**), each with a colored bar, test count and average. Inside a group, tests run oldest → newest so growth reads top to bottom. Each test row shows its subject chip, name, date, question count, the student's band-colored score, a **Class average: n%** chip for comparison, a **Done ✓** badge if marked done, the student's marks for every question (hover a mark for the question), and an **Open in Grade** link that jumps to that test on the Grade tab.

---

## Saving & loading

Grading is portable via CSV (one test per file).

- **Save CSV** (Grade tab) downloads the current test as `*.csv`, named `<test name> <date> <time>.csv`. The file starts with metadata rows — `Test Name`, `Questions`, `Created` (ISO date), `Subject` and `Tags` — followed by every student's per-question marks (`Correct` / `Half` / `Wrong` / blank), their Done flag, and score.
- **Load CSV** (Setup tab) imports a `.csv` as a **new test** and switches to it. Marks are recognized flexibly on import (e.g. `Correct`/`C`/`✓`, `Wrong`/`X`/`✗`, `Half`/`H`/`Partial`/`/`). The `Created`, `Subject` and `Tags` rows are optional: without `Created` the test is dated the day it's imported; without `Subject` it has no subject; without `Tags` it has none. (Files saved by earlier versions call this row `Type`; that still loads.) The subject's color isn't stored in the file; it comes from the app.

CSV is the portable backup; the in-browser cache (below) is the convenience layer.

## Print PDF

The **Print PDF** button (Analysis tab) builds a clean, **one-page portrait PDF report** of the analysis and downloads it (and opens it in a new tab). It includes the test title, stat cards, the pie chart with legend, the bar graph, Hardest/Easiest questions, the Highlights, and the Top performers / Needs attention lists. In subject mode it prints the subject view instead (titled with the subject, with the "Class average over time" trend chart and lowest/highest-average tests), saved as `<Subject> <date> analysis.pdf`. Generated entirely in the browser.

## Auto-save / session cache

Everything is saved **live to your browser** (`localStorage`) as you work — all tests (including their subjects, tags and creation dates), the subject colors, the Analysis and Student tag filters, the active test, the active tab, the Analysis test/subject choice, the Details-panel collapse state, Top growth hidden students, the Student tab selection, and the Setup form. (Pinning a student is temporary and isn't saved.) Caches from older versions load cleanly: existing tests start with no subject, and their creation date is recovered automatically. **Reopening or refreshing resumes exactly where you left off.** This is per-browser and survives refreshes and closing the tab, but clearing your browser data wipes it — use **Save CSV** for portable backups.

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

- **`index.html`** — markup for the five tabs and all controls.
- **`styles.css`** — all styling.
- **`app.js`** — all logic: tests/state, subjects & colors, grid rendering, scoring, the SVG pie & bar charts, single-test and subject analysis, Compare, the Student tab, highlights, tooltips, CSV save/load, Print PDF, and the localStorage session cache.
- **`config.js`** — small config object (`window.GRADING_HELPER_CONFIG`).
- **`start.bat` / `stop.bat`** — local dev server helpers.

External libraries are loaded from a CDN at runtime: **jsPDF** (Print PDF). The charts are hand-drawn inline **SVG** — no chart library.

Hosted on **GitHub Pages** from `main` (root), so the app must stay fully static.
