const admin = require("firebase-admin")
const serviceAccount = require("../mealfitreshape-firebase-adminsdk-fbsvc-f99ab57374.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
// Dry run par défaut : les flags passés via `npm run` peuvent être avalés (npm, PowerShell),
// on n'écrit donc que si `--apply` arrive explicitement jusqu'au script.
const dryRun = !process.argv.includes("--apply")

// Comptes admins, par e-mail : `node scripts/set-admins.cjs a@exemple.fr b@exemple.fr --apply`.
// Les admins modifient et suppriment toutes les recettes et tous les ingrédients ; les autres comptes, seulement les leurs.
// Un admin absent de la liste perd le rôle : la liste passée est la liste complète.
const emails = process.argv.slice(2).filter(arg => !arg.startsWith("--")).map(e => e.toLowerCase())

async function setAdmins() {
  if (!emails.length) {
    console.error("Indiquez au moins un e-mail : node scripts/set-admins.cjs a@exemple.fr [--apply]")
    process.exit(1)
  }

  const { users } = await admin.auth().listUsers(1000)
  const unknown = emails.filter(email => !users.some(u => u.email?.toLowerCase() === email))
  if (unknown.length) {
    console.error(`❌ Aucun compte pour : ${unknown.join(", ")}`)
    process.exit(1)
  }

  const changes = []
  for (const u of users) {
    const wanted = emails.includes(u.email?.toLowerCase())
    const current = (await db.collection("users").doc(u.uid).get()).get("admin") === true
    console.log(`${wanted ? "👑 admin " : "   membre"}  ${u.displayName ?? "?"} <${u.email}>${current === wanted ? "" : "  ← change"}`)
    if (current !== wanted) changes.push({ uid: u.uid, wanted })
  }

  if (dryRun) {
    console.log(`🔍 [dry run] ${changes.length} compte(s) à modifier ; relancez avec --apply pour écrire`)
    process.exit()
  }

  const batch = db.batch()
  // `merge` : un compte qui n'a jamais ouvert son profil n'a pas encore de document `users`.
  changes.forEach(({ uid, wanted }) => batch.set(db.collection("users").doc(uid), { admin: wanted }, { merge: true }))
  await batch.commit()
  console.log(`✅ ${changes.length} compte(s) modifié(s)`)
  process.exit()
}

setAdmins()
