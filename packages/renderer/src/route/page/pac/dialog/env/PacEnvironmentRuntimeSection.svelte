<script lang="ts">
  import FieldShell from "./PacEnvironmentField.svelte";
  import TriStateSelect from "./TriStateSelect.svelte";
  import type { TriState } from "./pac-environment-types";

  let {
    streaming = $bindable("unset" as TriState),
    persist = $bindable("unset" as TriState),
    strict = $bindable("unset" as TriState),
  }: {
    streaming?: TriState;
    persist?: TriState;
    strict?: TriState;
  } = $props();
</script>

<div class="grid gap-4 md:grid-cols-3">
  <FieldShell label="流式">
    <TriStateSelect bind:value={streaming} ariaLabel="流式 streaming" />
  </FieldShell>

  <FieldShell label="持久化">
    <TriStateSelect bind:value={persist} ariaLabel="持久化 persist" />
  </FieldShell>

  <FieldShell label="严格工具调用">
    <TriStateSelect
      bind:value={strict}
      ariaLabel="严格工具调用 strict tool calling"
    />
  </FieldShell>
</div>
