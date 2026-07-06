<!-- DevSettingsPanel.svelte -->
<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { IconAdjustments } from "@tabler/icons-svelte";
  import BlueprintSection from "./BlueprintSection.svelte";
  import EditorSection from "./EditorSection.svelte";
</script>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- Root: full-bleed dev settings panel                        -->
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
        <IconAdjustments size={24} stroke={1.5} class="text-primary" />
      </div>
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">
          开发选项
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          蓝图与代码编辑器偏好设置
        </p>
      </div>
    </div>
  </header>

  <!-- ══════════════════════════════════════════════════════ -->
  <!-- Scrollable Settings Body                              -->
  <!-- ══════════════════════════════════════════════════════ -->
  <div class="flex-1 min-h-0">
    <ScrollArea class="h-full">
      <div class="px-8 lg:px-12 py-8 space-y-8">
        <!-- ╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → BlueprintSection.svelte]            │ -->
        <!-- │ 职责：蓝图表分页等展示相关设置项                    │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <BlueprintSection />
        <!-- ╭─── / BlueprintSection ───╮ -->

        <!-- ╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → EditorSection.svelte]               │ -->
        <!-- │ 职责：代码编辑器字体、行高与行为开关设置项          │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <EditorSection />
        <!-- ╭─── / EditorSection ───╮ -->

        <!-- Bottom breathing space -->
        <div class="h-8"></div>
      </div>
    </ScrollArea>
  </div>
</div>
