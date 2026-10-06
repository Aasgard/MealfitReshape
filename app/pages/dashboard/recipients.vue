<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, query, where, deleteDoc, doc } from 'firebase/firestore'
import type { Container } from '~/types/container'
import { matchesSearch } from '~/utils/search'

useSeoMeta({
  title: 'Dashboard - Récipients - Mealfit',
  description: 'Dashboard - Récipients - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const photos = useUserPhotos('containers')

/** Récipients de l'utilisateur, toujours privés ; tri côté client pour éviter un index composite owner + label. */
const containers = useCollection<Container>(() => {
  const uid = user.value?.uid
  if (!uid) return null
  return query(collection(db, 'containers'), where('owner', '==', uid))
})

const containersLoading = computed(() => !user.value || containers.pending.value)

/** La recherche n'aide qu'à partir d'une liste qui ne tient plus d'un coup d'œil. */
const SEARCH_THRESHOLD = 8
const showSearch = computed(() => containers.value.length > SEARCH_THRESHOLD)
const searchQuery = ref('')

/** Récipients masqués immédiatement pendant le délai d'annulation d'une suppression (voir confirmDeleteContainer). */
const pendingDeleteIds = ref(new Set<string>())

const filteredContainers = computed(() => containers.value
  .filter(c => !pendingDeleteIds.value.has(c.id))
  .filter(c => !showSearch.value || matchesSearch(c.label, searchQuery.value))
  .sort((a, b) => a.label.localeCompare(b.label, 'fr')))

const listHeaderLabel = computed(() => {
  const n = filteredContainers.value.length
  if (n === 0) return searchQuery.value.trim() ? 'Aucun résultat' : 'Aucun récipient'
  return n === 1 ? '1 récipient' : `${n} récipients`
})

const formOpen = ref(false)
const editingContainer = ref<Container | null>(null)

const addContainer = () => {
  editingContainer.value = null
  formOpen.value = true
}

const editContainer = (container: Container) => {
  detailOpen.value = false
  editingContainer.value = container
  formOpen.value = true
}

const detailOpen = ref(false)
const selectedId = ref<string | null>(null)
/** Lu depuis la collection : la fiche ouverte reflète une modification enregistrée entre-temps. */
const selectedContainer = computed(() => containers.value.find(c => c.id === selectedId.value) ?? null)

const selectContainer = (container: Container) => {
  selectedId.value = container.id
  detailOpen.value = true
}

const containerToDelete = ref<Container | null>(null)
const deleteDialogOpen = ref(false)

const askDeleteContainer = (container: Container) => {
  containerToDelete.value = container
  deleteDialogOpen.value = true
}

const deleteConfirmDescription = computed(() => {
  const label = containerToDelete.value?.label
  return label
    ? `« ${label} » et sa photo seront supprimés après un court délai, le temps d'annuler si besoin.`
    : undefined
})

const DELETE_GRACE_PERIOD_MS = 6000
/** Suppressions programmées mais pas encore exécutées (délai d'annulation en cours), par id de récipient. */
const pendingDeleteTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const performDelete = async (container: Container) => {
  try {
    await deleteDoc(doc(db, 'containers', container.id))
  } catch (error: any) {
    console.error('Erreur lors de la suppression:', error)
    pendingDeleteIds.value.delete(container.id)
    toast.add({
      title: 'Erreur',
      description: `« ${container.label} » n'a pas pu être supprimé : ${error.message || 'une erreur est survenue'}.`,
      color: 'error'
    })
    return
  }
  pendingDeleteIds.value.delete(container.id)
  photos.remove(container.imagePath)
}

const confirmDeleteContainer = () => {
  const container = containerToDelete.value
  if (!container) return

  deleteDialogOpen.value = false
  containerToDelete.value = null

  const { id, label } = container
  pendingDeleteIds.value.add(id)

  const timeout = setTimeout(() => {
    pendingDeleteTimeouts.delete(id)
    performDelete(container)
  }, DELETE_GRACE_PERIOD_MS)
  pendingDeleteTimeouts.set(id, timeout)

  toast.add({
    title: 'Récipient supprimé',
    description: `« ${label} » sera définitivement supprimé.`,
    color: 'neutral',
    actions: [{
      label: 'Annuler',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        const pending = pendingDeleteTimeouts.get(id)
        if (!pending) return
        clearTimeout(pending)
        pendingDeleteTimeouts.delete(id)
        pendingDeleteIds.value.delete(id)
        toast.add({ title: 'Suppression annulée', description: `« ${label} » a été conservé`, color: 'success' })
      }
    }]
  })
}
</script>

<template>
  <UDashboardPanel id="recipients">
    <template #header>
      <UDashboardNavbar title="Récipients">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton color="primary" @click="addContainer">
            <UIcon name="i-lucide-plus" class="size-5 shrink-0" />
            Ajouter un récipient
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 p-4 sm:p-6">
        <div v-if="!containersLoading && containers.length" class="flex flex-col gap-3">
          <p class="text-sm font-medium text-highlighted">
            {{ listHeaderLabel }}
          </p>
          <UInput
            v-if="showSearch"
            v-model="searchQuery"
            icon="i-lucide-search"
            size="md"
            variant="outline"
            placeholder="Rechercher un récipient..."
            class="w-full"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <template v-if="containersLoading">
            <div
              v-for="i in 4"
              :key="`skeleton-${i}`"
              class="rounded-xl border border-default bg-default overflow-hidden flex flex-col"
            >
              <USkeleton class="w-full h-36 rounded-none" />
              <div class="p-4 flex flex-col gap-2">
                <div class="flex items-start justify-between gap-2">
                  <USkeleton class="h-5 w-2/3" />
                  <USkeleton class="size-5 rounded-full shrink-0" />
                </div>
                <USkeleton class="h-7 w-28" />
                <USkeleton class="h-4 w-1/2" />
              </div>
            </div>
          </template>
          <UEmpty
            v-else-if="containers.length === 0"
            class="col-span-full py-12"
            icon="i-lucide-cooking-pot"
            title="Aucun récipient"
            description="Pesez une casserole vide et enregistrez-la : son poids sera retiré à chaque pesée de vos meal preps."
            :actions="[{ label: 'Ajouter un récipient', icon: 'i-lucide-plus', onClick: addContainer }]"
          />
          <UEmpty
            v-else-if="filteredContainers.length === 0"
            class="col-span-full py-12"
            icon="i-lucide-search-x"
            title="Aucun récipient trouvé"
            description="Essayez un autre nom ou ajoutez ce récipient."
          />
          <template v-else>
            <ContainerCard
              v-for="container in filteredContainers"
              :key="container.id"
              :container="container"
              @select="selectContainer(container)"
              @edit="editContainer(container)"
              @delete="askDeleteContainer(container)"
            />
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <ContainerDetailSlideover
    v-model:open="detailOpen"
    :container="selectedContainer"
    @edit="selectedContainer && editContainer(selectedContainer)"
  />

  <ContainerFormSlideover
    v-model:open="formOpen"
    :container="editingContainer"
  />

  <ConfirmDialog
    v-model:open="deleteDialogOpen"
    title="Supprimer ce récipient ?"
    :description="deleteConfirmDescription"
    confirm-label="Supprimer"
    confirm-color="error"
    confirm-icon="i-lucide-trash-2"
    @confirm="confirmDeleteContainer"
  />
</template>
