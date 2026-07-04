<!-- ProviderPresetCombobox.svelte -->
<script lang="ts">
  import * as Command from "$lib/components/ui/command";
  import * as Popover from "$lib/components/ui/popover";
  import { cn } from "$lib/utils";
  import type { ProviderPreset } from "$lib/utils/model/types";
  import { IconCheck, IconPlus, IconSearch } from "@tabler/icons-svelte";

  import { KNOWN_PROVIDERS, findPreset } from "./providers";

  /* ─── 内部类型（由父组件以结构兼容形式传入） ─── */

  type Props = {
    selectedId?: string;
    isCustom?: boolean;
    onSelect?: (preset: ProviderPreset | null) => void;
  };

  let { selectedId = "", isCustom = false, onSelect }: Props = $props();

  let open = $state(false);
  let triggerWidth = $state(0);
  let triggerHeight = $state(40);

  const selectedPreset = $derived(findPreset(selectedId));

  function select(id: string) {
    if (id === "__custom__") {
      onSelect?.(null);
    } else {
      const preset = findPreset(id);
      if (preset) onSelect?.(preset);
    }
    open = false;
  }
</script>

<div
  class="relative"
  bind:clientWidth={triggerWidth}
  bind:clientHeight={triggerHeight}
>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class={cn(
            "flex h-10 w-full items-center gap-3 rounded-xl border border-input bg-background px-3 text-sm",
            "transition-all duration-200 hover:bg-accent/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // 打开时隐藏 trigger 的视觉表现，让弹层"无缝接管"该位置
            open && "pointer-events-none opacity-0",
          )}
        >
          <IconSearch class="size-4 shrink-0 text-muted-foreground" />

          {#if selectedPreset}
            <span class="min-w-0 flex-1 truncate text-left text-foreground">
              {selectedPreset.label}
            </span>
            <span class="shrink-0 text-xs text-muted-foreground">
              {selectedPreset.note}
            </span>
          {:else if isCustom}
            <span class="min-w-0 flex-1 text-left text-foreground">
              自定义配置
            </span>
          {:else}
            <span class="min-w-0 flex-1 text-left text-muted-foreground">
              搜索预设提供商…
            </span>
          {/if}
        </button>
      {/snippet}
    </Popover.Trigger>

    <!--
      关键：side="bottom" + sideOffset={-triggerHeight}
      → 让弹层从 trigger 的顶部开始向下展开，
        正好完整覆盖原按钮，避免用户被"两个相似控件"困扰。
    -->
    <Popover.Content
      class={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-popover p-0 shadow-xl",
        "animate-fade-in",
      )}
      align="start"
      side="bottom"
      sideOffset={-triggerHeight}
      style="width: {triggerWidth}px; z-index: 9999;"
    >
      <Command.Root class="rounded-xl">
        <Command.Input placeholder="输入名称搜索…" class="h-10" />
        <Command.List class="max-h-72">
          <Command.Empty>未找到匹配的提供商</Command.Empty>

          {#each KNOWN_PROVIDERS as group (group.heading)}
            <Command.Group heading={group.heading}>
              {#each group.presets as preset (preset.id)}
                <Command.Item
                  value={preset.id}
                  keywords={[preset.label, preset.note]}
                  onSelect={() => select(preset.id)}
                >
                  <div class="min-w-0 flex-1 space-y-0.5">
                    <p class="truncate text-sm font-medium">
                      {preset.label}
                    </p>
                    <p class="truncate text-xs text-muted-foreground">
                      {preset.note}
                    </p>
                  </div>
                  {#if selectedId === preset.id}
                    <IconCheck class="ml-auto size-4 shrink-0 text-primary" />
                  {/if}
                </Command.Item>
              {/each}
            </Command.Group>

            <Command.Separator />
          {/each}

          <Command.Group forceMount>
            <Command.Item
              value="__custom__"
              keywords={["自定义", "custom", "手动", "其他"]}
              forceMount
              onSelect={() => select("__custom__")}
            >
              <IconPlus class="size-4 text-muted-foreground" />
              自定义配置
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
</div>
