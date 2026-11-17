<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { PacFrontMatter } from "@app/main/types";

  import {
    buildStringPatch,
    readString,
    type PacMetaDialogCommonProps,
  } from "./pac-meta-dialog-utils";

  let { value, onClose, onCancel }: PacMetaDialogCommonProps = $props();

  let name = $state(readString(value, "name"));
  let description = $state(readString(value, "description"));

  function save() {
    const patch: Partial<PacFrontMatter> = {
      name: buildStringPatch(value.name, name),
      description: buildStringPatch(value.description, description),
    };
    onClose?.(patch);
  }
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
    <Button class="rounded-xl" onclick={save}>保存</Button>
  </div>
</div>
