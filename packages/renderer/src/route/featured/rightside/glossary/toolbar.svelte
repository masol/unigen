<!-- $lib/components/glossary/glossary-toolbar.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { IconPlus, IconSearch } from "@tabler/icons-svelte";
  import BlueprintSwitcher from "./blueprint-switcher.svelte";
  import { blueprintStore } from "./store.svelte.js";

  function handleCreate() {
    // 新建操作 —— 由你实现
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between gap-3">
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → glossary-blueprint-switcher.svelte]  │ -->
    <!-- │ 职责：左上角蓝图类型下拉切换（术语/元术语/能力）     │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <BlueprintSwitcher />
    <!-- ╭─── / blueprint-switcher ───╮ -->

    <Button
      size="sm"
      class="rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      onclick={handleCreate}
    >
      <IconPlus size={20} stroke={1.5} />
      新建
    </Button>
  </div>

  <div class="relative">
    <span
      class="pointer-events-none absolute inset-y-0 inset-s-0 flex items-center ps-3 text-muted-foreground"
    >
      <IconSearch size={20} stroke={1.5} />
    </span>
    <Input
      placeholder="按名称过滤…"
      value={blueprintStore.name}
      oninput={(e) => blueprintStore.setName(e.currentTarget.value)}
      class="w-full rounded-xl ps-10"
    />
  </div>
</div>
