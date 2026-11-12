<script lang="ts">
  import {
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import SkillMarketGuide from "./SkillMarketGuide.svelte";

  type Props = {
    onOpen?: (url: string) => void;
  } & DialogComponentProps<void>;

  let { onOpen }: Props = $props();
</script>

<DialogHeader>
  <DialogTitle>常见技能市场</DialogTitle>
  <DialogDescription>
    从以下知名市场发现并安装 Agent 技能。点击卡片将在外部浏览器打开。
  </DialogDescription>
</DialogHeader>

<div class="py-4">
  <SkillMarketGuide {onOpen} dense />
</div>
