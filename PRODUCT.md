# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are the owner and a small circle of people they share the app with (training partners, family) — not an anonymous general public. People using it know each other and the context; the product does not need to assume onboarding of strangers at scale.

## Product Purpose

Mealfit Reshape is a nutrition and physical-activity tracking tool. It lets users catalog ingredients, build recipes from them, and calculate nutrition-related figures (daily caloric/macro needs, endurance fueling) to support everyday eating and training decisions.

## Positioning

A straightforward ingredients/recipes/nutrition tracker with built-in calculators (daily caloric and macro needs; trail-running pace and carbohydrate fueling) — not primarily an endurance-athlete product with tracking as a side feature. The calculators are useful bonus tools layered on a general nutrition-tracking core.

## Operating Context

- French-language household/small-group use: ingredient catalog (shared/public entries plus user-owned entries), recipes built from those ingredients, a daily-needs calculator (BMR/TDEE/macros, WHO/FAO/UNU-based activity factors), and a trail running pace/fueling calculator.
- Users authenticate via Firebase; some data (e.g. public catalog ingredients) is shared across users, other data (recipes, personal ingredients) is owner-scoped.
- Planned but not yet built: weekly menu planning, shopping list, and a physical-activity tracking section (present in the dashboard nav as placeholders).

## Capabilities and Constraints

- Confirmed: ingredient catalog with categories, seasonality (active months), per-100-unit macros, and units/equivalents; recipes referencing ingredient lines with quantity and unit; a daily nutritional needs calculator; a trail running pace/carb-fueling calculator; Firebase-backed auth and data.
- Constraint: French-only UI — no i18n/English support to design around.
- Constraint: Firebase/Firestore is the fixed backend and auth provider.
- Constraint: Nuxt UI (@nuxt/ui) is the fixed component library.
- Undecided: whether "Menus de la semaine," "Liste de courses," and "Activité physique" get built out, and in what form.

## Brand Commitments

Name: Mealfit (product), displayed as "MEALFIT RESHAPE" in the site header wordmark. Existing logo at `/logo.jpg` (app config) / `public/logo.png`. Primary color: indigo (Nuxt UI `primary: indigo`).

## Evidence on Hand

No real user content, testimonials, or case studies on hand — dashboard currently seeds a fake demo recipe (`app/data/fakeRecipe.json`) for testing. Future work must not present this or invented data as real evidence.

## Product Principles

1. Keep the experience in French and scoped to people who know the product's context — no need to design for cold, anonymous onboarding.
2. Treat the nutrition tracker (ingredients/recipes) as the core; calculators are supporting tools, not the headline feature.
3. Preserve Firebase/Firestore and Nuxt UI as fixed technical foundations rather than proposing alternatives.
4. Respect the owner/shared-data split already in the data model (public catalog vs. user-owned entries) when designing new flows.
