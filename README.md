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
  - [Rubric templates](#rubric-templates)
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

Grading Helper turns a class roster and a test into a single grid you click through to grade everyone at once. As you mark answers, the **Analysis** tab updates live with a score-distribution pie chart, a per-question bar graph, plain-English highlights, and class statistics. You can keep **multiple tests** side by side, grade each one **Standard** (✓ / ✗ / half per question) or against a **Rubric** you build, tag them with a color-coded **subject** (Math, Reading…), analyze a whole subject at once, compare a pre-test with a post-test, follow one student across every test, export/import tests as CSV, and print a one-page PDF report.

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
- **Grading type** — **Standard** (questions marked ✓ / ✗ / half) or **Rubric** (each student scored against rubric tables)
- **Number of questions** (Standard tests)
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

Each Tag filter reads as a sentence: **Show tests [With | Without] tag [name]**. **With** keeps only tests that have the tag; **Without** keeps every test that doesn't. The choice is remembered.

A filter that's narrowing things is outlined with a dashed accent (red when excluding) so it isn't forgotten. The filters only appear once at least one test has a tag.

### Rubric templates

A **rubric template** is a reusable rubric that any number of **Rubric** tests can share. When a test's Grading type is Rubric, the Setup tab shows a **Rubric template** row:

- **Choose** a rubric from the dropdown. Changing a test's rubric clears that test's rubric scores (you're asked first if it has any).
- **Create Rubric** opens the rubric editor. A new rubric is selected for the current test automatically, unless the test already has scores against a different rubric.
- **Edit** opens the editor on the selected rubric; nothing changes until you click **Save rubric**. If other tests use the rubric and your edit removes or resizes a table or changes a score value, you're warned that scores which no longer fit will be cleared.
- **Delete** removes the rubric after you confirm. It's blocked while any test with scores uses it (the message lists those tests).
- **Export** downloads the rubric as `<name> rubric.csv`; **Import** adds a rubric from such a file (a duplicate name gets " (imported)" added) and selects it for the current test.
- **Print PDF** saves the selected rubric (blank — every table, every level's text) as a **one-page PDF**, e.g. to hand out before the assignment.

**The rubric editor** (a pop-up window):

- **Rubric name** (required).
- **+ Create table** — choose **Rows** (2–10) × **Score levels** (2–10) and click **Add**. Each table has a **title**, ↑ / ↓ to reorder (table order = column order on the Grade tab), and **Remove table** (asks first if it has text).
- Each **score level** (column) has a number (any number; each must be different within a table) and one of four colors — **blue, green, amber, red** — the same colors as the performance bands. New tables are colored best → worst automatically (e.g. 4 levels: blue, green, amber, red; 3: green, amber, red); click a swatch to change it. The colors matter: the suggested band for a student is worked out from the colors of the levels they score.
- Every cell is a text box describing that level.
- **Cancel**, Esc, or clicking outside asks before throwing away unsaved changes.

**Rubric CSV format** — one rubric per file, readable as plain text or in Excel/Sheets:

```
Rubric Name,Essay Rubric
Tables,2

Table,Thesis
Score,4,3,2,1
Color,blue,green,amber,red
Level 1,Clear and arguable,Mostly clear,Vague,Missing
Level 2,Previews every point,Previews most,Previews some,No preview

Table,Evidence
…
```

The `Level N` labels are only for reading; on import, the rows between `Color` (or `Score`) and the next blank line or `Table` row are the table's rows. Colors are matched ignoring capitals (unknown → green); with no `Color` row, colors are assigned automatically.

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

Scores are grouped into four color-coded bands, used everywhere a score is rated: the pie chart and legend, bar and dot colors, Done-row highlights, score pills, Compare's "Where students landed" and its student table:

- 🔵 **Exceeds** — 90% and up
- 🟢 **Meets** — 70%–89%
- 🟡 **Nearly meets** — 51%–69%
- 🔴 **Does not meet** — 50% and below

**The color rule, on every tab:** blue = exceeds, green = meets, amber = nearly, red = does not meet. Those four colors are reserved for rating performance — neutral highlights are slate gray, Compare's "Before" bars are gray, and subject colors are pastels from other color families, so nothing else looks like a rating. ("Students Meeting" counts everyone at 70% and up — Meets **and** Exceeds.)

**Exceeds band toggle.** The Analysis, Compare and Student tabs each have an **Exceeds band On / Off** button at the right end of their top bar (one shared setting, remembered). **On** shows the four bands above. **Off** goes back to the three-band view on those tabs: 90%+ is shown as green **Meets** (Meets = 70% and up), so there's no blue anywhere — the pie has three slices, band counts read "N meet, N nearly, N do not meet", and rubric students with an Exceeds band show as Meets. Handy when projecting, so green dominates and nobody's color stands apart. It only changes what's shown: saved bands don't change, Print PDF matches the screen, and the **Grade** tab always shows all four bands.

### Done

A row is marked **Done** when every question for that student has been graded (no blanks remain). This happens **automatically** as you fill the last cell, and reverts if you blank a cell again. You can also toggle Done manually with the row's **Done** button (e.g. to mark a partially-graded student finished anyway).

Done rows are **highlighted in their band color** (blue / green / amber / red), with a matching accent bar; the ✓/✗ marks keep their own colors so the row stays readable.

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
- **Grading type** — **Standard** or **Rubric**. New Test copies it (and, for rubric tests, the rubric) from the current test. Switching an existing test:
  - If the test already has grading data, you're asked to confirm first.
  - The old type's data is **kept, not deleted**: switch back and it returns exactly as it was. Students are matched by name to the current class list, so names you added or removed in the meantime are handled — new names start blank.
  - A type the test has never used starts clean (no marks / no rubric scores).
  - The Grade tab's **Clear** only clears the type you're currently using.
  - Rubric tests hide **# of questions** (they're scored per rubric table) and show the rubric controls instead; until a rubric is chosen, the Grade tab says so.
- **# of questions** (Standard tests) — sets the number of question columns. Changing it resizes the selected test's grid: growing adds blank questions; shrinking removes the last columns (you're only warned before losing **marked** data — removing blank columns happens silently). After a resize, Done is recalculated so newly-complete rows are marked Done.
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

**Grading a Rubric test** (once a rubric is chosen on the Setup tab — until then the Grade tab says so):

- **The grid:** one column per rubric table (title, with its score range underneath; hover for each level's score and color), then **Score** and **Done**.
  - Each cell has a **score dropdown** — pick the level the student earned. The dropdown is tinted with that level's color. **▦** opens that rubric table read-only for that student: if you marked cells in their full rubric (below), it shows **exactly those cells**, marked the same way; otherwise the whole chosen column is shaded. The chosen score's header says "← chosen" either way.
  - **Score** shows the student's **band pill** — Exceeds / Meets / Nearly meets / **DNM** (does not meet) in the band colors. It's **suggested** from the scores: each chosen level's color counts (blue = exceeds, green = meets, amber = nearly, red = does not meet), averaged across the tables, with a halfway result rounding **down** (e.g. halfway between meets and exceeds → Meets). Hover the pill for the scores and total (e.g. `Thesis 4 · Evidence 3 — total 7/8 (88%)`).
  - **Click the pill** to override the band (Exceeds / Meets / Nearly meets / DNM), or choose **Auto** to go back to the suggestion. An overridden pill has a dashed outline.
  - **Done** turns on by itself once every table has a score (and off if you clear one); the button still lets you toggle it. Done rows are highlighted in the band color.
  - The footer shows the **class average per table** (e.g. `3.2 / 4`) and the **band spread** — counts in blue·green·amber·red order (hover for names).
- **Click a student's name** to open their **full rubric** in a pop-up (instead of pinning, which is Standard-only):
  - **Overall:** the band pill, the band dropdown (Auto / override) and the suggestion with points (e.g. `Suggested: Meets — 10/12 (83%)`).
  - **Every table in full**, with a **Score** dropdown. **Click the cells that describe the student's work** — each click marks/unmarks a cell (any number, in any column). Marked cells set that table's score to the average of their levels, rounded to the nearest score the table offers (a tie goes to the higher score). Changing the dropdown doesn't touch the marked cells; **clear picks** unmarks them and leaves the score as it was.
  - **◀ Prev / Next ▶** move through the class without closing; **Mark Done ✓ / Reopen**; everything saves as you go (there's no Save button).
  - **Print PDF** saves the student's whole rubric as a **one-page PDF** — name, test, overall band with points, and every table with the chosen score and the cells you marked (filled in the level's color with a check). The text shrinks, and the page turns sideways if that fits better, so everything stays on one page.
- **Clear** (toolbar) resets every rubric score, mark, band and Done flag — the roster and rubric stay.

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

- **Highlights** — auto-generated, color-coded, plain-English takeaways that recompute live. Single test examples: grading completion, how many students exceed/meet/nearly/don't meet (plus a blue highlight naming everyone who exceeds), the toughest question, questions the whole class got right or that no one got right, blank-cell counts and the most-skipped question, plus **half-credit-aware** insights (total partial marks and the question with the most, whole-class partial-credit questions, and students leaning most on partial credit). Subject examples: the subject average, exceed/meet/nearly/don't meet by average, the highest- and lowest-average tests, whether the class average rose or fell from the first to the latest test, students who improved or dropped most from their first to latest test, students on only some of the tests, and tests not yet fully graded. Hover any highlight to see the specific students (or tests) it refers to.
- **Stat cards** — single test: Students, Questions, Class average, score Range, **Students Meeting** (with live %), and Graded (Done count). Subject: Students, Tests, Class average, Range of student averages, Students Meeting (average ≥ 70%), and Graded (students with at least one graded test). Hover for details.
- Four lists side by side: **Top performers** and **Students needing attention** (subject: by average, e.g. `avg 84% over 3 tests`), then **Hardest questions** and **Easiest questions** (top 3 each; subject: **Lowest-average tests** and **Highest-average tests**).

**Rubric tests on the Analysis tab.** A rubric test's score is **points earned ÷ points possible** over the tables it has been scored on (so a half-graded student still has a meaningful %), and its band is the one shown on the Grade tab — including any band you set by hand.

- Single rubric test: the title gets a **Rubric** chip; the class-average chip is the mean of those %s; the pie counts Done students by their band; the bar graph becomes **Average score by table** (one bar per table at average ÷ top score, labelled with the table title, colored by the level nearest the average; hover for e.g. `Thesis: avg 3.2 / 4 (80%)`); the lists become **Lowest-scoring tables** / **Highest-scoring tables**; the stat cards show **Tables** instead of Questions; and the highlights are about tables (lowest / highest table, students not yet scored on every table, bands set by hand) instead of questions.
- Subject view: rubric and standard tests are combined by % — a highlight notes how many rubric tests are included.

### Compare tab

Read-only side-by-side of two tests — e.g. a pre-test and a post-test. Pick **Before** and **After** (each dropdown is tinted with the test's subject color; ⇄ swaps them). Students are matched by name, ignoring capitals.

- **Hero panel** — the title (each side in its subject color, with subject chips) with a big **Class average** card (Before → After with the change) right-aligned on the same line, then the **Where students landed** band bars (hover a segment for its students; tick **Show numbers** to print each band's count on the bars — it's off whenever the app opens) and the grouped **% correct by question** bars. On the bar graph's X axis, question numbers turn **green and bold** if that question improved and **red and bold** if it fell.
- **Top growth** — the five students with the biggest score gains, shown as cards with just the name and the change (hover a card for the before → after scores). Click a card's **×** to hide that student from the panel; their spot simply stays empty (nobody else moves up), so the panel never shows more than the original top five. Hidden students are remembered **per Before/After pair**, even after a refresh. To bring them back, use the small **Show Hidden** button tucked under the page footer at the very bottom of the Compare tab (it also shows how many are hidden).
- **Highlights & student breakdown** (collapsible) — highlights about how the class changed, then the student table: **Student | Before | → | After | Change**, biggest gains first. Before and After scores are shaded in their band color. Classes of more than six students are split into two tables side by side.
- **More stats** — a panel at the bottom of the tab with full-size cards for **Students meeting**, **Lowest score**, **Highest score** and **Students graded** (Before → After with the change; hover for details).
- **Rubric tests** compare by % and by band (a band set by hand counts). The per-question bar graph only makes sense for two Standard tests, so whenever a rubric test is involved it's replaced by a short note.

### Student tab

Everything one student has done across **every test** in the app. Pick a student from the dropdown (every name on any roster, matched ignoring capitals; it shows how many tests they're on).

- **Stat cards** — an **average per subject** (e.g. "Math average", "Reading average", each with its subject color; tests with no subject get a "No subject average"), then Best test, Lowest test, and **Tests taken** out of all tests in the app (e.g. `4 / 6`).
- **Tests grouped by subject** — one group per subject (alphabetical, tests with no subject last under **No subject**), each with a colored bar, test count and average. Inside a group, tests run oldest → newest so growth reads top to bottom. Each test row shows its subject chip, name, date, question count, the student's band-colored score, a **Class average: n%** chip for comparison, a **Done ✓** badge if marked done, the student's marks for every question (hover a mark for the question), and an **Open in Grade** link that jumps to that test on the Grade tab. **Rubric tests** show a chip per rubric table instead (e.g. `Thesis 4`, colored by the level) and the band label (e.g. `Meets`, `DNM`) instead of a % — hover it for the %.

---

## Saving & loading

Grading is portable via CSV (one test per file).

- **Save CSV** (Grade tab) downloads the current test as `*.csv`, named `<test name> <date> <time>.csv`. The file starts with metadata rows — `Test Name`, `Questions`, `Grading Type`, `Created` (ISO date), `Subject` and `Tags` — followed by every student's per-question marks (`Correct` / `Half` / `Wrong` / blank), their Done flag, and score.
  - **Rubric tests** save `Test Name`, `Grading Type,Rubric`, `Rubric,<rubric name>`, `Created`, `Subject`, `Tags`, then one row per student — `Student, <one column per rubric table>, Band, Done, Score` (e.g. `Ada Lovelace,4,3,3,Meets,Done,83%`) — and finally a **`Rubric Definition`** section holding the whole rubric (same format as a rubric export), so the file is self-contained. Marked cells from the student panel are working notes and aren't saved to the file.
- **Load CSV** (Setup tab) imports a `.csv` as a **new test** and switches to it. Marks are recognized flexibly on import (e.g. `Correct`/`C`/`✓`, `Wrong`/`X`/`✗`, `Half`/`H`/`Partial`/`/`). The `Created`, `Subject` and `Tags` rows are optional: without `Created` the test is dated the day it's imported; without `Subject` it has no subject; without `Tags` it has none. (Files saved by earlier versions call this row `Type`; that still loads.) The subject's color isn't stored in the file; it comes from the app. Files without a `Grading Type` row load as Standard.
  - **Rubric test files** load as a Rubric test. Its rubric is taken from the `Rubric Definition` section: if you already have a rubric with the same name and exactly the same tables it's reused, otherwise it's added (with " (imported)" if the name is taken). Score columns are matched to tables by title; a `Band` that differs from what the scores suggest is kept as a band set by hand.

CSV is the portable backup; the in-browser cache (below) is the convenience layer.

## Print PDF

The **Print PDF** button (Analysis tab) builds a clean, **one-page portrait PDF report** of the analysis and downloads it (and opens it in a new tab). It includes the test title, stat cards, the pie chart with legend, the bar graph, Hardest/Easiest questions, the Highlights, and the Top performers / Needs attention lists. In subject mode it prints the subject view instead (titled with the subject, with the "Class average over time" trend chart and lowest/highest-average tests), saved as `<Subject> <date> analysis.pdf`. For a rubric test it prints the rubric view ("Average score by table" and lowest/highest-scoring tables). Generated entirely in the browser.

## Auto-save / session cache

Everything is saved **live to your browser** (`localStorage`) as you work — all tests (including their subjects, tags, creation dates, grading type, and any data kept from the other grading type), the rubric templates, the subject colors, the Analysis and Student tag filters, the active test, the active tab, the Analysis test/subject choice, the Details-panel collapse state, Top growth hidden students, the Student tab selection, and the Setup form. (Pinning a student is temporary and isn't saved.) Caches from older versions load cleanly: existing tests become **Standard** tests with no subject, and their creation date is recovered automatically (the only visible change is that students at 90%+ now show as blue **Exceeds**). **Reopening or refreshing resumes exactly where you left off.** This is per-browser and survives refreshes and closing the tab, but clearing your browser data wipes it — use **Save CSV** for portable backups.

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
- **`app.js`** — all logic: tests/state, grading types (Standard / Rubric) and switching, subjects & colors, tags, rubric templates (editor, CSV import/export), the Standard and rubric grading grids and the student rubric panel, scoring and bands, the SVG pie, bar and trend charts, single-test, rubric and subject analysis, Compare, the Student tab, highlights, the shared pop-up window, tooltips, CSV save/load, Print PDF, and the localStorage session cache.
- **`config.js`** — small config object (`window.GRADING_HELPER_CONFIG`).
- **`start.bat` / `stop.bat`** — local dev server helpers.

External libraries are loaded from a CDN at runtime: **jsPDF** (Print PDF). The charts are hand-drawn inline **SVG** — no chart library.

Hosted on **GitHub Pages** from `main` (root), so the app must stay fully static.
