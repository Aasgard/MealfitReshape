import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import type { Recipe } from '~/types/recipe'

/**
 * Photos des recettes (Storage `users/{uid}/recipes`). Une recette dupliquée garde l'URL de la photo
 * sans en devenir propriétaire : avant de supprimer un fichier, on vérifie qu'aucune autre recette ne l'affiche.
 */
export const useRecipePhotos = () => {
  const db = useFirestore()
  const photos = useUserPhotos('recipes')

  /** Supprime la photo que `recipe` référençait, sauf si une autre recette l'affiche encore. */
  const removeIfUnused = async (recipe: Pick<Recipe, 'id' | 'imageUrl' | 'imagePath'>) => {
    if (!recipe.imagePath) return
    if (recipe.imageUrl) {
      try {
        const others = await getDocs(query(collection(db, 'recipes'), where('imageUrl', '==', recipe.imageUrl), limit(2)))
        if (others.docs.some(d => d.id !== recipe.id)) return
      } catch (error) {
        // Dans le doute, on garde le fichier : un orphelin vaut mieux qu'une image cassée.
        console.warn('Usage de la photo non vérifié :', recipe.imagePath, error)
        return
      }
    }
    await photos.remove(recipe.imagePath)
  }

  return { ...photos, removeIfUnused }
}
