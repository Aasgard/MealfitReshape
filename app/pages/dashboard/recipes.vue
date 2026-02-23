<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useCollection, useFirestore } from 'vuefire'
import { collection, or, query, where } from 'firebase/firestore'
import type { TableColumn } from '@nuxt/ui'
import type { Recipe } from '~/types/recipe'
import { fakeRecipes } from '~/data/fakeRecipes'

useSeoMeta({
  title: 'Dashboard - Recettes - Mealfit',
  description: 'Dashboard - Recettes - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()

const recipes = useCollection<Recipe>(
  () => {
    const col = collection(db, 'recipes')
    if (!user.value) return col
    return query(
      col,
      or(
        where('owner', '==', user.value.uid),
        where('owner', '==', null)
      )
    )
  }
)

const { formatDate } = useDateFormat()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const columns: TableColumn<Recipe>[] = [
  {
    accessorKey: 'title',
    header: ({ column }) => {
      const isSorted = column.getIsSorted()
      return h(UButton, {
        color: 'neutral',
        variant: 'ghost',
        label: 'Nom',
        icon: isSorted ? (isSorted === 'asc' ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-wide-narrow') : 'i-lucide-arrow-up-down',
        class: '-mx-2.5',
        onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
      })
    },
    cell: ({ row }) => {
      const r = row.original as Recipe & { label?: string }
      return r.title ?? r.label ?? r.id ?? '—'
    }
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => {
      const r = row.original as Recipe & { comment?: string }
      const text = r.description ?? r.comment ?? '—'
      return text.length > 80 ? text.slice(0, 80) + '…' : text
    }
  },
  {
    accessorKey: 'updatedAt',
    header: 'Mis à jour',
    cell: ({ row }) => formatDate(row.original.updatedAt) || '—'
  },
  {
    accessorKey: 'isPublic',
    header: 'Statut',
    cell: ({ row }) => {
      const isPublic = row.original.isPublic ?? false
      const color = isPublic ? ('success' as const) : ('neutral' as const)
      return h(UBadge, { variant: 'subtle', color }, () => isPublic ? 'Public' : 'Privé')
    }
  }
]

/** Affiche les recettes Firestore si présentes, sinon les fausses recettes (fakedata). */
const tableData = computed(() => {
  const fromDb = recipes.value ?? []
  return fromDb.length > 0 ? fromDb : fakeRecipes
})

const sorting = ref<{ id: string; desc: boolean }[]>([{ id: 'title', desc: false }])
</script>

<template>
  <UDashboardPanel id="recipes">
    <template #header>
      <UDashboardNavbar title="Recettes">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex-1 divide-y divide-accented w-full">
        <UTable
          v-model:sorting="sorting"
          :data="tableData"
          :columns="columns"
          class="flex-1"
          empty="Aucune recette pour le moment"
        />

        <div class="px-4 py-3.5 text-sm text-muted">
          {{ tableData.length }} recette(s)
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
