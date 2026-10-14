<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useCurrentUser } from 'vuefire'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { HouseholdDemoView, HouseholdMember } from '~/composables/useHousehold'

useSeoMeta({
  title: 'Dashboard - Foyer - Mealfit',
  description: 'Dashboard - Foyer - Mealfit',
})

const currentUser = useCurrentUser()
const route = useRoute()
const requestUrl = useRequestURL()
const toast = useToast()
const { household, isDemo, loading, demoView, setDemo, setDemoView, create, join, rename, regenerateCode, removeMember, leave } = useHousehold()

/** Le compte connecté, toujours lu en direct : le foyer n'en garde qu'une copie et sa date d'arrivée. */
const self = computed<HouseholdMember>(() => ({
  id: currentUser.value?.uid ?? SELF_ID,
  name: currentUser.value?.displayName || currentUser.value?.email || 'Vous',
  email: currentUser.value?.email || '',
  photoUrl: currentUser.value?.photoURL || undefined,
  joinedAt: '',
  isSelf: true,
}))

const members = computed(() => household.value
  ? sortedMembers(household.value).map(m => (m.isSelf ? { ...m, ...self.value, joinedAt: m.joinedAt } : m))
  : [])

// --- Propriétaire ---

const isOwnerId = (id: string) => household.value?.ownerId === id
const isOwner = computed(() => isOwnerId(self.value.id))
const owner = computed(() => members.value.find(m => isOwnerId(m.id)))
const successor = computed(() => household.value ? successorOf(household.value) : null)

const monthYear = (iso: string) => format(parseISO(iso), 'MMMM yyyy', { locale: fr })
const createdLabel = computed(() => household.value ? format(parseISO(household.value.createdAt), 'd MMMM yyyy', { locale: fr }) : '')
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

// --- Lien d'invitation reçu (`?code=`) ---

const queryCode = computed(() => normalizeInviteCode(String(route.query.code ?? '')))
const queryCodeIsOwn = computed(() => !!household.value && queryCode.value === household.value.inviteCode)

// --- Démo (seulement sans foyer enregistré) ---

const demoOn = computed({
  get: () => isDemo.value,
  set: (on: boolean) => setDemo(on, self.value),
})

const failed = (title: string, error: unknown) => {
  console.error(title, error)
  toast.add({ title, description: error instanceof Error ? error.message : undefined, color: 'error' })
}

const DEMO_VIEWS: { value: HouseholdDemoView, label: string }[] = [
  { value: 'owner', label: 'Propriétaire' },
  { value: 'member', label: 'Membre' },
]

function showDemoView(view: HouseholdDemoView) {
  if (view === demoView.value) return
  editingName.value = false
  setDemoView(view, self.value)
}

// --- Nom du foyer ---

const editingName = ref(false)
const nameDraft = ref('')
const nameError = ref('')

function startRename() {
  nameDraft.value = household.value?.name ?? ''
  nameError.value = ''
  editingName.value = true
}

function submitRename() {
  const name = nameDraft.value.trim()
  if (!name) {
    nameError.value = 'Donnez un nom au foyer.'
    return
  }
  editingName.value = false
  rename(name).catch(error => failed('Renommage impossible', error))
}

// --- Invitation ---

const code = computed(() => household.value?.inviteCode ?? '')
const inviteLink = computed(() => `${requestUrl.origin}/dashboard/household?code=${formatInviteCode(code.value)}`)
/** Les caractères ne s'animent qu'après un changement de code, jamais au chargement. */
const codeChanged = ref(false)
const copied = ref<'code' | 'link' | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copy(kind: 'code' | 'link') {
  try {
    await navigator.clipboard.writeText(kind === 'code' ? formatInviteCode(code.value) : inviteLink.value)
    copied.value = kind
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = null }, 2000)
  } catch {
    toast.add({ title: 'Copie impossible', description: 'Votre navigateur bloque le presse-papiers. Sélectionnez le code à la main.', color: 'error' })
  }
}

onBeforeUnmount(() => clearTimeout(copiedTimer))

const confirmRegenerate = ref(false)

async function onRegenerate() {
  confirmRegenerate.value = false
  try {
    await regenerateCode()
  } catch (error) {
    failed('Nouveau code impossible', error)
    return
  }
  codeChanged.value = true
  copied.value = null
  toast.add({ title: 'Nouveau code généré', description: 'L\'ancien code ne fonctionne plus.', color: 'success' })
}

// --- Membres ---

const memberToRemove = ref<HouseholdMember | null>(null)
const confirmRemove = computed({
  get: () => !!memberToRemove.value,
  set: (open: boolean) => { if (!open) memberToRemove.value = null },
})

const memberMenu = (member: HouseholdMember): DropdownMenuItem[] => [{
  label: 'Retirer du foyer',
  icon: 'i-lucide-user-minus',
  color: 'error',
  onSelect: () => { memberToRemove.value = member },
}]

async function onRemove() {
  const member = memberToRemove.value
  if (!member) return
  memberToRemove.value = null
  try {
    await removeMember(member.id)
  } catch (error) {
    failed(`Impossible de retirer ${member.name}`, error)
    return
  }
  toast.add({ title: `${member.name} ne fait plus partie du foyer`, color: 'success' })
}

// --- Quitter ---

const confirmLeave = ref(false)
const isLastMember = computed(() => members.value.length === 1)
const leaveHint = computed(() => {
  if (isLastMember.value) return 'Vous êtes le dernier membre : le foyer sera supprimé, avec ses menus, sa liste de courses et son stock.'
  if (isOwner.value && successor.value) {
    return `${successor.value.name}, membre depuis ${monthYear(successor.value.joinedAt)}, deviendra propriétaire. Vos recettes, ingrédients privés et récipients partent avec vous.`
  }
  return 'Vos recettes, ingrédients privés et récipients partent avec vous. Les menus, la liste de courses et le stock restent au foyer.'
})

async function onLeave() {
  const name = household.value?.name
  const deleted = isLastMember.value
  const heir = isOwner.value ? successor.value : null
  confirmLeave.value = false
  try {
    await leave()
  } catch (error) {
    failed(deleted ? 'Suppression impossible' : 'Impossible de quitter le foyer', error)
    return
  }
  toast.add({
    title: deleted ? `Foyer « ${name} » supprimé` : `Vous avez quitté « ${name} »`,
    description: heir ? `${heir.name} en est maintenant propriétaire.` : undefined,
    color: 'success',
  })
}

// --- Sans foyer : créer ou rejoindre ---

const createName = ref('')
const createError = ref('')
const creating = ref(false)
const joinCode = ref(queryCode.value ? formatInviteCode(queryCode.value) : '')
const joinError = ref('')
const joining = ref(false)

watch(queryCode, (c) => { if (c && !household.value) joinCode.value = formatInviteCode(c) })

async function submitCreate() {
  const name = createName.value.trim()
  if (!name) {
    createError.value = 'Donnez un nom au foyer, par exemple « Maison ».'
    return
  }
  creating.value = true
  try {
    await create(name, self.value)
  } catch (error) {
    failed('Création du foyer impossible', error)
    return
  } finally {
    creating.value = false
  }
  createName.value = ''
  createError.value = ''
  codeChanged.value = false
  toast.add({ title: `Foyer « ${name} » créé`, description: 'Partagez le code d\'invitation pour y faire entrer quelqu\'un.', color: 'success' })
}

async function submitJoin() {
  const code = normalizeInviteCode(joinCode.value)
  if (!code) {
    joinError.value = 'Le code compte 6 lettres ou chiffres, par exemple K7F-2QM.'
    return
  }
  joining.value = true
  let name: string
  try {
    name = await join(code, self.value)
  } catch (error) {
    console.error('Impossible de rejoindre le foyer', error)
    joinError.value = error instanceof Error ? error.message : 'Impossible de rejoindre le foyer.'
    return
  } finally {
    joining.value = false
  }
  joinCode.value = ''
  joinError.value = ''
  codeChanged.value = false
  // Le lien d'invitation a servi : sans lui, la page n'annonce pas « vous faites déjà partie de ce foyer ».
  if (route.query.code) navigateTo({ query: { ...route.query, code: undefined } }, { replace: true })
  toast.add({ title: name ? `Vous avez rejoint « ${name} »` : 'Vous avez rejoint le foyer', color: 'success' })
}

const PERSONAL = [
  { label: 'Profil et besoins journaliers', icon: 'i-lucide-user' },
  { label: 'Suivi du poids et des mensurations', icon: 'i-lucide-scale' },
  { label: 'Séances et programmes', icon: 'i-lucide-dumbbell' },
  { label: 'Réglages', icon: 'i-lucide-settings' },
]
</script>

<template>
  <UDashboardPanel id="household">
    <template #header>
      <UDashboardNavbar title="Foyer">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Commandes de la maquette, sans foyer enregistré : à retirer avec les données fictives. -->
      <div
        v-if="!loading && (!household || isDemo)"
        class="mx-auto flex w-full flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-dashed border-default px-3 py-2"
        :class="household ? 'max-w-5xl' : 'max-w-3xl'"
      >
        <span class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-dimmed">
          <UIcon name="i-lucide-flask-conical" class="size-3.5 shrink-0" />
          Maquette
        </span>
        <USwitch v-model="demoOn" label="Foyer de démo" size="sm" />
        <div v-if="household" class="flex items-center gap-2">
          <span id="demo-view-label" class="text-xs text-muted">Vu par</span>
          <div role="group" aria-labelledby="demo-view-label" class="flex gap-1 rounded-lg bg-elevated p-1">
            <UButton
              v-for="view in DEMO_VIEWS"
              :key="view.value"
              :label="view.label"
              :color="demoView === view.value ? 'primary' : 'neutral'"
              :variant="demoView === view.value ? 'solid' : 'ghost'"
              size="xs"
              :aria-pressed="demoView === view.value"
              @click="showDemoView(view.value)"
            />
          </div>
        </div>
      </div>

      <div v-if="loading" class="mx-auto flex w-full max-w-5xl flex-col gap-6" aria-busy="true">
        <USkeleton class="h-8 w-48" />
        <USkeleton class="h-48 w-full rounded-xl" />
      </div>

      <!-- Foyer existant -->
      <div v-else-if="household" class="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <UAlert
          v-if="queryCode"
          :title="queryCodeIsOwn ? 'Vous faites déjà partie de ce foyer.' : 'Vous faites déjà partie d\'un foyer.'"
          :description="queryCodeIsOwn ? undefined : 'Un compte n\'appartient qu\'à un foyer : quittez celui-ci pour rejoindre l\'autre.'"
          icon="i-lucide-info"
          color="neutral"
          variant="subtle"
        />

        <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div class="flex min-w-0 flex-col gap-1">
            <form v-if="editingName" class="flex flex-wrap items-start gap-2" @submit.prevent="submitRename" @keydown.esc="editingName = false">
              <UFormField :error="nameError" :ui="{ error: 'text-xs' }">
                <UInput
                  v-model="nameDraft"
                  autofocus
                  maxlength="40"
                  aria-label="Nom du foyer"
                  class="w-64 max-w-full"
                  @update:model-value="nameError = ''"
                />
              </UFormField>
              <UButton type="submit" label="Enregistrer" />
              <UButton label="Annuler" color="neutral" variant="ghost" @click="editingName = false" />
            </form>
            <div v-else class="flex min-w-0 items-center gap-1">
              <h1 class="truncate text-2xl font-bold tracking-tight text-highlighted">
                {{ household.name }}
              </h1>
              <UButton v-if="isOwner" icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" aria-label="Renommer le foyer" @click="startRename" />
            </div>
            <p class="text-xs text-muted">
              <span class="tabular-nums">{{ plural(members.length, 'membre') }}</span> · créé le <span class="tabular-nums">{{ createdLabel }}</span>
            </p>
          </div>

          <UAvatarGroup size="sm" :max="6" aria-hidden="true">
            <UAvatar v-for="member in members" :key="member.id" :src="member.photoUrl" :alt="member.name" />
          </UAvatarGroup>
        </header>

        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <!-- Membres -->
          <section aria-labelledby="membres-title" class="flex min-w-0 flex-col overflow-hidden rounded-xl border border-default bg-default lg:col-start-1 lg:row-start-1">
            <header class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="membres-title" class="text-lg font-bold tracking-tight text-highlighted">
                Membres
              </h2>
              <p class="text-xs text-dimmed">
                Par ordre d'arrivée
              </p>
            </header>

            <ul class="divide-y divide-default border-t border-default">
              <li v-for="member in members" :key="member.id" class="flex items-center gap-3 px-4 py-3 sm:px-5">
                <UAvatar :src="member.photoUrl" :alt="member.name" size="md" />
                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-sm font-medium text-highlighted">{{ member.name }}</span>
                    <UBadge v-if="member.isSelf" label="Vous" variant="subtle" size="sm" class="shrink-0" />
                    <!-- Sur mobile, la clé seule laisse la place au nom. -->
                    <UBadge
                      v-if="isOwnerId(member.id)"
                      icon="i-lucide-key-round"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      class="shrink-0"
                    >
                      <span class="sr-only sm:not-sr-only">Propriétaire</span>
                    </UBadge>
                  </p>
                  <p class="truncate text-xs text-muted">
                    {{ member.email || '—' }}<span class="sm:hidden"> · depuis {{ monthYear(member.joinedAt) }}</span>
                  </p>
                </div>
                <p class="hidden shrink-0 text-xs text-dimmed sm:block">
                  Depuis {{ monthYear(member.joinedAt) }}
                </p>
                <!-- Seul le propriétaire retire des membres. -->
                <UDropdownMenu v-if="isOwner && !member.isSelf" :items="memberMenu(member)" :content="{ align: 'end' }">
                  <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="xs" :aria-label="`Actions pour ${member.name}`" />
                </UDropdownMenu>
                <!-- Garde la colonne des menus alignée sur la ligne du compte connecté. -->
                <span v-else-if="isOwner" class="size-6 shrink-0" aria-hidden="true" />
              </li>
            </ul>

            <p v-if="members.length === 1" class="border-t border-default px-4 py-3 text-xs text-muted text-pretty sm:px-5">
              Vous êtes seul dans ce foyer pour l'instant. Partagez le code d'invitation pour y faire entrer quelqu'un.
            </p>
          </section>

          <!-- Inviter -->
          <section aria-labelledby="inviter-title" class="flex flex-col rounded-xl border border-default bg-default lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <header class="flex flex-col gap-1 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="inviter-title" class="text-lg font-bold tracking-tight text-highlighted">
                Inviter
              </h2>
              <p v-if="isOwner" class="text-xs text-muted text-pretty">
                Quiconque a ce code rejoint le foyer et voit tout ce qu'il partage.
              </p>
            </header>

            <!-- Membre : l'invitation est réservée au propriétaire. -->
            <div v-if="!isOwner" class="flex items-start gap-3 border-t border-default px-4 py-4 sm:px-5">
              <UIcon name="i-lucide-key-round" class="mt-0.5 size-4 shrink-0 text-muted" />
              <p class="text-sm text-muted text-pretty">
                Seul <span class="font-medium text-highlighted">{{ owner?.name }}</span>, propriétaire du foyer, peut inviter de nouveaux membres. Demandez-lui le code.
              </p>
            </div>

            <div v-else class="flex flex-col gap-4 border-t border-default px-4 py-4 sm:px-5">
              <div class="flex items-center gap-2" role="img" :aria-label="`Code d'invitation : ${code.split('').join(' ')}`">
                <template v-for="(group, g) in [code.slice(0, 3), code.slice(3)]" :key="g">
                  <span v-if="g === 1" class="h-0.5 w-2.5 shrink-0 rounded-full bg-accented" />
                  <div class="grid flex-1 grid-cols-3 gap-px overflow-hidden rounded-lg border border-default bg-border">
                    <span
                      v-for="(char, i) in group.split('')"
                      :key="`${code}-${g * 3 + i}`"
                      class="flex h-12 items-center justify-center bg-default text-2xl font-bold tabular-nums text-highlighted"
                      :class="codeChanged && 'code-char'"
                      :style="{ animationDelay: `${(g * 3 + i) * 45}ms` }"
                    >{{ char }}</span>
                  </div>
                </template>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <UButton
                  :label="copied === 'link' ? 'Lien copié' : 'Copier le lien'"
                  :icon="copied === 'link' ? 'i-lucide-check' : 'i-lucide-link'"
                  block
                  @click="copy('link')"
                />
                <UButton
                  :label="copied === 'code' ? 'Code copié' : 'Copier le code'"
                  :icon="copied === 'code' ? 'i-lucide-check' : 'i-lucide-copy'"
                  color="neutral"
                  variant="outline"
                  block
                  @click="copy('code')"
                />
              </div>
              <p class="sr-only" aria-live="polite">
                {{ copied === 'link' ? 'Lien copié' : copied === 'code' ? 'Code copié' : '' }}
              </p>
              <p class="text-xs text-dimmed text-pretty">
                Le lien ouvre cette page avec le code déjà saisi.
              </p>
            </div>

            <div v-if="isOwner" class="border-t border-default px-2.5 py-2 sm:px-3.5">
              <UButton
                label="Générer un nouveau code"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="confirmRegenerate = true"
              />
            </div>
          </section>

          <!-- Partagé -->
          <section aria-labelledby="partage-title" class="flex min-w-0 flex-col overflow-hidden rounded-xl border border-default bg-default lg:col-start-1 lg:row-start-2">
            <header class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="partage-title" class="text-lg font-bold tracking-tight text-highlighted">
                Partagé avec le foyer
              </h2>
            </header>

            <ul class="grid gap-px border-t border-default bg-border sm:grid-cols-2">
              <li v-for="item in HOUSEHOLD_SHARED" :key="item.key" class="flex bg-default sm:odd:last:col-span-2">
                <NuxtLink
                  :to="item.to"
                  class="group flex flex-1 flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-elevated/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5"
                >
                  <span class="flex items-center gap-2 text-sm font-medium text-highlighted">
                    <UIcon :name="item.icon" class="size-4 shrink-0 text-muted" />
                    <span class="flex-1">{{ item.label }}</span>
                    <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0 text-dimmed transition-colors group-hover:text-primary" />
                  </span>
                  <span class="flex items-baseline gap-1.5">
                    <span class="text-2xl font-bold tabular-nums text-highlighted">{{ item.value }}</span>
                    <span class="text-sm text-muted">{{ item.unit }}</span>
                    <span v-if="'extra' in item" class="text-sm text-muted">· <span class="tabular-nums">{{ item.extra }}</span></span>
                  </span>
                  <span class="text-xs text-dimmed text-pretty">{{ item.hint }}</span>
                </NuxtLink>
              </li>
            </ul>
          </section>

          <!-- Quitter -->
          <section aria-label="Quitter le foyer" class="flex min-w-0 flex-col rounded-xl border border-default bg-default lg:col-start-1 lg:row-start-3">
            <SettingRow label="Quitter le foyer" :hint="leaveHint" stack>
              <UButton
                :label="isLastMember ? 'Supprimer le foyer' : 'Quitter'"
                icon="i-lucide-log-out"
                color="error"
                variant="soft"
                @click="confirmLeave = true"
              />
            </SettingRow>
          </section>
        </div>
      </div>

      <!-- Sans foyer -->
      <div v-else class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-bold tracking-tight text-highlighted text-balance">
            Partagez Mealfit avec votre foyer
          </h1>
          <p class="max-w-prose text-sm text-muted text-pretty">
            Un foyer met en commun les menus, la liste de courses, le stock et vos recettes privées, pour cuisiner à plusieurs sans tout saisir deux fois. Chacun garde son profil et son suivi.
          </p>
        </div>

        <div class="grid items-start gap-6 sm:grid-cols-2">
          <form aria-labelledby="creer-title" class="flex flex-col rounded-xl border border-default bg-default" @submit.prevent="submitCreate">
            <header class="flex flex-col gap-1 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="creer-title" class="text-lg font-bold tracking-tight text-highlighted">
                Créer un foyer
              </h2>
              <p class="text-xs text-muted">
                Vous recevrez un code à partager.
              </p>
            </header>
            <div class="flex flex-col gap-3 border-t border-default px-4 py-4 sm:px-5">
              <UFormField label="Nom du foyer" name="household-name" :error="createError">
                <UInput
                  v-model="createName"
                  placeholder="Maison"
                  maxlength="40"
                  class="w-full"
                  @update:model-value="createError = ''"
                />
              </UFormField>
              <UButton type="submit" label="Créer le foyer" :loading="creating" :color="joinCode ? 'neutral' : 'primary'" :variant="joinCode ? 'outline' : 'solid'" class="self-start" />
            </div>
          </form>

          <form aria-labelledby="rejoindre-title" class="flex flex-col rounded-xl border border-default bg-default" @submit.prevent="submitJoin">
            <header class="flex flex-col gap-1 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="rejoindre-title" class="text-lg font-bold tracking-tight text-highlighted">
                Rejoindre un foyer
              </h2>
              <p class="text-xs text-muted">
                {{ queryCode ? 'Code reçu par lien, vérifiez-le puis rejoignez.' : 'Saisissez le code reçu d\'un membre.' }}
              </p>
            </header>
            <div class="flex flex-col gap-3 border-t border-default px-4 py-4 sm:px-5">
              <UFormField label="Code d'invitation" name="invite-code" :error="joinError">
                <UInput
                  v-model="joinCode"
                  placeholder="K7F-2QM"
                  maxlength="7"
                  autocomplete="off"
                  autocapitalize="characters"
                  spellcheck="false"
                  class="w-full"
                  :ui="{ base: 'uppercase tabular-nums tracking-widest placeholder:normal-case' }"
                  @update:model-value="joinError = ''"
                />
              </UFormField>
              <UButton type="submit" label="Rejoindre" :loading="joining" :color="joinCode ? 'primary' : 'neutral'" :variant="joinCode ? 'solid' : 'outline'" class="self-start" />
            </div>
          </form>
        </div>

        <div class="grid gap-px overflow-hidden rounded-xl border border-default bg-border sm:grid-cols-2">
          <div class="flex flex-col gap-3 bg-default p-4 sm:p-5">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
              Partagé avec le foyer
            </h2>
            <ul class="flex flex-col gap-2.5">
              <li v-for="item in HOUSEHOLD_SHARED" :key="item.key" class="flex items-center gap-2.5 text-sm text-highlighted">
                <UIcon :name="item.icon" class="size-4 shrink-0 text-primary" />
                {{ item.label }}
              </li>
            </ul>
          </div>
          <div class="flex flex-col gap-3 bg-default p-4 sm:p-5">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
              Reste à vous
            </h2>
            <ul class="flex flex-col gap-2.5">
              <li v-for="item in PERSONAL" :key="item.label" class="flex items-center gap-2.5 text-sm text-highlighted">
                <UIcon :name="item.icon" class="size-4 shrink-0 text-muted" />
                {{ item.label }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <ConfirmDialog
        v-model:open="confirmRegenerate"
        title="Générer un nouveau code ?"
        description="L'ancien code et l'ancien lien ne fonctionneront plus. Personne n'est retiré du foyer."
        confirm-label="Générer"
        confirm-icon="i-lucide-refresh-cw"
        @confirm="onRegenerate"
      />
      <ConfirmDialog
        v-model:open="confirmRemove"
        :title="`Retirer ${memberToRemove?.name ?? ''} du foyer ?`"
        description="Ce compte n'aura plus accès aux menus, à la liste de courses ni au stock du foyer. Ses recettes, ingrédients privés et récipients quittent le foyer avec lui."
        confirm-label="Retirer"
        confirm-color="error"
        confirm-icon="i-lucide-user-minus"
        @confirm="onRemove"
      />
      <ConfirmDialog
        v-model:open="confirmLeave"
        :title="isLastMember ? 'Supprimer le foyer ?' : `Quitter « ${household?.name ?? ''} » ?`"
        :description="leaveHint"
        :confirm-label="isLastMember ? 'Supprimer le foyer' : 'Quitter le foyer'"
        confirm-color="error"
        confirm-icon="i-lucide-log-out"
        @confirm="onLeave"
      />
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.code-char {
  animation: code-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes code-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .code-char {
    animation: none;
  }
}
</style>
