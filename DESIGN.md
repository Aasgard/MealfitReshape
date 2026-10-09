---
name: Mealfit Reshape
description: A nutrition and training tracker that treats its own interface like a nutrition label — precise, tabular, quietly exact.
colors:
  primary: "oklch(58.5% 0.233 277.117)"
  primary-dark: "oklch(67.3% 0.182 276.935)"
  primary-soft: "oklch(93% 0.034 272.788)"
  macro-carbs: "oklch(72.3% 0.219 149.579)"
  macro-protein: "oklch(50.5% 0.213 27.518)"
  macro-fat: "oklch(76.9% 0.188 70.08)"
  status-under: "oklch(62.3% 0.214 259.815)"
  status-reached: "oklch(72.3% 0.219 149.579)"
  status-over: "oklch(79.5% 0.184 86.047)"
  error: "oklch(63.7% 0.237 25.331)"
  surface: "#ffffff"
  surface-elevated: "oklch(97% 0 0)"
  surface-accented: "oklch(92.2% 0 0)"
  hairline: "oklch(92.2% 0 0)"
  hairline-strong: "oklch(87% 0 0)"
  ink-dimmed: "oklch(70.8% 0 0)"
  ink-muted: "oklch(55.6% 0 0)"
  ink: "oklch(37.1% 0 0)"
  ink-highlighted: "oklch(20.5% 0 0)"
  surface-dark: "oklch(20.5% 0 0)"
  surface-elevated-dark: "oklch(26.9% 0 0)"
  surface-accented-dark: "oklch(37.1% 0 0)"
  hairline-dark: "oklch(26.9% 0 0)"
typography:
  stat-display:
    fontFamily: "Inter, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  stat:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "normal"
    fontFeature: "\"tnum\""
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "-0.025em"
  card-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "normal"
  meta:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.025em"
rounded:
  sm: "0.125rem"
  md: "0.1875rem"
  lg: "0.25rem"
  xl: "0.375rem"
  full: "9999px"
spacing:
  xs: "0.375rem"
  sm: "0.5rem"
  md: "1rem"
  card: "1.25rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  button-neutral-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  button-add-round:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    size: "28px"
  segmented-group:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.lg}"
    padding: "4px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "16px"
  section-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  badge-subtle:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  macro-bar-track:
    backgroundColor: "{colors.surface-accented}"
    rounded: "{rounded.full}"
    height: "6px"
  input-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-highlighted}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  tooltip-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-highlighted}"
    rounded: "{rounded.lg}"
    padding: "12px"
---

# Design System: Mealfit Reshape

## Overview

**Creative North Star: "The Nutrition Label"**

Mealfit Reshape reads every screen the way you read the back of a food packet: a precise, ruled readout where each number carries its unit and sits exactly where the eye expects it. Values are tabular and right-aligned, labels are small and uppercase, and rows are separated by hairlines rather than boxes. The weight page's "Relevé" grid, a single bordered block split into cells by one-pixel rules, is the label in its purest form. The weekly calendar, the sortable recipe table and the settings rows all apply the same logic to other data. This is an instrument for a small circle of people who know what they are looking at: it is precise, dry and reliable, and its personality lives in the exactness of its details (a unit that is never missing, a dash that holds a missing value's place, a column that turns indigo when it drives the sort), not in decoration.

Color is information. The interface is near-grayscale, and three color codes each own one meaning: indigo for interaction and selection, a fixed green/red/amber triad for the three macronutrients, and a blue/green/yellow triad for verdicts against a target. Nothing is tinted for atmosphere. Depth comes from hairlines and background steps, never shadows, and corners are close to square: the base radius is 2px and the largest structural surface is rounded to 6px. Nothing here tries to look soft or premium; it tries to look correct.

The one place the product admits the joke is the 404/500 page, which renders the failure as a "Fiche nutritionnelle de cette erreur" with deadpan stats ("Frustration 60 %", "Cafés recommandés 1"). That joke only lands because everything else plays it straight.

**Key Characteristics:**
- Spec-sheet reading: label-then-value pairs, tabular figures, a smaller unit beside every number, uppercase micro-labels tracked at 0.025em.
- Three color territories (interaction / macronutrient / verdict) that never borrow from each other.
- Flat by construction: hairlines (`border-default`) and background steps (`bg-default` → `bg-elevated` → `bg-accented`) carry all hierarchy.
- Near-square geometry: 2px controls, 6px cards, fully round only for bars, dots, rings and pills.
- Stable geometry: rows and slots render even when empty, so cards and table rows in a grid always align.
- Deadpan humor exists exactly once, at the failure state.

## Colors

Near-grayscale ink on white, with three small, strictly separated color codes; every hue on screen answers a question.

### Primary
- **Signal Indigo** (`primary`, indigo-500; `primary-dark`, indigo-400 in dark mode): the interaction and selection color. Solid primary buttons and the round "+" add buttons, the active option of segmented toggles (cards/list view, recipe type filters), the active sortable column header, the active settings-section icon, text links ("Plus", "Voir le dashboard"), the in-season leaf, the copied-meal state in the calendar, the weight trend line and its endpoint, goal-progress fills, and the card hover border (`border-primary/50`). Faint tints mark "current" without shouting: `bg-primary/5` on today's calendar column, `bg-primary/10` behind the leaf and copy icons. The home page's section-heading icons ("Cuisiner", "Manger") are the only wayfinding use.
- **Indigo Soft** (`primary-soft`, ≈ the `bg-primary/10` tint): background of subtle badges and icon halos. Never a surface fill.

### Macronutrient code
A fixed identity per nutrient, used for dots, bar segments and pie slices, never for verdicts.
- **Sprout Green: Glucides** (`macro-carbs`, green-500).
- **Butcher Red: Protéines** (`macro-protein`, red-700). Deep enough that it does not read as an error.
- **Oil Amber: Lipides** (`macro-fat`, amber-500).

### Target status (verdict) code
Applied only where a value is compared with a target: the calorie gauge, meal rings, macro values in the daily summary. Tolerance is ±5% for a day and ±10% for a meal.
- **Under-Target Blue** (`status-under`, Nuxt UI `info`, blue-500): not reached yet.
- **On-Target Green** (`status-reached`, Nuxt UI `success`, green-500): within tolerance.
- **Over-Target Yellow** (`status-over`, Nuxt UI `warning`, yellow-500): exceeded. Also marks "En plus" (off-plan) kcal and a weight trend running against the goal. Recipe difficulty reuses success / warning / error as an easy-to-hard scale.

### Semantic
- **Delete Red** (`error`, red-500): destructive actions, validation messages, error toasts. Success toasts use On-Target Green.

### Neutral
- **Label White** (`surface`, `#fff`): page and card background (`bg-default`). Dark mode: `surface-dark`, neutral-900.
- **Recess Gray** (`surface-elevated`, neutral-100): hover fills, the segmented-toggle well, the active settings-nav item, the sidebar at 25% opacity. Dark: neutral-800.
- **Track Gray** (`surface-accented`, neutral-200): empty bar tracks, gauge and ring tracks, image placeholders, the empty pie disc. Dark: neutral-700.
- **Hairline** (`hairline`, neutral-200): every border and divider (`border-default`), and the 1px rules of ruled grids. Dark: neutral-800.
- **Firm Hairline** (`hairline-strong`, neutral-300): the chart crosshair and other borders that must survive on top of data.
- **Headline Ink** (`ink-highlighted`, neutral-900): names, titles, headline figures. **Body Ink** (`ink`, neutral-700): default text. **Muted Ink** (`ink-muted`, neutral-500): units, secondary copy, inactive headers. **Dimmed Ink** (`ink-dimmed`, neutral-400): micro-labels, meta lines, placeholders, dashes, chart axes.

### Named Rules
**The Three Territories Rule.** Indigo means "you can act on this / this is selected / this is live". Green-red-amber means "this is glucides, protéines, lipides". Blue-green-yellow means "this is under, on, or over its target". A color never crosses into another territory: no indigo macro bars, no macro colors on buttons, no status colors without a target.

**The Verdict Needs a Target Rule.** Status colors appear only where a target exists. A single meal in the weekly calendar has no target of its own, so its figures stay neutral gray.

**The Fixed Macro Order Rule.** Macros always read G → P → L (glucides, protéines, lipides), in labels, columns, bar segments and settings. The one exception is the macro pie, which starts with protéines at twelve o'clock because the "Ratio" sort ranks by protein share.

**The Runtime Primary Rule.** The theme menu lets the user swap the primary hue and the neutral family at runtime. Always reference `primary`, `bg-elevated`, `text-muted` and the other semantic tokens, never literal `indigo-*` or `neutral-*` classes. The only literal palette classes allowed are the three macro colors.

**The Regulatory Label Exception.** The Nutri-Score scale on the product scanner keeps its official colors (A `#038141`, B `#85bb2f`, C `#fecb02`, D `#ee8100`, E `#e63e11`). It is a regulatory mark people recognize by its colors, not a fourth territory: those hues never leave that scale.

**Known debt.** Sprout Green (glucides) and On-Target Green (reached) are the same hue. They rarely share a component, but in the daily summary a green carb bar can sit beside a green "reached" value. Don't add more places where the two meet.

## Typography

**Body Font:** Inter (with `sans-serif` fallback): the only typeface in the system.

**Character:** One workhorse sans. The nutrition-label voice comes from case, weight, tracking and tabular figures, not from a second face.

### Hierarchy
- **Stat Display** (700, 2.25rem, tight tracking, tabular): the single headline figure of a readout (the 7-day weight trend in the "Relevé").
- **Headline** (700, 1.5rem, tight tracking): the page's day/period title in the sticky header ("Aujourd'hui"), the error-page headline.
- **Stat** (700, 1.5rem, tabular): secondary readout figures; the calorie gauge's centre figure steps up to 1.875rem.
- **Title** (700, 1.125rem, tight tracking): section headings inside a page ("Cuisiner", "Évolution", "Journal", "Repas & objectifs").
- **Card Title** (600, 1rem): ingredient, recipe and meal names on cards and rows.
- **Body** (400, 0.875rem): row labels, descriptions, table cells, form copy. Settings labels step up to 500.
- **Meta** (400, 0.75rem): quantities, kcal-and-macro lines ("100 g · 45 kcal · G5 P3 L0"), hints, axis ticks.
- **Label** (600, 0.75rem, 0.025em tracking, uppercase): section eyebrows ("Tendance 7 jours", "Résumé"), table column headers, the fact-sheet title.

### Named Rules
**The Value-Needs-a-Unit Rule.** A figure is never shown alone: its unit or label sits directly beside it, smaller and muted (`142` + `kcal`, `-0,35` + `kg/sem`, `20` + `g`). In tables the unit drops to Meta size in Dimmed Ink right after the value.

**The Tabular Rule.** Every figure that changes, aligns in a column or animates uses `tabular-nums`. Digits never jitter.

**The Dash Rule.** A missing value renders as an em dash (`—`) or "Valeurs non renseignées" in Dimmed Ink, keeping the slot's geometry. It is never left blank and never shown as zero.

## Layout

The app lives in Nuxt UI's dashboard shell: a collapsible, resizable left sidebar (`bg-elevated/25`, larger link text below `lg`), and a `UDashboardPanel` with a fixed navbar. Pages that move through time (Accueil, Menus) add a sticky date bar under the navbar with the day title on the left and "Aujourd'hui" / previous / next on the right. That bar sits outside the scroll area and responds to horizontal swipes. The body is padded 16px on mobile and 24px from `sm`, and sections stack with a 24px gap.

Density is tight and task-first. Catalog pages (Ingrédients, Recettes, Récipients) use a card grid of 1 → 2 (`sm`) → 4 (`lg`) columns with 16px gaps, or a list view the user switches to. In list view, a sortable table with sticky headers that scrolls inside its own frame is shown from 1024px; below that, a compact two-line list with no horizontal scroll. Only one variant is mounted at a time. Tracking and settings pages cap content at `max-w-5xl`. Settings use a 12rem sticky section index beside the content from `lg`, which becomes a horizontal scroller on mobile. Calculators cap at `max-w-2xl`. Login, landing and error pages are standalone centered layouts (`max-w-md` content column, `max-w-7xl` header bar).

Components adapt to their own width where it matters: the macro readout switches from two lines to one at a 16rem container width (container query), never based on how many digits it holds.

### Named Rules
**The Stable Geometry Rule.** Every slot renders whether or not it has content (an empty category line keeps its 20px height, missing macros render as dashes with the same layout), so the cards of a grid and the rows of a table always line up.

## Elevation & Depth

Flat by construction. No hand-authored surface in the app has a shadow. Grouping comes from `border-default` hairlines and three background steps: `bg-default` for pages and cards, `bg-elevated` for wells, hover fills and active items, and `bg-accented` for recessed tracks and placeholders. Ruled grids (`gap-px` over a `bg-border` parent) split one bordered block into cells without drawing a box around each cell. Nuxt UI's own overlays (dropdowns, modals, slideovers, toasts) keep the library's default treatment. The public landing page's floating preview card is the one tolerated shadow, because it is a showcase, not app chrome.

### Named Rules
**The Border-Not-Shadow Rule.** Never add a `box-shadow` to convey elevation inside the app. To make a surface distinct, give it a hairline or move it one background step.

**The Ruled-Grid Rule.** When several figures belong to one readout, put them in a single bordered block split by 1px rules, not in separate cards.

## Shapes

Corners are close to square. The base radius `--ui-radius` is 0.125rem (2px), and Nuxt UI derives the whole Tailwind radius scale from it: `rounded-sm` 2px, `rounded-md` 3px, `rounded-lg` 4px, `rounded-xl` 6px. Two shapes are allowed, square-ish and fully round, with nothing soft in between:

- **Square-ish:** controls and small targets at 2–3px (buttons, inputs, list thumbnails, calendar meal cards, focus rings); inner panels, tooltips, meal entries and the segmented-toggle well at 4px; cards, section panels, tables and lists at 6px, the ceiling for structural surfaces.
- **Fully round:** progress and composition bars (always round-ended, even at 6px tall), macro dots, gauge and ring strokes (`stroke-linecap: round`), status pills ("Provisoire"), avatars, and the round "+" add buttons on the home meal list.

Images are cropped to fill their frame (`object-cover`) and inherit the frame's corner: the full-width 144px header of a recipe card, 24px thumbnails in the table.

## Components

### Buttons
Precise, compact, color-driven.
- **Shape:** near-square (Nuxt UI `rounded-md`, 3px).
- **Primary:** solid Signal Indigo, white label, reserved for the main action of a view ("Ajouter une pesée", "Retour au dashboard").
- **Neutral outline / ghost:** secondary actions, row and card overflow menus (`i-lucide-ellipsis-vertical`, ghost, xs), day navigation chevrons.
- **Round add:** a solid primary icon button made fully round (`rounded-full`), one per meal row on the home page. The only pill-shaped button.
- **Hover / Focus:** Nuxt UI defaults (solid primary dims on hover). Hand-built interactive elements use a 2px `ring-primary` focus ring, inset inside tables and lists, offset on cards.

### Segmented toggles
- **Style:** a `bg-elevated` well with 4px radius and 4px padding, holding small icon buttons. Active option: solid primary. Inactive: neutral ghost. Used for the cards/list switch and the recipe-type filters. State is carried by color alone, plus `aria-pressed`.
- **Pill tabs:** period ranges on charts use Nuxt UI `UTabs` `variant="pill"` at `xs` size.

### Badges
- **Style:** Nuxt UI `variant="subtle"`, `size="sm"`. Primary when something is true and countable ("3 unités", "5 ingrédients"), neutral when empty ("Aucune unité"). Recipe-card overlay badges get a solid `bg-default` base so they stay legible over the photo.
- **Ownership:** "Privé" is the one ownership signal. In list rows it shrinks to a 10px custom pill (`bg-primary/10`, `ring-primary/25`).

### Cards
- **Corner Style:** 6px (`rounded-xl`).
- **Background:** `bg-default` with a `border-default` hairline. Hover moves the border to `border-primary/50`. No lift, no shadow.
- **Internal Padding:** 16px, content stacked with 8px gaps.
- **Anatomy (ingredient / recipe):** name (Card Title) with an overflow menu; a fixed-height meta line (category, or tags/times); the macro readout; a footer row above a hairline holding a count badge on the left and the season mark on the right ("Toute l'année" / leaf / "Hors saison").
- **Section panels:** the same frame with 16–20px padding (`p-4 sm:p-5`), a Title heading and an optional right-aligned meta ("12 pesées") or save hint.

### Lists and tables
- **Sortable table (≥ 1024px):** in a 6px bordered frame, sticky headers in uppercase Label style, Muted Ink at rest, Signal Indigo when active, with a direction arrow. The sorted column's values turn semibold Headline Ink because that's the column the eye compares. Rows are separated by hairlines and hover to `bg-elevated/60`. Numeric columns are right-aligned, with the unit trailing in Dimmed Ink.
- **Compact list (< 1024px):** two lines per row. Name with kcal and pie on the first; type, times and G/P/L on the second.
- **Sort control:** where no column header exists, a small select showing the criterion's icon or macro dot, plus an outline button that flips the direction.

### Inputs / Fields
- **Style:** Nuxt UI `variant="outline"` with a leading icon for search and filters, 3px corners. Number steppers use `UInputNumber` with tabular figures.
- **Focus:** Nuxt UI's default primary ring.
- **Setting row:** label (500, Body) and optional hint (Meta, Muted Ink) on the left, the control right-aligned. Wide controls stack under the label on mobile. Errors appear as Meta in Delete Red beneath, with `role="alert"`. Changes save immediately, confirmed by a brief success hint.

### Navigation
- **Sidebar:** vertical `UNavigationMenu`: Accueil, then grouped "Alimentation", "Suivi de mesures" and "Outils", open by default, with an icon and label per item. Tooltips and popovers when collapsed, Nuxt UI default active state. The header shows the logo avatar and "Mealfit". The footer holds the user menu (profile, settings, theme, appearance, log out).
- **Wordmark:** "MEALFIT RESHAPE", bold, tight tracking, "RESHAPE" in Signal Indigo. Used on the standalone (landing, error) headers.

### Macro readout (signature)
The nutrition label at component scale. A row of three macro dots (`size-2`, macro colors) each followed by its letter (G / P / L) and its grams in medium Headline Ink, with the kcal figure (semibold) and "kcal" on the right. Underneath, a 6px fully-round composition bar in a Track Gray track: segments in macro colors, sized by grams, separated by 2px gaps, zero-value segments omitted, width animated over 500ms. With no data, the dots and figures go gray and dashed but the geometry stays the same.

### Macro pie
A small SVG disc (14–20px) in macro colors on a Track Gray base, starting with protéines at twelve o'clock and going clockwise. It stands in for the composition bar wherever a row is too narrow (tables, compact lists, meal pickers).

### Target ring and calorie gauge
Status-colored progress. **Meal ring:** 40px, 4px stroke on a Track Gray circle, the meal's icon centered, filled to kcal ÷ target in Under / On / Over color. Off-plan rows get a plain Track Gray disc instead. **Calorie gauge:** a 270° arc open at the bottom, 16px round-capped stroke, filled with the status color, with off-plan kcal continuing the arc in Over-Target Yellow. The remaining kcal sits in the centre (1.875rem, tabular, status-colored) with "kcal restantes" / "kcal en trop" beneath. Both animate `stroke-dasharray` over 500ms.

### Ruled readout ("Relevé")
Two to four stat cells in one 6px-bordered block, split by 1px Hairline rules (`gap-px` over `bg-border`). Each cell has an uppercase Label eyebrow, a figure (Stat or Stat Display) with its unit, and one or two Meta lines of context. A cell may end with a 6px primary progress bar and its start/percent captions. The settings page uses the same construction for per-meal shares.

**Product nutrition readout** (scanner): the same block under a header row ("Valeurs nutritionnelles", "pour 100 g/ml"), holding Énergie (2.25rem) then G / P / L with their macro dots, and the composition bar in a footer row. Each value is read independently: a real `0` shows `0 g`, a missing key shows a dash and "Non renseigné" with the cell's geometry intact, an Open Food Facts estimate gets a `≈` prefix and an "Estimée par Open Food Facts" Meta line. The bar renders only when all three macros are known.

### Nutri-Score scale
Five joined cells A–E (36px tall), unselected ones pale (`color-mix` of the official color into `bg-default`, so dark mode works), the product's grade in full color, wider and 52px tall, cut out from its neighbors by a 3px `bg-default` outline. Unknown or not-applicable grades keep the band in Track Gray with no selection and a one-line explanation beside it.

### Weight trend chart
A hand-drawn SVG at real pixel width, so labels keep their size on mobile. Daily weigh-ins are small dots in Dimmed Ink, the 7-day trend is a 2.5px Signal Indigo line that draws in over 900ms, the calculator projection is a 1.5px dashed Dimmed Ink line, and the goal is a 1px Muted Ink rule with a semibold caption. Gridlines are Hairline and axis ticks are Meta in Dimmed Ink. Hover, touch and arrow keys move a Firm Hairline crosshair, with a 4px-radius tooltip listing Pesée / Tendance (indigo) / Projection. A legend of tiny inline SVG swatches sits beneath.

### Weekly menu calendar
A grid of days × meal rows, with today's column tinted `bg-primary/5`. Each cell holds 3px-radius meal cards (name in Meta medium, then quantity, kcal and G/P/L in neutral Dimmed Ink). They are draggable, and their edit / copy / delete icons turn indigo or red on hover. Each cell ends with a dashed "+" slot. A copied meal gets a solid primary border, and every "+" slot tints to show where it will paste. The drop placeholder is a dashed, faintly indigo ghost.

### Error fact sheet (signature)
The 404/500 page: a 4px-radius bordered `bg-elevated` panel headed "Fiche nutritionnelle de cette erreur" (Label), with four deadpan rows: an icon in a `bg-primary/10` square, a label, and a right-aligned tabular value. Rows reveal with an 80ms stagger over 420ms on the ease-out-expo curve, and numeric values count up over 450ms. Respects `prefers-reduced-motion`.

### Motion
Motion confirms that a value changed. It is never decoration. One curve does the expressive work, ease-out-expo `cubic-bezier(0.16, 1, 0.3, 1)`: computed content reveals over 300ms with a 6px rise, the error rows take 420ms, the trend line draws over 900ms. Bars, rings and the gauge animate width or dash over 500ms. Swiping between days slides content 32px with a fade (200ms in, 150ms out). A global `prefers-reduced-motion` rule collapses every animation and transition to near-zero.

## Do's and Don'ts

### Do:
- **Do** keep each color in its territory: indigo for interaction, selection and live data; green / red-700 / amber for G / P / L; blue / green / yellow only for a value compared with a target (The Three Territories Rule).
- **Do** reference semantic tokens (`primary`, `bg-elevated`, `text-dimmed`, `border-default`) so the runtime theme switch keeps working. Literal palette classes are reserved for the three macro colors.
- **Do** pair every figure with a smaller, muted unit beside it, and set it in `tabular-nums` (The Value-Needs-a-Unit and Tabular Rules).
- **Do** reuse the macro readout, macro pie and target ring for any new nutrition display instead of inventing a new chart.
- **Do** keep slots rendered when empty, with dashes in Dimmed Ink, so grids align (The Stable Geometry Rule).
- **Do** group related figures in one ruled block split by 1px hairlines (The Ruled-Grid Rule).
- **Do** offer a table from 1024px and a compact two-line list below it for any sortable collection, never a horizontally scrolling table on mobile.
- **Do** honor `prefers-reduced-motion` in every new animation and use the ease-out-expo curve for reveals.

### Don't:
- **Don't** add `box-shadow` to cards, panels or buttons inside the app. The landing page's floating preview is the only exception.
- **Don't** round a structural surface past `rounded-xl` (6px in this system), or give a card or panel pill-shaped corners.
- **Don't** introduce a second typeface or a display font.
- **Don't** tint large surfaces with indigo. The strongest allowed surface tint is `bg-primary/5` on the current day's column.
- **Don't** color a single meal's figures with status colors. It has no target of its own.
- **Don't** reorder the macros or reassign their colors. The macro pie's protein-first start is the only exception.
- **Don't** put more green "reached" verdicts next to green glucides elements (known debt).
- **Don't** write whimsical copy or add illustrations outside the error page. The humor is earned once, at the failure state.
