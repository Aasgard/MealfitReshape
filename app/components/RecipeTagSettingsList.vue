<script setup lang="ts">
import { cleanRecipeTag, recipeTagKey, type RecipeTag } from '~/utils/recipeTags'

/**
 * Tags des recettes, dans les réglages : un vocabulaire commun au foyer, du plus utilisé au moins utilisé. Chaque nom se
 * modifie sur place et s'applique à toutes les recettes qui le portent ; renommer en un tag existant fusionne les deux.
 * `saved` est émis après chaque renommage réussi.
 */
const emit = defineEmits<{ saved: [] }>()

const TAG_NAME_MAX = 40

const { vocabulary, loading, rename } = useRecipeTags()
const toast = useToast()

const recipesLabel = (n: number) => `${n} recette${n > 1 ? 's' : ''}`

/** Nom en cours de saisie, par tag ; absent hors saisie (le champ montre le nom retenu). */
const drafts = reactive<Record<string, string>>({})
const errors = reactive<Record<string, string>>({})
/** Tag en cours d'écriture : son champ est figé jusqu'au retour de Firestore. */
const busyKey = ref<string | null>(null)

/** Tag existant avec lequel la saisie fusionnerait ; `undefined` sinon. */
function mergeTarget(tag: RecipeTag): RecipeTag | undefined {
  const draft = drafts[tag.key]
  if (draft === undefined) return undefined
  const key = recipeTagKey(draft)
  return key && key !== tag.key ? vocabulary.value.find(t => t.key === key) : undefined
}

function onInput(tag: RecipeTag, value: string) {
  drafts[tag.key] = value
  delete errors[tag.key]
}

function report(from: RecipeTag, to: string, merged: RecipeTag | undefined, result: Awaited<ReturnType<typeof rename>>) {
  const { updated, denied, failed, undo } = result
  const notes = [
    denied ? `${recipesLabel(denied)} d'autres membres ${denied > 1 ? 'gardent' : 'garde'} l'ancien nom.` : '',
    failed ? `${recipesLabel(failed)} non ${failed > 1 ? 'modifiées' : 'modifiée'} : vérifiez la connexion.` : '',
  ].filter(Boolean)

  if (!updated) {
    toast.add({
      title: 'Tag non renommé',
      description: notes.join(' ') || 'Aucune recette à modifier.',
      color: 'warning',
      icon: 'i-lucide-circle-alert',
    })
    return
  }

  emit('saved')
  toast.add({
    title: merged ? `« ${from.label} » fusionné avec « ${to} »` : `« ${from.label} » devient « ${to} »`,
    description: [`${recipesLabel(updated)} ${updated > 1 ? 'mises' : 'mise'} à jour.`, ...notes].join(' '),
    color: notes.length ? 'warning' : 'neutral',
    icon: merged ? 'i-lucide-merge' : 'i-lucide-tag',
    actions: [{
      label: 'Annuler',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        undo().catch((error) => {
          console.error('Renommage non annulé', error)
          toast.add({ title: 'Renommage non annulé', description: 'Vérifiez la connexion, puis réessayez.', color: 'error', icon: 'i-lucide-circle-alert' })
        })
      },
    }],
  })
}

/** Applique le nom saisi ; refusé, il revient au nom retenu au départ du champ (`revert`). */
function commit(tag: RecipeTag, { revert }: { revert: boolean }) {
  const draft = drafts[tag.key]
  if (draft === undefined) return true
  const label = cleanRecipeTag(draft)
  // Même orthographe et aucune variante à aligner : rien à écrire.
  if (label === tag.label && !tag.variants.length) {
    delete drafts[tag.key]
    return true
  }
  if (!label) {
    errors[tag.key] = revert ? 'Donnez un nom au tag. Nom inchangé.' : 'Donnez un nom au tag.'
    if (revert) delete drafts[tag.key]
    return false
  }

  const merged = mergeTarget(tag)
  delete drafts[tag.key]
  busyKey.value = tag.key
  rename(tag.key, label)
    .then(result => report(tag, label, merged, result))
    .catch((error) => {
      console.error('Tag non renommé', error)
      toast.add({ title: 'Tag non renommé', description: 'Vérifiez la connexion, puis réessayez.', color: 'error', icon: 'i-lucide-circle-alert' })
    })
    .finally(() => (busyKey.value = null))
  return true
}

function onEnter(tag: RecipeTag, event: KeyboardEvent) {
  // Sans saisie, Entrée aligne les autres orthographes sur le nom retenu.
  if (drafts[tag.key] === undefined && tag.variants.length) drafts[tag.key] = tag.label
  if (commit(tag, { revert: false })) (event.target as HTMLInputElement).blur()
}

function onEscape(tag: RecipeTag, event: KeyboardEvent) {
  delete drafts[tag.key]
  delete errors[tag.key]
  ;(event.target as HTMLInputElement).blur()
}
</script>

<template>
  <div class="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
    <div class="flex flex-col gap-0.5">
      <p class="text-sm font-medium text-highlighted">
        Tags
      </p>
      <p class="text-xs text-dimmed text-pretty">
        Communs à tout le foyer. Un nouveau nom s'applique à toutes les recettes qui portent le tag ; le nom d'un tag existant fusionne les deux.
      </p>
    </div>

    <div class="overflow-hidden rounded-lg border border-default">
      <ul v-if="loading" aria-hidden="true">
        <li v-for="n in 3" :key="n" class="flex items-center gap-2 border-b border-default py-2.5 ps-2 pe-3 last:border-b-0">
          <USkeleton class="size-4 rounded-sm" />
          <USkeleton class="h-4 w-28" />
          <USkeleton class="ms-auto h-3 w-16" />
        </li>
      </ul>

      <p v-else-if="!vocabulary.length" class="flex items-center gap-2 px-3 py-3 text-sm text-muted">
        <UIcon name="i-lucide-tag" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
        Aucun tag pour l'instant : ajoutez-en depuis le formulaire d'une recette.
      </p>

      <ul v-else aria-label="Tags des recettes">
        <li
          v-for="(tag, index) in vocabulary"
          :key="tag.key"
          class="flex flex-col border-b border-default py-1.5 ps-2 pe-3 last:border-b-0"
        >
          <div class="flex items-center gap-2">
            <span class="flex size-7 shrink-0 items-center justify-center text-dimmed" aria-hidden="true">
              <UIcon :name="busyKey === tag.key ? 'i-lucide-loader-circle' : 'i-lucide-tag'" class="size-4" :class="busyKey === tag.key && 'animate-spin'" />
            </span>
            <input
              :value="drafts[tag.key] ?? tag.label"
              type="text"
              :maxlength="TAG_NAME_MAX"
              autocomplete="off"
              spellcheck="false"
              class="min-w-0 flex-1 rounded-sm bg-transparent px-1.5 py-1 text-sm font-semibold text-highlighted outline-none transition-colors hover:bg-elevated/60 focus-visible:bg-default focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
              :aria-label="`Renommer le tag ${tag.label}`"
              :aria-invalid="!!errors[tag.key]"
              :aria-describedby="`tag-meta-${index}`"
              :disabled="busyKey === tag.key"
              @input="onInput(tag, ($event.target as HTMLInputElement).value)"
              @keydown.enter.prevent="onEnter(tag, $event)"
              @keydown.esc.prevent="onEscape(tag, $event)"
              @blur="commit(tag, { revert: true })"
            >
            <span class="shrink-0 text-xs text-muted tabular-nums">{{ recipesLabel(tag.count) }}</span>
          </div>

          <div :id="`tag-meta-${index}`" class="flex flex-col gap-0.5 ps-[2.625rem] text-xs empty:hidden">
            <p v-if="errors[tag.key]" class="pb-1 text-error" role="alert">
              {{ errors[tag.key] }}
            </p>
            <p v-else-if="mergeTarget(tag)" class="flex items-center gap-1 pb-1 text-primary" aria-live="polite">
              <UIcon name="i-lucide-merge" class="size-3.5 shrink-0" aria-hidden="true" />
              Fusionnera avec « {{ mergeTarget(tag)!.label }} » ({{ recipesLabel(mergeTarget(tag)!.count) }})
            </p>
            <p v-else-if="tag.variants.length" class="pb-1 text-dimmed text-pretty">
              Aussi écrit {{ tag.variants.map(v => `« ${v} »`).join(', ') }} : Entrée aligne toutes les recettes sur « {{ tag.label }} ».
            </p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
