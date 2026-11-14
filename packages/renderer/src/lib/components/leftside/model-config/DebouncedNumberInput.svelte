<!-- packages/renderer/src/lib/components/leftside/model-config/DebouncedNumberInput.svelte -->
<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { onDestroy } from "svelte";

  type Props = {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    class?: string;
    debounceMs?: number;
    onchange: (value: number) => void;
  };

  let {
    value,
    min = 1,
    max,
    step = 1,
    class: className = "",
    debounceMs = 350,
    onchange,
  }: Props = $props();

  let draft = $state(String(value));
  let focused = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const next = String(value);

    if (!focused && draft !== next) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      draft = next;
    }
  });

  function commit(raw: string) {
    const trimmed = raw.trim();
    const next = Number(trimmed);

    if (!trimmed || !Number.isFinite(next)) {
      draft = String(value);
      return;
    }

    const lower = min ?? -Infinity;
    const upper = max ?? Infinity;
    const clamped = Math.min(upper, Math.max(lower, next));

    draft = String(clamped);

    if (clamped !== value) onchange(clamped);
  }

  function schedule(raw: string) {
    draft = raw;

    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      timer = null;
      commit(raw);
    }, debounceMs);
  }

  function handleInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    schedule(target.value);
  }

  function handleBlur() {
    focused = false;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    commit(draft);
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<Input
  type="number"
  {min}
  {max}
  {step}
  bind:value={draft}
  onfocus={() => (focused = true)}
  oninput={handleInput}
  onblur={handleBlur}
  class={className}
/>
