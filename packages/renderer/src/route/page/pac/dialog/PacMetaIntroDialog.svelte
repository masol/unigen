<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { PacFrontMatter } from "@app/main/types";
  import { onMount } from "svelte";

  import {
    buildStringPatch,
    readString,
    type PacMetaDialogCommonProps,
  } from "./pac-meta-dialog-utils";

  let { value, onClose, onCancel }: PacMetaDialogCommonProps = $props();

  const initialName = readString(value, "name");
  const initialDescription = readString(value, "description");

  let name = $state(initialName);
  let description = $state(initialDescription);

  let hasChanges = $derived(
    name !== initialName || description !== initialDescription,
  );

  function save() {
    const patch: Partial<PacFrontMatter> = {
      name: buildStringPatch(value.name, name),
      description: buildStringPatch(value.description, description),
    };
    onClose?.(patch);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      onCancel?.();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && hasChanges) {
      save();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

<div class="space-y-6 p-6">
  <div class="space-y-2">
    <h2 class="text-lg font-medium">自我介绍</h2>
    <p class="text-sm text-muted-foreground">
      定义 Agent 的名称与描述，便于其他 Agent 发现与调用。
    </p>
  </div>

  <label class="block space-y-2">
    <span class="text-xs font-medium text-muted-foreground">名称 name</span>
    <input
      class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      bind:value={name}
      placeholder="例如：代码审查助手"
    />
  </label>

  <label class="block space-y-2">
    <span class="text-xs font-medium text-muted-foreground"
      >描述 description</span
    >
    <textarea
      class="min-h-32 w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      bind:value={description}
      placeholder="简要说明这个 Agent 的职责、适用场景与能力边界。"></textarea>
  </label>

  <div class="flex justify-end gap-3">
    <Button variant="outline" class="rounded-xl" onclick={() => onCancel?.()}>
      取消
    </Button>
    <Button class="rounded-xl" disabled={!hasChanges} onclick={save}
      >保存</Button
    >
  </div>
</div>
