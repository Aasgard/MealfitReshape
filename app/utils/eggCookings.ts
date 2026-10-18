/** Cuissons d'œufs proposées par les minuteurs (page Minuteurs, fiche recette). Temps pour un œuf moyen (calibre M). */
export const EGG_COOKINGS = [
  { label: 'Coque', minutes: 3 },
  { label: 'Poché', minutes: 3 },
  { label: 'Mollet', minutes: 6 },
  { label: 'Dur', minutes: 10 },
] as const

export type EggCooking = typeof EGG_COOKINGS[number]

/** Nom du minuteur lancé : « Œuf coque », « Œuf dur »… */
export const eggTimerLabel = (egg: EggCooking) => `Œuf ${egg.label.toLowerCase()}`
