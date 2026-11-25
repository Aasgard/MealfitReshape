<script setup lang="ts">
import { parsePositiveNumber } from '~/utils/numberInput'

/**
 * Objectif de calcium du profil : la référence ANSES selon l'âge de la fiche, ou une valeur saisie à la main. Comparé au
 * calcium mangé dans le résumé de l'accueil et la moyenne de Menus quand son suivi est activé (Réglages).
 */
const profile = useProfile()
const { settings } = useAppSettings()
const toast = useToast()

const editing = ref(false)
const draft = ref('')
const submitted = ref(false)

const isManual = computed(() => profile.manualCalciumTarget !== null)
const draftError = computed(() => (submitted.value && parsePositiveNumber(draft.value) === null ? 'Nombre invalide' : undefined))

function startEdit() {
  draft.value = String(profile.calciumTarget)
  submitted.value = false
  editing.value = true
}

function persist(mg: number | null) {
  profile.setManualCalciumTarget(mg).catch((error) => {
    console.error('Enregistrement de l\'objectif de calcium impossible', error)
    toast.add({ title: 'Erreur', description: 'L\'objectif de calcium n\'a pas pu être enregistré.', color: 'error' })
  })
}

function save() {
  submitted.value = true
  const mg = parsePositiveNumber(draft.value)
  if (mg === null) return
  const rounded = Math.round(mg)
  // La référence saisie telle quelle reste « calculée » : elle suivra l'âge.
  persist(rounded === profile.calciumReferenceTarget ? null : rounded)
  editing.value = false
}

function useReference() {
  persist(null)
  editing.value = false
}
</script>

<template>
  <section aria-labelledby="calcium-title" class="flex flex-col rounded-xl border border-default bg-default">
    <header class="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 id="calcium-title" class="text-lg font-bold tracking-tight text-highlighted">
          Calcium
        </h2>
        <p class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon :name="isManual ? 'i-lucide-pencil' : 'i-lucide-user'" class="size-3.5 shrink-0" />
          {{ isManual ? 'Saisi à la main' : 'Référence ANSES selon votre âge' }}
        </p>
      </div>
      <UButton
        v-if="!editing"
        label="Modifier"
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
        size="sm"
        @click="startEdit"
      />
    </header>

    <div v-if="!editing" class="flex flex-wrap items-baseline gap-x-2 px-4 pt-4 pb-5 sm:px-5">
      <span class="text-3xl font-bold tracking-tight tabular-nums text-highlighted">{{ formatNumber(profile.calciumTarget) }}</span>
      <span class="text-sm text-muted">mg par jour</span>
    </div>

    <form v-else class="flex flex-col" novalidate @submit.prevent="save">
      <div class="mt-3 border-t border-default">
        <SettingRow label="Objectif" for="target-calcium" :hint="`Référence : ${formatNumber(profile.calciumReferenceTarget)} mg`" :error="draftError">
          <UInput
            id="target-calcium"
            v-model="draft"
            inputmode="numeric"
            placeholder="950"
            class="w-32"
            :ui="{ base: 'text-end tabular-nums pe-10', trailing: 'pe-3' }"
          >
            <template #trailing>
              <span class="text-xs text-dimmed">mg</span>
            </template>
          </UInput>
        </SettingRow>
      </div>
      <div class="flex flex-wrap justify-end gap-2 border-t border-default px-4 py-3 sm:px-5">
        <UButton v-if="isManual" label="Revenir à la référence" color="neutral" variant="ghost" class="me-auto" @click="useReference" />
        <UButton label="Annuler" color="neutral" variant="ghost" @click="editing = false" />
        <UButton type="submit" label="Valider" icon="i-lucide-check" />
      </div>
    </form>

    <p v-if="!settings.trackCalcium && !editing" class="border-t border-default px-4 py-3 text-xs text-muted sm:px-5">
      Le suivi n'est pas affiché : activez-le dans les
      <ULink to="/dashboard/reglages#repas" class="underline underline-offset-2 hover:text-highlighted">réglages</ULink>.
    </p>
  </section>
</template>
