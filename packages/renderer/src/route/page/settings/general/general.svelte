<!-- SettingsPanel.svelte -->
<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { IconSettings } from "@tabler/icons-svelte";
  import GeneralSection from "./GeneralSection.svelte";
  import LocalModel from "./LocalModel.svelte";
  import AutoUpdator from "./AutoUpdator.svelte";
  import BackRestore from "./BackRestore.svelte";
  import ProjectType from "./ProjectType.svelte";
</script>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- Root: full-bleed settings panel                            -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="w-full h-full bg-background flex flex-col overflow-hidden">
  <!-- ══════════════════════════════════════════════════════ -->
  <!-- Header                                                -->
  <!-- ══════════════════════════════════════════════════════ -->
  <header class="shrink-0 border-b border-border/50 px-8 lg:px-12 py-6 lg:py-8">
    <div class="flex items-center gap-4">
      <div
        class="flex items-center justify-center size-11 rounded-xl bg-primary/10"
      >
        <IconSettings size={24} stroke={1.5} class="text-primary" />
      </div>
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">
          设置
        </h1>
        <p class="text-xs text-muted-foreground mt-1">应用偏好与本地模型配置</p>
      </div>
    </div>
  </header>

  <!-- ══════════════════════════════════════════════════════ -->
  <!-- Scrollable Settings Body                              -->
  <!-- ══════════════════════════════════════════════════════ -->
  <!-- ✅ 关键修复：flex-1 + min-h-0 打破 flex 子元素的隐式最小高度 -->
  <div class="flex-1 min-h-0">
    <ScrollArea class="h-full">
      <div class="px-8 lg:px-12 py-8 space-y-8">
        <GeneralSection></GeneralSection>
        <!-- ╭─── / GeneralSection ───╮ -->

        <!-- ╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → DataSection.svelte]                 │ -->
        <!-- │ 职责：数据备份与恢复操作入口                        │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <ProjectType></ProjectType>
        <!-- ╭─── / DataSection ───╮ -->

        <AutoUpdator></AutoUpdator>

        <!-- ╭─── / UpdateSection ───╮ -->
        <BackRestore></BackRestore>

        <LocalModel></LocalModel>
        <!-- ╭─── / ModelConfigSection ───╮ -->

        <!-- Bottom breathing space -->
        <div class="h-8"></div>
      </div>
    </ScrollArea>
  </div>
</div>
