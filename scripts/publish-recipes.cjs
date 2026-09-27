const admin = require("firebase-admin")
const serviceAccount = require("../mealfitreshape-firebase-adminsdk-fbsvc-f99ab57374.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
// Dry run par défaut : les flags passés via `npm run` peuvent être avalés (npm, PowerShell),
// on n'écrit donc que si `--apply` arrive explicitement jusqu'au script.
const dryRun = !process.argv.includes("--apply")

async function publish() {
  const snapshot = await db.collection("recipes").get()
  const docs = snapshot.docs.filter(doc => doc.get("owner") !== null)

  if (dryRun) {
    docs.forEach(doc => console.log(`- ${doc.id} ${doc.get("title") ?? ""} (owner: ${doc.get("owner")})`))
    console.log(`🔍 [dry run] ${docs.length} recettes seraient passées en owner null`)
    process.exit()
  }

  for (let i = 0; i < docs.length; i += 500) {
    const batch = db.batch()
    docs.slice(i, i + 500).forEach(doc => batch.update(doc.ref, { owner: null }))
    await batch.commit()
  }

  console.log(`🌍 ${docs.length} recettes passées en owner null`)
  process.exit()
}

publish()
