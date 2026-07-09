<!-- $lib/components/glossary/glossary-toolbar.svelte -->
<script lang="ts">
  import PromptDialog from "$lib/components/dialog/Prompt.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import { IconPlus, IconSearch } from "@tabler/icons-svelte";
  import { debounce } from "radashi";
  import { push } from "svelte-spa-router";
  import BlueprintSwitcher from "./blueprint-switcher.svelte";
  import { blueprintStore } from "./store.svelte.js";

  // 防抖时长：过滤/搜索场景最佳区间为 300–500ms，此处取 400ms 兼顾响应与防抖。
  const DEBOUNCE_MS = 400;

  // 本地即时回显值，与真正提交给 store 的值解耦，避免输入时屏幕重渲染闪烁。
  let localValue = $derived(blueprintStore.name);

  // radashi 的 debounce 返回带 flush()/cancel()/isPending() 的可控函数。
  const debouncedSet = debounce({ delay: DEBOUNCE_MS }, (value: string) => {
    blueprintStore.setName(value);
  });

  // 外部 store 变化（如程序化清空过滤）时，同步回本地值。
  ;

  // 组件卸载时取消任何挂起的防抖调用，避免脏更新。
  $effect(() => {
    return () => debouncedSet.cancel();
  });

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    localValue = e.currentTarget.value;
    debouncedSet(localValue);
  }

  // 立即提交：取消挂起并直接以最新本地值调用（用于 blur / 回车）。
  function commitNow() {
    debouncedSet.cancel();
    blueprintStore.setName(localValue);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitNow();
    }
  }

  async function handleCreate() {
    const name = await dialogStore.safeShow(
      PromptDialog,
      {
        title: `新建${blueprintStore.kindLabel}元素`,
        label: "新名称",
        placeholder: "请输入新的名称(不能与当前值冲突)",
        initialValue: "",
        required: true,
      },
      { size: "sm" },
    );

    if (!name) return;

    // 使用空 id 来跳转。
    push(`/editor/${blueprintStore.kind}/${encodeURIComponent(name)}/new`);
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
      value={localValue}
      oninput={handleInput}
      onblur={commitNow}
      onkeydown={handleKeydown}
      class="w-full rounded-xl ps-10"
    />
  </div>
</div>
