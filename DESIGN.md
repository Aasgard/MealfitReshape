---
name: Mealfit Reshape
description: A nutrition and training tracker that treats its own interface like a nutrition label — precise, tabular, quietly witty.
colors:
  primary: "oklch(58.5% 0.233 277.117)"
  primary-deep: "oklch(51.1% 0.262 276.966)"
  primary-soft: "oklch(93% 0.034 272.788)"
  neutral-bg: "oklch(98.5% 0 0)"
  neutral-surface: "oklch(100% 0 0)"
  neutral-border: "oklch(92.2% 0 0)"
  neutral-text-muted: "oklch(55.6% 0 0)"
  neutral-text-dimmed: "oklch(70.8% 0 0)"
  neutral-text-highlighted: "oklch(20.5% 0 0)"
  success: "oklch(72.3% 0.219 149.579)"
  error: "oklch(63.7% 0.237 25.331)"
typography:
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
rounded:
  sm: "0.125rem"
  md: "0.5rem"
  lg: "0.75rem"
  full: "9999px"
spacing:
  xs: "0.375rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{neutral-bg}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-neutral-outline:
    backgroundColor: "transparent"
    textColor: "{neutral-text-highlighted}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{neutral-surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  badge-subtle:
    backgroundColor: "{primary-soft}"
    textColor: "{primary-deep}"
    rounded: "{rounded.full}"
---

# Design System: Mealfit Reshape

## Overview

**Creative North Star: "The Nutrition Label"**

Mealfit Reshape presents every screen the way it presents an ingredient: as a precise, tabular readout. Numbers lead, labels are small and uppercase, values sit right-aligned like a spec sheet. This isn't a lifestyle app performing warmth — it's an instrument for a small circle of people (the owner, training partners, family) who already know what they're looking for and want the data laid out cleanly. The clearest evidence of this identity living outside the obvious screens is the custom 404/500 error page: it renders the failure itself as a "Fiche nutritionnelle de cette erreur" (nutritional fact sheet of this error), with rows of stats ("Frustration: 60%", "Cafés recommandés: 1") that count up and stagger into view. The joke only works because the rest of the product is genuinely built like a spec sheet — the error page just admits it out loud.

Indigo is the one signal color in an otherwise near-grayscale interface, and it's allowed to run electric: full-saturation solid buttons, a bright halo behind status icons, a solid progress fill on macro bars. It never diffuses into backgrounds or borders — those stay strictly neutral — so indigo reads as "this is active / this is yours / this is in season," not as ambient branding.

Corners are close to square (2px base radius token), density is tight, and depth comes from borders and background-level contrast rather than shadows. Nothing here tries to look soft or premium; it tries to look correct.

**Key Characteristics:**
- Data-sheet layout: label-then-value pairs, right-aligned numbers, uppercase micro-labels with tracked-out letter-spacing.
- Indigo used sparingly but at full saturation — never tinted into surfaces, always a deliberate "this is active" signal.
- Flat by construction: no shadows anywhere in the codebase; hierarchy comes from `border-default` and background steps (`bg-default` / `bg-elevated` / `bg-accented`).
- Near-square corners (2px base radius) that read clinical, not soft.
- A found deadpan humor (the error page) that the rest of the UI earns by being genuinely precise elsewhere — don't manufacture whimsy anywhere else.

## Colors

Almost grayscale with one electric accent; color is information, not decoration.

### Primary
- **Indigo Électrique** (`oklch(58.5% 0.233 277.117)`, Tailwind indigo-500): the only accent in the system. Used at full strength on primary buttons, active filter-toggle buttons (season/variations filters), the "in season" card border, the macro-bar fill, and a 10%-opacity halo behind status icons. Never used as a background tint for large surfaces.
- **Indigo Deep** (`oklch(51.1% 0.262 276.966)`, indigo-600): hover/active state for primary buttons and the wordmark's "RESHAPE" accent word.
- **Indigo Soft** (`oklch(93% 0.034 272.788)`, indigo-100): reserved for the rare tinted badge or icon halo background (`bg-primary/10`), not for general surfaces.

### Neutral
- **Paper White** (`oklch(98.5% 0 0)`, neutral-50): app background (`bg-default`).
- **Surface White** (`oklch(100% 0 0)`): card and panel surfaces (`bg-elevated`, sidebar at 25% opacity).
- **Hairline** (`oklch(92.2% 0 0)`, neutral-200): the default border color (`border-default`) that carries almost all of the app's structural hierarchy.
- **Muted Text** (`oklch(55.6% 0 0)`, neutral-500): secondary text — categories, descriptions, unit labels.
- **Dimmed Text** (`oklch(70.8% 0 0)`, neutral-400): tertiary text — slideover field eyebrows, least-emphasized numbers.
- **Highlighted Text** (`oklch(20.5% 0 0)`, neutral-900): primary text — titles, headline numbers, ingredient names.

### Semantic
- **Success Green** (`oklch(72.3% 0.219 149.579)`, green-500): success toasts only.
- **Error Red** (`oklch(63.7% 0.237 25.331)`, red-500): destructive actions (delete) and error toasts only.

### Named Rules
**The One Signal Rule.** Indigo appears only where something is active, selected, or in-progress (a pressed filter toggle, an in-season border, a filled macro bar, a solid button). It never colors a static surface. If indigo is present, something is true right now.

## Typography

**Body Font:** Inter (with `sans-serif` fallback) — the only typeface in the system; the "Nutrition Label" character comes from spacing and case, not from a display face.

**Character:** One workhorse sans, pushed toward a data-sheet feel through uppercase tracked-out labels and tabular alignment rather than through a second typeface.

### Hierarchy
- **Title** (700, 1.5rem/24px, tight tracking): page headers and error-page headline ("Page introuvable.").
- **Card Title** (600, ~1rem, default tracking): ingredient names, card headings.
- **Body** (400, 0.875rem/14px, 1.5 line-height): descriptions, category labels, general copy.
- **Numeral** (700, 1.5rem/24px, tabular): headline stat values (calories per 100g, error-page counters) — always paired with a small unit label beside it, never alone.
- **Label** (600, 0.75rem/12px, 0.05em tracking, uppercase): section eyebrows ("Pour 100g", "Glucides", "Fiche nutritionnelle de cette erreur") and macro-row micro-labels.

### Named Rules
**The Value-Needs-a-Unit Rule.** A large numeral is never shown without a smaller unit or label directly beside it (`142` + `kcal`, `60` + `%`) — the data-sheet reading only works when every number is legible without hunting for context.

## Layout

Dashboard shell (Nuxt UI's `UDashboardGroup`): a collapsible, resizable sidebar (`bg-elevated/25`) on the left, main content in a `UDashboardPanel` with a fixed `UDashboardNavbar` header and a scrollable body padded `p-4` on mobile, `p-6` from `sm:` up.

Content density is tight: filter bars stack vertically on mobile and go horizontal (`flex-row gap-3`) from `sm:` up; card grids run `grid-cols-1` → `sm:grid-cols-2` → `lg:grid-cols-4` at `gap-4`. Standalone centered layouts (login, error page) cap at `max-w-md` for the content column and `max-w-7xl` for the header bar. Nothing in the product uses a wide marketing-style container — every surface is Operate-mode: dense, task-first, no generous whitespace for its own sake.

## Elevation & Depth

Flat by construction — there is no `box-shadow` anywhere in the codebase. Depth and grouping are conveyed entirely through `border-default` hairlines and background-level steps (`bg-default` for the page, `bg-elevated` for panels/sidebar, `bg-accented` for recessed elements like the macro-bar track). A card is "raised" only in the sense that it has a border and sits on a lighter or darker background than its container, never through a shadow.

### Named Rules
**The Border-Not-Shadow Rule.** Never introduce a `box-shadow` to convey elevation. If a surface needs to read as distinct, give it a `border-default` and/or move it one background step (`bg-default` → `bg-elevated` → `bg-accented`).

## Shapes

Corners run close to square: the base radius token (`--ui-radius: 0.125rem`, 2px) scales all of Nuxt UI's own component radii tighter than the library's defaults, which is why buttons and inputs read clinical rather than soft. Hand-authored surfaces layer three deliberate exceptions on top of that base: cards and panels use `rounded-lg`/`rounded-xl` (8–12px) for a still-tight but touchable corner, pills/badges/avatars use `rounded-full`, and progress-bar tracks are always fully rounded regardless of their (often very thin) height. There is no intermediate "medium-rounded" card anywhere — a surface is either near-square (control-level) or fully pill-shaped (status/progress-level); nothing sits at Tailwind's default `rounded-md` softness.

## Components

### Buttons
- **Shape:** near-square (2px base radius via `--ui-radius`), never pill-shaped except icon-only toggle buttons at small sizes.
- **Primary:** solid indigo background, white text — the only fully-saturated surface in the interface. Reserved for the single most important action per view ("Ajouter un ingrédient", "Retour au dashboard").
- **Neutral outline/ghost:** transparent or bordered, `color="neutral"` — used for secondary actions and for filter toggles in their "off" state.
- **Toggle buttons:** icon-only, square, switch between `variant="outline" color="neutral"` (off) and `variant="solid" color="primary"` (on) — state is entirely color-driven, no separate active-state icon.

### Badges
- **Style:** `variant="subtle"`, small size, `rounded-full` — used sparingly for a single ownership signal ("Privé") on cards, not as a general tagging device.

### Cards / Containers
- **Corner Style:** `rounded-xl` (12px).
- **Background:** `bg-default`, border `border-default` at rest; border shifts to full-strength `border-primary` when the ingredient is in season — the border itself is the seasonality indicator, not a separate badge.
- **Shadow Strategy:** none (see Elevation & Depth); hover state is a border-color shift to `border-primary/50`, not a lift.
- **Internal Padding:** `p-4` (16px), content stacked with `gap-2`.

### Inputs / Selects
- **Style:** `variant="outline"`, leading icon (search, category, visibility), `rounded-sm` corners matching the base radius token.
- **Focus:** relies on Nuxt UI's default ring treatment; no custom override observed.

### Progress / Macro Bars
- **Style:** a 2px-tall (`h-2`) fully-rounded track in `bg-accented`, filled by a `bg-primary` (or `bg-primary/60` for a secondary macro) bar that animates its width over 500ms. This is the product's signature data-visualization primitive — every "amount of X out of a scale" reading in the app should reuse this exact shape, not a numeric-only readout.

### Navigation
- **Style:** vertical `UNavigationMenu` inside the collapsible sidebar; icon + label per item, nested children indent under a `defaultOpen` parent. Active/hover state is Nuxt UI's default, undecorated further.

### Error Fact Sheet (signature component)
The 404/500 page's defining custom component: a bordered card headed "Fiche nutritionnelle de cette erreur," listing 4 deadpan stat rows (icon, label, right-aligned value) that reveal with an 80ms stagger and a 450ms ease-out count-up on numeric values, respecting `prefers-reduced-motion`. This is the clearest, most deliberate expression of the North Star and the reference to imitate when a new surface needs to feel unmistakably "Mealfit" rather than generically "Nuxt UI dashboard."

## Do's and Don'ts

### Do:
- **Do** keep indigo reserved for active/selected/in-progress states only (The One Signal Rule) — a screen with indigo everywhere has lost the signal.
- **Do** pair every large numeral with a smaller unit or label beside it (The Value-Needs-a-Unit Rule).
- **Do** convey elevation with `border-default` and background steps, never `box-shadow` (The Border-Not-Shadow Rule).
- **Do** reuse the macro-bar primitive (`bg-accented` track + `bg-primary` animated fill) for any new "amount relative to a scale" display.
- **Do** treat the error page's data-sheet humor as evidence of the brand's real voice when a new surface needs personality, not as a one-off joke to leave alone.

### Don't:
- **Don't** introduce a second typeface or a display/hero font — the data-sheet feel comes from Inter's spacing and case, not from typographic variety.
- **Don't** add drop shadows to cards, buttons, or panels for a "lifted" look.
- **Don't** round corners past `rounded-xl` (12px) on structural surfaces, or below `rounded-full` on pills/badges — nothing should land at a generic `rounded-md` softness.
- **Don't** tint large surfaces with indigo (backgrounds, page sections); keep it on controls, borders, and fills only.
- **Don't** invent whimsical copy or illustration elsewhere in the product to match the error page's tone — that humor is earned once, at the failure state, precisely because the rest of the app plays it straight.
