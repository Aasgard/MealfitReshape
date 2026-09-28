<script setup lang="ts">
/**
 * Mode « En magasin » : une main sur le téléphone, l'autre sur le panier. Toute la ligne se touche,
 * les articles cochés glissent dans « Dans le panier » en bas de leur rayon, un rayon fini se replie.
 */
const list = useInjectedGroceryList()

const openCarts = ref(new Set<string>())
function toggleCart(aisleId: string) {
  const next = new Set(openCarts.value)
  if (next.has(aisleId)) next.delete(aisleId)
  else next.add(aisleId)
  openCarts.value = next
}

const newLabel = ref('')
function onAdd() {
  if (list.addManual(newLabel.value)) newLabel.value = ''
}

const progress = computed(() => (list.toBuy.length ? list.doneCount / list.toBuy.length : 0))
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-5">
    <div v-if="!list.toBuy.length" class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-default px-6 py-12 text-center">
      <UIcon name="i-lucide-shopping-cart" class="size-8 text-dimmed" aria-hidden="true" />
      <p class="text-base font-semibold text-highlighted">
        Rien à acheter
      </p>
      <p class="max-w-xs text-sm text-muted">
        Préparez d'abord la liste à partir de vos menus, ou ajoutez un article en bas de page.
      </p>
      <UButton label="Préparer la liste" color="neutral" variant="outline" icon="i-lucide-list-checks" @click="list.mode = 'prepare'" />
    </div>

    <template v-else>
      <!-- Progression : reprend la barre des macros. -->
      <div class="flex flex-col gap-2" aria-live="polite">
        <p class="flex items-baseline justify-between gap-3">
          <span class="text-sm text-muted">Dans le panier</span>
          <span class="tabular-nums">
            <span class="text-2xl font-bold text-highlighted">{{ list.doneCount }}</span>
            <span class="text-sm text-muted"> / {{ list.toBuy.length }} articles</span>
          </span>
        </p>
        <div
          class="h-1.5 overflow-hidden rounded-full bg-accented"
          role="progressbar"
          :aria-valuenow="list.doneCount"
          aria-valuemin="0"
          :aria-valuemax="list.toBuy.length"
          aria-label="Articles dans le panier"
        >
          <div class="h-full rounded-full bg-primary transition-all duration-500" :style="{ width: `${progress * 100}%` }" />
        </div>
      </div>

      <Transition
        enter-active-class="transition duration-300 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0 -translate-y-2"
        leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
        leave-to-class="opacity-0"
      >
        <div
          v-if="list.isComplete && !list.completionDismissed"
          class="flex flex-col gap-4 rounded-xl border border-primary/40 bg-default p-5 sm:flex-row sm:items-center"
        >
          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <UIcon name="i-lucide-check" class="size-5 text-primary" aria-hidden="true" />
          </span>
          <div class="flex-1">
            <p class="text-base font-semibold text-highlighted">
              Courses terminées
            </p>
            <p class="text-sm tabular-nums text-muted">
              {{ list.toBuy.length }} articles dans le panier.
            </p>
          </div>
          <div class="flex gap-2">
            <UButton label="Garder la liste" color="neutral" variant="ghost" @click="list.completionDismissed = true" />
            <UButton label="Vider les articles cochés" icon="i-lucide-trash-2" @click="list.clearCart()" />
          </div>
        </div>
      </Transition>

      <section
        v-for="group in list.aisles"
        :key="group.aisle.id"
        :aria-labelledby="`aisle-${group.aisle.id}`"
        class="flex flex-col overflow-hidden rounded-xl border border-default bg-default"
      >
        <h2
          :id="`aisle-${group.aisle.id}`"
          class="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold"
          :class="group.pending.length ? 'text-highlighted' : 'text-muted'"
        >
          <UIcon :name="categoryIconName(group.aisle.icon)!" class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="flex-1">{{ group.aisle.label }}</span>
          <span v-if="group.pending.length" class="text-xs font-normal tabular-nums text-dimmed">
            {{ group.done.length }} / {{ group.pending.length + group.done.length }}
          </span>
          <span v-else class="flex items-center gap-1 text-xs font-medium text-primary">
            <UIcon name="i-lucide-check" class="size-3.5" aria-hidden="true" />
            Rayon terminé
          </span>
        </h2>

        <TransitionGroup
          tag="ul"
          name="pick"
          class="divide-y divide-default"
          :class="group.pending.length && 'border-t border-default'"
        >
          <li v-for="line in group.pending" :key="line.id">
            <button
              type="button"
              class="flex min-h-14 w-full cursor-pointer items-center gap-4 px-4 py-2.5 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary active:bg-elevated"
              :aria-label="`${line.label}${line.quantityLabel ? `, ${line.quantityLabel}` : ''} : mettre dans le panier`"
              @click="list.toggleInCart(line.id)"
            >
              <span class="size-6 shrink-0 rounded-full border-2 border-accented" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base font-medium text-highlighted">{{ line.label }}</span>
                <span v-if="line.sources.length" class="block truncate text-xs text-dimmed">{{ line.sources.join(', ') }}</span>
              </span>
              <span v-if="line.quantityLabel" class="shrink-0 text-end text-sm font-semibold tabular-nums text-highlighted">
                {{ line.quantityLabel }}
              </span>
            </button>
          </li>
        </TransitionGroup>

        <div v-if="group.done.length" class="border-t border-default">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-start text-xs text-muted transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            :aria-expanded="openCarts.has(group.aisle.id)"
            @click="toggleCart(group.aisle.id)"
          >
            <span class="flex-1">Dans le panier <span class="tabular-nums">({{ group.done.length }})</span></span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 shrink-0 transition-transform duration-200"
              :class="openCarts.has(group.aisle.id) && 'rotate-180'"
            />
          </button>
          <ul v-if="openCarts.has(group.aisle.id)" class="divide-y divide-default border-t border-default">
            <li v-for="line in group.done" :key="line.id">
              <button
                type="button"
                class="flex min-h-12 w-full cursor-pointer items-center gap-4 px-4 py-2 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                :aria-label="`${line.label} : retirer du panier`"
                @click="list.toggleInCart(line.id)"
              >
                <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary" aria-hidden="true">
                  <UIcon name="i-lucide-check" class="size-4 text-inverted" />
                </span>
                <span class="min-w-0 flex-1 truncate text-sm text-dimmed line-through">{{ line.label }}</span>
                <span v-if="line.quantityLabel" class="shrink-0 text-sm tabular-nums text-dimmed line-through">{{ line.quantityLabel }}</span>
              </button>
            </li>
          </ul>
        </div>
      </section>
    </template>

    <form class="flex gap-2" @submit.prevent="onAdd">
      <UInput
        v-model="newLabel"
        size="lg"
        placeholder="Oublié quelque chose ?"
        icon="i-lucide-plus"
        aria-label="Ajouter un article oublié"
        enterkeyhint="done"
        class="min-w-0 flex-1"
      />
      <UButton type="submit" size="lg" label="Ajouter" color="neutral" variant="outline" :disabled="!newLabel.trim()" />
    </form>
  </div>
</template>

<style scoped>
.pick-leave-active {
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.pick-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

.pick-enter-active {
  transition: opacity 200ms ease;
}

.pick-enter-from {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .pick-leave-active,
  .pick-enter-active {
    transition: none;
  }
}
</style>
