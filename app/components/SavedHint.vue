<script setup lang="ts">
/** « Enregistré » discret, affiché un instant chaque fois que `stamp` change (enregistrement automatique). */
const props = defineProps<{
  stamp: number
}>()

const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(() => props.stamp, () => {
  visible.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (visible.value = false), 1800)
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <p class="flex items-center gap-1 text-xs text-muted" aria-live="polite">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-500"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <span v-if="visible" class="flex items-center gap-1">
        <UIcon name="i-lucide-check" class="size-3.5 text-success" />
        Enregistré
      </span>
    </Transition>
  </p>
</template>
