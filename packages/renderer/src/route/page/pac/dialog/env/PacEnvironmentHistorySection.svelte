<script lang="ts">
  import FieldShell from "./PacEnvironmentField.svelte";

  let { historyText = $bindable("") }: { historyText?: string } = $props();

  const inputClass =
    "w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";
</script>

<FieldShell
  label="历史策略"
  hint="留空使用默认；-1 表示全部历史，0 禁用历史，正数表示附带最近 N 条。"
>
  <input
    type="number"
    min="-1"
    step="1"
    class={inputClass}
    bind:value={historyText}
    placeholder="-1 / 0 / N"
  />
</FieldShell>