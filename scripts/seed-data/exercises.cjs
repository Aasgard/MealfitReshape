const admin = require("firebase-admin")
const serviceAccount = require("../../mealfitreshape-firebase-adminsdk-fbsvc-f99ab57374.json")
// Même liste que le catalogue intégré à l'appli : une fois importée, la collection peut être corrigée ou enrichie
// (un document de même id prend le pas sur l'exercice intégré).
const exercises = require("../../app/utils/exerciseCatalog.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

async function seed() {
  const batch = db.batch()
  const now = admin.firestore.FieldValue.serverTimestamp()
  for (const { id, ...exercise } of exercises) {
    batch.set(db.collection("exercises").doc(id), { ...exercise, owner: null, createdAt: now, updatedAt: now }, { merge: true })
  }
  await batch.commit()

  console.log(`✅ ${exercises.length} exercices importés`)
  process.exit()
}

seed()
