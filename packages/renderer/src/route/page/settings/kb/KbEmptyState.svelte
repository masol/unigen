<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { IconLibrary, IconPlus } from "@tabler/icons-svelte";
  import KbGuide from "./KbGuide.svelte";

  type Template = { name: string; description: string };

  let {
    onAction,
    onPick,
  }: {
    /** 新建一个空白知识集。 */
    onAction?: () => void;
    /** 用范例预填新建对话框。 */
    onPick?: (template: Template) => void;
  } = $props();
</script>

<div class="animate-fade-in space-y-8">
  <div class="flex flex-col items-center justify-center space-y-4 py-8">
    <div class="flex size-16 items-center justify-center rounded-2xl bg-muted">
      <IconLibrary size={24} stroke={1.5} class="text-muted-foreground" />
    </div>

    <div class="max-w-md space-y-1 text-center">
      <h3 class="text-lg font-medium">还没有知识集</h3>
      <p class="text-sm text-muted-foreground">
        一个知识集 = 一组资料文件 + 一句说明。<br />说明是写给AI看的：告诉 AI
        这里面有什么、什么问题上该翻它。
      </p>
    </div>

    <Button class="gap-2 rounded-xl" onclick={() => onAction?.()}>
      <IconPlus size={16} stroke={1.5} />
      新建空白知识集
    </Button>
  </div>

  <KbGuide {onPick} />
</div>
