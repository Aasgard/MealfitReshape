<script setup lang="ts">
import { signOut } from 'firebase/auth'
import { useFirebaseAuth, useCurrentUser } from 'vuefire'
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()
const appConfig = useAppConfig()
const router = useRouter()
const toast = useToast()
const auth = useFirebaseAuth()

const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const neutrals = ['slate', 'gray', 'zinc', 'neutral', 'stone']

const currentUser = await useCurrentUser()

if (!currentUser.value) {
  // Handle the case where the user is not logged in, e.g.:
  // You might want to redirect or show a login prompt
  // For now, log and return
  console.warn('User is not logged in.')
}

const user = computed(() => {
  const val = currentUser.value
  return {
    name: val?.displayName || val?.email || '',
    avatar: {
      src: val?.photoURL || '',
      alt: val?.displayName || val?.email || '',
    }
  }
})

const items = computed<DropdownMenuItem[][]>(() => ([[{
  type: 'label',
  label: user.value.name,
  avatar: user.value.avatar
}], [{
  label: 'Profil',
  icon: 'i-lucide-user'
}, {
  label: 'Réglages',
  icon: 'i-lucide-settings'
}], [{
  label: 'Thème',
  icon: 'i-lucide-palette',
  children: [{
    label: 'Primary',
    slot: 'chip',
    chip: appConfig.ui.colors.primary,
    content: {
      align: 'center',
      collisionPadding: 16
    },
    children: colors.map(color => ({
      label: color.charAt(0).toUpperCase() + color.slice(1),
      chip: color,
      slot: 'chip',
      checked: appConfig.ui.colors.primary === color,
      type: 'checkbox',
      onSelect: (e) => {
        e.preventDefault()
        appConfig.ui.colors.primary = color
      }
    }))
  }, {
    label: 'Neutral',
    slot: 'chip',
    chip: appConfig.ui.colors.neutral === 'neutral' ? 'old-neutral' : appConfig.ui.colors.neutral,
    content: {
      align: 'end',
      collisionPadding: 16
    },
    children: neutrals.map(color => ({
      label: color.charAt(0).toUpperCase() + color.slice(1),
      chip: color === 'neutral' ? 'old-neutral' : color,
      slot: 'chip',
      type: 'checkbox',
      checked: appConfig.ui.colors.neutral === color,
      onSelect: (e) => {
        e.preventDefault()

        appConfig.ui.colors.neutral = color
      }
    }))
  }]
}, {
  label: 'Apparence',
  icon: 'i-lucide-sun-moon',
  children: [{
    label: 'Light',
    icon: 'i-lucide-sun',
    type: 'checkbox',
    checked: colorMode.value === 'light',
    onSelect(e: Event) {
      e.preventDefault()

      colorMode.preference = 'light'
    }
  }, {
    label: 'Dark',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.value === 'dark',
    onUpdateChecked(checked: boolean) {
      if (checked) {
        colorMode.preference = 'dark'
      }
    },
    onSelect(e: Event) {
      e.preventDefault()
    }
  }]
}], [{
  label: 'Log out',
  icon: 'i-lucide-log-out',
  color: 'error',
  onSelect: async (e: Event) => {
    e.preventDefault()

    if (!auth) {
      toast.add({
        title: 'Erreur',
        description: 'Service d\'authentification non disponible',
        color: 'error'
      })
      return
    }

    try {
      await signOut(auth)
      toast.add({
        title: 'Déconnexion réussie',
        description: 'Vous avez été déconnecté avec succès',
        color: 'success'
      })
      await router.push('/login')
    } catch (error: any) {
      console.error('Erreur lors de la déconnexion:', error)
      toast.add({
        title: 'Erreur de déconnexion',
        description: error.message || 'Une erreur est survenue lors de la déconnexion',
        color: 'error'
      })
    }
  }
}]]))
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'center', collisionPadding: 12 }" :ui="{ content: 'w-65' }">
    <UButton v-bind="{
      ...user,
      label: collapsed ? undefined : user?.name,
      trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
    }" color="neutral" variant="ghost" block :square="collapsed" class="data-[state=open]:bg-elevated" :ui="{
        trailingIcon: 'text-dimmed'
      }" />

    <template #chip-leading="{ item }">
      <div class="inline-flex items-center justify-center shrink-0 size-5">
        <span class="rounded-full ring ring-bg bg-(--chip-light) dark:bg-(--chip-dark) size-2" :style="{
          '--chip-light': `var(--color-${(item as any).chip}-500)`,
          '--chip-dark': `var(--color-${(item as any).chip}-400)`
        }" />
      </div>
    </template>
  </UDropdownMenu>
</template>
