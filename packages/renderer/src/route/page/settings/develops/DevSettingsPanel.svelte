<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { IconAdjustments, IconAlertTriangle } from "@tabler/icons-svelte";
  import BlueprintSection from "./BlueprintSection.svelte";
  import EditorSection from "./EditorSection.svelte";
  import GeneralSection from "./GeneralSection.svelte";
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
        <p
          class="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2"
        >
          <span>蓝图与代码编辑器偏好设置 · 服务于 Unigen 开发者</span>
          <!-- 视觉焦点：警示徽章 -->
          <span
            class="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5
                   text-[11px] font-semibold tracking-wide
                   text-amber-600 dark:text-amber-400
                   ring-1 ring-inset ring-amber-500/30
                   shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
          >
            <IconAlertTriangle size={12} stroke={2.25} />
            普通用户忽略
          </span>
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
        <GeneralSection></GeneralSection>
        <BlueprintSection />
        <EditorSection />
        <div class="h-8"></div>
      </div>
    </ScrollArea>
  </div>
</div>
