import Anthropic from '@anthropic-ai/sdk'
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import type {
  CatalogBook,
  CatalogCategory,
  CatalogIngredient,
  DishImageBox,
  ProposedIngredient,
  ReadIngredientLine,
  RecipeReading,
} from '#shared/types/recipeReading'

/**
 * Lit une recette sur 1 à 4 photos (page de livre ou de magazine, capture d'écran) avec Claude, et rapproche ses
 * ingrédients du catalogue envoyé par le navigateur (la route n'a pas accès à Firestore).
 * Corps multipart : `photo` (répété, dans l'ordre des pages), `catalog` (JSON `CatalogIngredient[]`) et
 * `categories` (JSON `CatalogCategory[]`). Réservé aux comptes connectés : chaque appel est facturé.
 * Les photos ne font que transiter : rien n'est stocké.
 */

/** Champs absents codés par des valeurs neutres ("" ou -1) : la sortie structurée reste simple, la route les traduit. */
const READING_FORMAT = betaJSONSchemaOutputFormat({
  type: 'object',
  properties: {
    isRecipe: { type: 'boolean', description: 'Les photos montrent bien le texte d\'une recette.' },
    title: { type: 'string', description: 'Titre de la recette ; "" si absent.' },
    persons: { type: 'number', description: 'Nombre de parts ou de personnes ; -1 si non indiqué.' },
    prepTime: { type: 'number', description: 'Préparation en minutes ; -1 si non indiquée.' },
    cookTime: { type: 'number', description: 'Cuisson en minutes ; -1 si non indiquée, 0 si la recette est sans cuisson.' },
    instructions: { type: 'string', description: 'Étapes, une par ligne, numérotées « 1. », « 2. »…' },
    source: { type: 'string', description: 'Livre, magazine, site ou compte lisible sur les photos ; "" sinon.' },
    bookId: { type: 'string', description: 'Id d\'un livre de la bibliothèque fournie d\'où vient la recette ; "" si aucun ne correspond.' },
    page: { type: 'string', description: 'Numéro de page imprimé de la recette (« 42 », ou « 42-43 » sur deux pages) ; "" s\'il n\'est pas lisible.' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'La ligne telle qu\'écrite sur la page.' },
          status: { type: 'string', enum: ['matched', 'check', 'unmatched'] },
          note: { type: 'string', description: 'Pour "check" : l\'hypothèse faite, en quelques mots ; "" sinon.' },
          ingredientId: { type: 'string', description: 'Id d\'un ingrédient du catalogue ; "" pour "unmatched".' },
          unitId: { type: 'string', description: 'Id d\'une unité de cet ingrédient ; "" = quantité en grammes.' },
          quantity: { type: 'number', description: 'Quantité dans unitId (ou en grammes si unitId vaut "").' },
          grams: { type: 'number', description: 'Équivalent approximatif en grammes.' },
          proposal: {
            type: 'object',
            description: 'Pour "unmatched" seulement : l\'ingrédient à créer. Pour les autres statuts, label "" et valeurs à 0.',
            properties: {
              label: { type: 'string', description: 'Nom au singulier, sans quantité ni préparation, ex. « Échalote ».' },
              categoryId: { type: 'string', description: 'Id d\'une catégorie fournie ; "" si aucune ne convient.' },
              calories: { type: 'number', description: 'kcal pour 100 g.' },
              protein: { type: 'number', description: 'Protéines pour 100 g, en grammes.' },
              carbohydrates: { type: 'number', description: 'Glucides pour 100 g, en grammes.' },
              fat: { type: 'number', description: 'Lipides pour 100 g, en grammes.' },
              unitLabel: { type: 'string', description: 'Unité employée par la recette (« Gousse ») ; "" si grammes ou millilitres.' },
              unitValue: { type: 'number', description: 'Poids ou volume d\'une unité ; 0 si pas d\'unité.' },
              unitKind: { type: 'string', enum: ['g', 'ml'] },
            },
            required: ['label', 'categoryId', 'calories', 'protein', 'carbohydrates', 'fat', 'unitLabel', 'unitValue', 'unitKind'],
            additionalProperties: false,
          },
        },
        required: ['text', 'status', 'note', 'ingredientId', 'unitId', 'quantity', 'grams', 'proposal'],
        additionalProperties: false,
      },
    },
    dishImage: {
      type: 'object',
      description: 'Photo du plat terminé présente sur une page ; photoIndex -1 s\'il n\'y en a pas.',
      properties: {
        photoIndex: { type: 'number', description: 'Numéro de la photo (0 = première) ; -1 si aucune.' },
        x: { type: 'number', description: 'Bord gauche, en fraction de la largeur (0 → 1).' },
        y: { type: 'number', description: 'Bord haut, en fraction de la hauteur (0 → 1).' },
        width: { type: 'number', description: 'Largeur, en fraction de la largeur.' },
        height: { type: 'number', description: 'Hauteur, en fraction de la hauteur.' },
      },
      required: ['photoIndex', 'x', 'y', 'width', 'height'],
      additionalProperties: false,
    },
  },
  required: ['isRecipe', 'title', 'persons', 'prepTime', 'cookTime', 'instructions', 'source', 'bookId', 'page', 'ingredients', 'dishImage'],
  additionalProperties: false,
})

const SYSTEM_PROMPT = `Tu recopies des recettes de cuisine pour une application de suivi nutritionnel française.
On te donne une à quatre photos d'une même recette, dans l'ordre des pages : page de livre ou de magazine, ou capture d'écran (site, réseau social). Les ingrédients peuvent être sur une page et les étapes sur une autre : fusionne-les en une seule recette.

Recopie fidèlement, sans rien inventer :
- Titre, nombre de parts, temps de préparation et de cuisson tels qu'écrits (convertis les heures en minutes). Ce qui n'est pas écrit reste absent.
- Instructions : le texte des étapes, une étape par ligne, numérotées. Corrige seulement les coupures de mots et de lignes dues à la mise en page.
- Source : le nom du livre, du magazine, du site ou du compte s'il est lisible (en-tête, pied de page, filigrane).
- Livre : si un titre ou un auteur lisible sur les photos (même en partie) désigne un livre de la bibliothèque fournie, donne son id dans bookId ; sinon "". Sans indice écrit, ne devine pas.
- Page : le numéro de page imprimé de la recette (« 42 », « 42-43 » si elle tient sur deux pages) ; "" s'il n'est pas lisible ou pour une capture d'écran.

Ingrédients : une entrée par ligne de la liste d'ingrédients, dans l'ordre. Pour chacune, choisis dans le catalogue fourni l'ingrédient qui correspond (synonymes, pluriels, variantes : « échalotes » → Échalote, « huile d'olive vierge extra » → Huile d'olive). Ignore la préparation (« émincé », « à température ambiante »).
- Si l'ingrédient a une unité qui correspond à celle de la recette (« 2 gousses » → unité Gousse), utilise-la avec la quantité écrite. Sinon, convertis en grammes (unitId "") : les millilitres avec la densité de l'aliment, les cuillères (café ≈ 5 ml, soupe ≈ 15 ml), les verres, pincées, pièces avec un poids réaliste.
- status "matched" : ingrédient trouvé et quantité reprise sans hypothèse (unité de l'ingrédient, ou grammes écrits).
- status "check" : ingrédient trouvé mais quantité déduite : conversion d'une mesure approximative (verre, pincée, pièce, cuillère convertie), ou quantité non précisée (« sel, poivre », « selon votre goût »). Donne alors une petite quantité réaliste et écris l'hypothèse dans note, ex. « 1 verre compté 200 g », « quantité non précisée ».
- status "unmatched" : aucun ingrédient du catalogue ne correspond vraiment (ne force pas un rapprochement approximatif : « crème de coco » n'est pas « crème fraîche »). Remplis proposal : nom, catégorie parmi celles fournies, valeurs pour 100 g d'après la table CIQUAL, et l'unité de la recette s'il y en a une (« 1 gousse » → Gousse, 5 g). quantity est alors dans cette unité, ou en grammes s'il n'y en a pas.
- grams : toujours l'équivalent approximatif en grammes de la ligne.
- Un même ingrédient en plusieurs lignes (pâte et garniture) reste en plusieurs lignes.

Photo du plat : si une page contient une photo du plat terminé, donne son cadre (fractions de la largeur et de la hauteur de cette photo-là), au ras de l'image, sans le texte ni les marges autour. Ignore les photos d'étapes, d'ingrédients seuls, les illustrations décoratives et les visages. S'il y en a plusieurs, prends la plus grande.

Si les photos ne montrent pas de recette (plat seul, document sans rapport, texte illisible), isRecipe vaut false.`

/** Images que l'API accepte ; le client envoie normalement du JPEG (photos réduites dans le navigateur). */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type ImageType = typeof IMAGE_TYPES[number]

const MAX_PHOTOS = 4
/** Sous la limite de 4,5 Mo des fonctions Vercel, en laissant la place au catalogue. */
const MAX_PHOTOS_BYTES = 4 * 1024 * 1024
const MAX_CATALOG_BYTES = 400 * 1024

function parseJsonPart<T>(data: Buffer | undefined, label: string): T {
  if (!data) return [] as T
  if (data.length > MAX_CATALOG_BYTES) throw createError({ statusCode: 413, message: `${label} trop volumineux.` })
  try {
    return JSON.parse(data.toString('utf8')) as T
  } catch {
    throw createError({ statusCode: 400, message: `${label} illisible.` })
  }
}

/** Le catalogue vient du navigateur : on ne garde que des entrées bien formées. */
function sanitizeCatalog(raw: unknown): CatalogIngredient[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (typeof item?.id !== 'string' || typeof item?.label !== 'string') return []
    const units = Array.isArray(item.units)
      ? item.units.filter((u: any) => typeof u?.id === 'string' && typeof u?.label === 'string'
          && typeof u?.value === 'number' && (u.unit === 'g' || u.unit === 'ml'))
      : []
    return [{ id: item.id, label: item.label, units }]
  })
}

function sanitizeBooks(raw: unknown): CatalogBook[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(b => typeof b?.id === 'string' && typeof b?.title === 'string').map(b => ({
    id: b.id,
    title: b.title,
    authors: Array.isArray(b.authors) ? b.authors.filter((a: unknown) => typeof a === 'string') : [],
  }))
}

/** Bibliothèque en une ligne par livre : id, titre, auteurs. */
function booksPrompt(books: CatalogBook[]) {
  const lines = books.map(b => (b.authors.length ? `${b.id} | ${b.title} | ${b.authors.join(', ')}` : `${b.id} | ${b.title}`))
  return `Bibliothèque de livres de cuisine (id | titre | auteurs) :\n${lines.join('\n') || '(vide)'}`
}

function sanitizeCategories(raw: unknown): CatalogCategory[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(c => typeof c?.id === 'string' && typeof c?.label === 'string').map(c => ({ id: c.id, label: c.label }))
}

/** Une ligne par ingrédient, plus compacte que du JSON : id, nom, puis unités (id=libellé, valeur). */
function catalogPrompt(catalog: CatalogIngredient[], categories: CatalogCategory[]) {
  const ingredientLines = catalog.map((i) => {
    const units = i.units.map(u => `${u.id}=${u.label} (${u.value} ${u.unit})`).join(' ; ')
    return units ? `${i.id} | ${i.label} | unités : ${units}` : `${i.id} | ${i.label}`
  })
  const categoryLines = categories.map(c => `${c.id} | ${c.label}`)
  return `Catalogue d'ingrédients (id | nom | unités) :\n${ingredientLines.join('\n') || '(vide)'}\n\n`
    + `Catégories d'ingrédients (id | nom) :\n${categoryLines.join('\n') || '(aucune)'}`
}

const round = (n: number, digits = 0) => {
  const factor = 10 ** digits
  return Math.round(Math.max(0, n) * factor) / factor
}

const optionalMinutes = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.round(n) : null)

type RawLine = {
  text: string
  status: 'matched' | 'check' | 'unmatched'
  note: string
  ingredientId: string
  unitId: string
  quantity: number
  grams: number
  proposal: {
    label: string
    categoryId: string
    calories: number
    protein: number
    carbohydrates: number
    fat: number
    unitLabel: string
    unitValue: number
    unitKind: 'g' | 'ml'
  }
}

/**
 * Ne garde que des ids présents dans le catalogue envoyé : un ingrédient inconnu devient une ligne à associer,
 * une unité inconnue repasse en grammes (à vérifier), une quantité absente aussi.
 */
function normalizeLine(raw: RawLine, catalogById: Map<string, CatalogIngredient>, categoryIds: Set<string>): ReadIngredientLine {
  const text = raw.text.trim()
  const grams = round(raw.grams, 1)
  const ingredient = raw.status !== 'unmatched' ? catalogById.get(raw.ingredientId) : undefined

  if (!ingredient) {
    const p = raw.proposal
    const unit = p.unitLabel.trim() && p.unitValue > 0
      ? { label: p.unitLabel.trim(), value: round(p.unitValue, 1), unit: p.unitKind }
      : null
    const proposal: ProposedIngredient = {
      label: p.label.trim() || text,
      categoryId: categoryIds.has(p.categoryId) ? p.categoryId : '',
      calories: round(p.calories),
      protein: round(p.protein, 1),
      carbohydrates: round(p.carbohydrates, 1),
      fat: round(p.fat, 1),
      unit,
    }
    return {
      text,
      status: 'unmatched',
      note: '',
      ingredientId: null,
      unitId: null,
      quantity: unit && raw.quantity > 0 ? round(raw.quantity, 2) : grams,
      grams,
      proposal,
    }
  }

  let status = raw.status
  let note = raw.note.trim()
  let unitId: string | null = raw.unitId && ingredient.units.some(u => u.id === raw.unitId) ? raw.unitId : null
  let quantity = round(raw.quantity, 2)

  if (raw.unitId && !unitId) {
    quantity = grams
    status = 'check'
    note ||= 'Quantité convertie en grammes'
  }
  if (quantity <= 0) {
    unitId = null
    quantity = grams > 0 ? grams : 1
    status = 'check'
    note ||= 'Quantité non précisée'
  }
  if (status === 'check' && !note) note = 'Quantité estimée'
  if (status === 'matched') note = ''

  return { text, status, note, ingredientId: ingredient.id, unitId, quantity, grams, proposal: null }
}

/** Un cadre trop petit ou hors de l'image n'est pas une photo du plat exploitable. */
function normalizeDishImage(raw: DishImageBox, photoCount: number): DishImageBox | null {
  if (!Number.isInteger(raw.photoIndex) || raw.photoIndex < 0 || raw.photoIndex >= photoCount) return null
  const x = Math.min(Math.max(raw.x, 0), 1)
  const y = Math.min(Math.max(raw.y, 0), 1)
  const width = Math.min(raw.width, 1 - x)
  const height = Math.min(raw.height, 1 - y)
  if (width < 0.1 || height < 0.1) return null
  return { photoIndex: raw.photoIndex, x, y, width, height }
}

export default defineEventHandler(async (event): Promise<RecipeReading> => {
  await requireUser(getHeader(event, 'authorization'))

  const parts = await readMultipartFormData(event) ?? []
  const photos = parts.filter(p => p.name === 'photo' && p.data.length > 0)

  if (photos.length === 0) throw createError({ statusCode: 400, message: 'Ajoutez au moins une photo de la recette.' })
  if (photos.length > MAX_PHOTOS) throw createError({ statusCode: 400, message: `${MAX_PHOTOS} photos au maximum.` })
  if (photos.some(p => !IMAGE_TYPES.includes(p.type as ImageType))) {
    throw createError({ statusCode: 400, message: 'Format de photo non pris en charge.' })
  }
  if (photos.reduce((total, p) => total + p.data.length, 0) > MAX_PHOTOS_BYTES) {
    throw createError({ statusCode: 413, message: 'Photos trop lourdes.' })
  }

  const catalog = sanitizeCatalog(parseJsonPart(parts.find(p => p.name === 'catalog')?.data, 'Catalogue'))
  const categories = sanitizeCategories(parseJsonPart(parts.find(p => p.name === 'categories')?.data, 'Catégories'))
  const books = sanitizeBooks(parseJsonPart(parts.find(p => p.name === 'books')?.data, 'Bibliothèque'))

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    // Le catalogue change rarement d'une lecture à l'autre : mis en cache, il ne coûte qu'une fois pour plusieurs recettes.
    { type: 'text', text: catalogPrompt(catalog, categories), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: booksPrompt(books) },
    ...photos.flatMap((p, index): Anthropic.Beta.BetaContentBlockParam[] => [
      { type: 'text', text: `Photo ${index} :` },
      { type: 'image', source: { type: 'base64', media_type: p.type as ImageType, data: p.data.toString('base64') } },
    ]),
    { type: 'text', text: photos.length > 1 ? 'Recopie cette recette, répartie sur ces photos.' : 'Recopie cette recette.' },
  ]

  // Clé lue dans ANTHROPIC_API_KEY (variable d'environnement Vercel, jamais exposée au navigateur).
  const client = new Anthropic()
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      // Au-delà, le SDK exige le streaming (réponse potentiellement plus longue que 10 min) ; une recette tient largement dedans.
      max_tokens: 16000,
      // Rapprochement et conversions demandent un peu de réflexion, sans faire attendre plus de quelques dizaines de secondes.
      output_config: { effort: 'medium', format: READING_FORMAT },
      // Si les filtres de sécurité refusent la requête, l'API la rejoue sur un autre modèle.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })

    const output = response.parsed_output
    if (response.stop_reason === 'refusal' || !output) {
      throw createError({ statusCode: 502, message: 'Claude n\'a pas pu lire cette recette.' })
    }
    if (!output.isRecipe) {
      throw createError({ statusCode: 422, message: 'Aucune recette lisible sur ces photos. Cadrez la page entière, bien à plat et éclairée.' })
    }

    const catalogById = new Map(catalog.map(i => [i.id, i]))
    const categoryIds = new Set(categories.map(c => c.id))
    return {
      title: output.title.trim(),
      persons: output.persons > 0 ? Math.round(output.persons) : null,
      prepTime: optionalMinutes(output.prepTime),
      cookTime: optionalMinutes(output.cookTime),
      instructions: output.instructions.trim(),
      source: output.source.trim(),
      // Seul un id de la bibliothèque envoyée compte : un id inventé laisse la source en texte.
      bookId: books.some(b => b.id === output.bookId) ? output.bookId : null,
      page: output.page.trim().replace(/^p(?:ages?)?\.?\s*/i, '').slice(0, 12),
      ingredients: (output.ingredients as RawLine[])
        .filter(line => line.text.trim())
        .map(line => normalizeLine(line, catalogById, categoryIds)),
      dishImage: normalizeDishImage(output.dishImage, photos.length),
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw createError({ statusCode: 429, message: 'Trop de demandes, réessayez dans un instant.' })
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Lecture Claude impossible :', error.status, error.message)
      throw createError({ statusCode: 502, message: 'Le service de lecture ne répond pas.' })
    }
    throw error
  }
})
