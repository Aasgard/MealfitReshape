const admin = require("firebase-admin")
const serviceAccount = require("../mealfitreshape-firebase-adminsdk-fbsvc-f99ab57374.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
// Dry run par défaut : les flags passés via `npm run` peuvent être avalés (npm, PowerShell),
// on n'écrit donc que si `--apply` arrive explicitement jusqu'au script.
const dryRun = !process.argv.includes("--apply")

// Le champ est mis à null et non supprimé : l'app filtre avec `where('owner', '==', null)`,
// qui ne renvoie pas les documents où le champ est absent.
const targets = [
  { collection: "recipes", field: "owner" },
  { collection: "ingredients", field: "owner" },
  { collection: "meals", field: "user" }
]

async function resetCollection({ collection, field }) {
  const snapshot = await db.collection(collection).get()
  const docs = snapshot.docs.filter(doc => doc.get(field) !== null)

  if (dryRun) {
    console.log(`🔍 [dry run] ${collection} : ${docs.length} documents seraient passés en ${field} null`)
    return
  }

  for (let i = 0; i < docs.length; i += 500) {
    const batch = db.batch()
    docs.slice(i, i + 500).forEach(doc => batch.update(doc.ref, { [field]: null }))
    await batch.commit()
  }

  console.log(`✅ ${collection} : ${docs.length} documents passés en ${field} null`)
}

async function reset() {
  for (const target of targets) await resetCollection(target)
  process.exit()
}

reset()
