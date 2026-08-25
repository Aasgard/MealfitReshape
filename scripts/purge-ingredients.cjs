const admin = require("firebase-admin")
const serviceAccount = require("../mealfitreshape-firebase-adminsdk-fbsvc-f99ab57374.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

async function purge() {
  const collectionRef = db.collection("ingredients")
  let deleted = 0

  while (true) {
    const snapshot = await collectionRef.limit(500).get()
    if (snapshot.empty) break

    const batch = db.batch()
    snapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    deleted += snapshot.size
  }

  console.log(`🗑️  ${deleted} ingrédients supprimés`)
  process.exit()
}

purge()
