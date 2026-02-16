const admin = require("firebase-admin")
const serviceAccount = require("../../mealfitreshape-firebase-adminsdk-fbsvc-fa4bd1fdf9.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

const categories = [
  { id: "vegetables", label: "Légumes", order: 1, icon: "carrot" },
  { id: "fruits", label: "Fruits", order: 2, icon: "apple" },
  { id: "legumes", label: "Légumineuses", order: 3, icon: "bean" },
  { id: "cereals_starches", label: "Céréales & Féculents", order: 4, icon: "wheat" },
  { id: "bread_cereal_products", label: "Pain & Produits céréaliers", order: 5, icon: "sandwich" },
  { id: "flours_baking", label: "Farines & Aides à la pâtisserie", order: 6, icon: "cookie" },
  { id: "nuts_seeds", label: "Fruits secs & Graines", order: 7, icon: "nut" },
  { id: "meat", label: "Viandes", order: 8, icon: "beef" },
  { id: "seafood", label: "Poissons & Fruits de mer", order: 9, icon: "fish" },
  { id: "eggs", label: "Œufs", order: 10, icon: "egg" },
  { id: "dairy", label: "Produits laitiers", order: 11, icon: "milk" },
  { id: "plant_based_alternatives", label: "Alternatives végétales", order: 12, icon: "leaf" },
  { id: "fats_oils", label: "Huiles & Matières grasses", order: 13, icon: "droplet" },
  { id: "sweeteners", label: "Produits sucrants", order: 14, icon: "candy" },
  { id: "condiments_sauces", label: "Condiments & Sauces", order: 15, icon: "utensils" },
  { id: "herbs_spices", label: "Herbes & Épices", order: 16, icon: "sprout" },
  { id: "beverages", label: "Boissons", order: 17, icon: "glass-water" },
  { id: "processed_foods", label: "Produits transformés", order: 18, icon: "package" },
  { id: "sports_nutrition", label: "Nutrition sportive", order: 19, icon: "dumbbell" }
]

async function seed() {
  for (const category of categories) {
    await db.collection("ingredientCategories").doc(category.id).set(category)
  }

  console.log("✅ Categories seeded")
  process.exit()
}

seed()