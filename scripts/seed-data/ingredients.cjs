const admin = require("firebase-admin")
const serviceAccount = require("../../mealfitreshape-firebase-adminsdk-fbsvc-f99ab57374.json")
const ingredients = require("./ingredients-seed.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

async function seed() {
  const categoryRef = db.collection("ingredientCategories").doc("unknown")
  const skipped = []
  const importedAsMl = []
  let count = 0

  for (const item of ingredients) {
    if (item.mesure !== "100g" && item.mesure !== "100ml") {
      skipped.push(item.nom.trim())
      continue
    }

    if (item.mesure === "100ml") {
      importedAsMl.push(item.nom.trim())
    }

    const now = admin.firestore.Timestamp.now()
    await db.collection("ingredients").add({
      label: item.nom.trim(),
      category: categoryRef,
      activeMonths: item.saisonnalite,
      comment: "",
      variations: {},
      valuesBy100: {
        calories: item.calories,
        protein: item.proteines,
        carbohydrates: item.glucides,
        fat: item.lipides
      },
      ...(item.mesure === "100ml" ? { density: 1 } : {}),
      owner: null,
      createdAt: now,
      updatedAt: now
    })
    count++
  }

  console.log(`✅ ${count} ingrédients importés`)
  if (importedAsMl.length) {
    console.log(`💧 ${importedAsMl.length} ingrédients importés depuis une mesure "100ml" (valeurs stockées telles quelles pour 100g, densité par défaut = 1) :`)
    console.log(importedAsMl.join(", "))
  }
  if (skipped.length) {
    console.log(`⚠️  ${skipped.length} ingrédients ignorés (mesure "alapiece", non convertible en valeurs pour 100g) :`)
    console.log(skipped.join(", "))
  }
  process.exit()
}

seed()
