<script setup lang="ts">
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { useFirebaseAuth } from 'vuefire'
import type { ButtonProps } from '@nuxt/ui'

const router = useRouter()
const toast = useToast()
const auth = useFirebaseAuth()

const providers: ButtonProps[] = [{
  label: 'Google',
  icon: 'i-simple-icons-google',
  color: 'neutral',
  variant: 'subtle',
  block: true,
  onClick: async () => {
    if (!auth) {
      toast.add({
        title: 'Erreur',
        description: 'Service d\'authentification non disponible',
        color: 'error'
      })
      return
    }
    
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      toast.add({
        title: 'Connexion réussie',
        description: 'Vous êtes maintenant connecté',
        color: 'success'
      })
      // Rediriger vers le dashboard après connexion réussie
      await router.push('/dashboard')
    } catch (error: any) {
      console.error('Erreur lors de la connexion avec Google:', error)
      toast.add({
        title: 'Erreur de connexion',
        description: error.message || 'Une erreur est survenue lors de la connexion',
        color: 'error'
      })
    }
  }
}]
</script>

<template>
  <div class="min-h-screen flex">
    <div class="hidden lg:flex lg:w-2/5 relative overflow-hidden">
      <img
        src="https://hips.hearstapps.com/hmg-prod/images/fuel-hiit-workout-refuel-1565799893.jpg?crop=0.668xw:1.00xh;0.187xw,0"
        alt="Mealfit"
        class="w-full h-full object-cover"
      />
      <div class="absolute inset-0 bg-linear-to-r from-black/20 to-transparent" />
    </div>

    <div class="flex-1 flex flex-col items-center justify-center p-4 lg:p-8">
      <UPageCard class="w-full max-w-md">
        <UAuthForm
          title="Connexion MealFit"
          description="Connectez-vous avec votre compte Google pour accéder à votre espace."
          icon="i-lucide-lock"
          :providers="providers"
          :fields="[]"
        />
      </UPageCard>
    </div>
  </div>
</template>
