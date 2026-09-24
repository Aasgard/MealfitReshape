const fs = require("fs")
const path = require("path")
const admin = require("firebase-admin")
const serviceAccount = require("../../mealfitreshape-firebase-adminsdk-fbsvc-f99ab57374.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

const CSV_PATH = path.join(__dirname, "ciqual_fruits_legumes_olea_legumi.csv")
const CIQUAL_COMMENT = "Données Ciqual"

/**
 * Codes de sous-groupe Ciqual (colonne `categorie_id`) vers les catégories d'ingrédients.
 */
const CATEGORY_MAPPING = {
  201: "vegetables",
  202: "cereals_starches",
  203: "legumes",
  204: "fruits",
  205: "nuts_seeds"
}

/**
 * Parseur CSV minimal gérant les champs entre guillemets contenant des virgules
 * (ex. `alim_nom_fr`) et les guillemets doublés (`""`).
 */
function parseCsvLine(line) {
  const fields = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char === "\"") {
        if (line[i + 1] === "\"") {
          current += "\""
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === "\"") {
      inQuotes = true
    } else if (char === ",") {
      fields.push(current)
      current = ""
    } else {
      current += char
    }
  }

  fields.push(current)
  return fields
}

function loadCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "")
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0)
  const header = parseCsvLine(lines[0])

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row = {}
    header.forEach((key, index) => {
      row[key] = values[index]
    })
    return row
  })
}

async function purgeExisting() {
  const collectionRef = db.collection("ingredients")
  let deleted = 0

  while (true) {
    const snapshot = await collectionRef.where("comment", "==", CIQUAL_COMMENT).limit(500).get()
    if (snapshot.empty) break

    const batch = db.batch()
    snapshot.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
    deleted += snapshot.size
  }

  return deleted
}

async function seed() {
  const rows = loadCsv(CSV_PATH)
  const purged = await purgeExisting()
  if (purged) {
    console.log(`🗑️  ${purged} aliments Ciqual existants supprimés avant réimport`)
  }

  const skipped = []
  let count = 0

  for (const row of rows) {
    const label = row.alim_nom_fr?.trim()
    const calories = parseFloat(row.energie_kcal_100g)
    const fat = parseFloat(row.lipides_g_100g)
    const protein = parseFloat(row.proteines_g_100g)
    const carbohydrates = parseFloat(row.glucides_g_100g)
    const categoryId = CATEGORY_MAPPING[row.categorie_id?.trim()]

    if (!categoryId || !label || [calories, fat, protein, carbohydrates].some(Number.isNaN)) {
      skipped.push(label || row.alim_code)
      continue
    }

    const now = admin.firestore.Timestamp.now()
    await db.collection("ingredients").add({
      label,
      category: db.collection("ingredientCategories").doc(categoryId),
      activeMonths: Array.from({ length: 12 }, (_, i) => i + 1),
      comment: CIQUAL_COMMENT,
      units: {},
      valuesBy100: {
        calories,
        protein,
        carbohydrates,
        fat
      },
      owner: null,
      createdAt: now,
      updatedAt: now
    })
    count++
  }

  console.log(`✅ ${count} aliments Ciqual importés`)
  if (skipped.length) {
    console.log(`⚠️  ${skipped.length} lignes ignorées (catégorie inconnue, données manquantes ou invalides) :`)
    console.log(skipped.join(", "))
  }
  process.exit()
}

seed()
