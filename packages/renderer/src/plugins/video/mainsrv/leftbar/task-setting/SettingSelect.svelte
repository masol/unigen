<!-- $lib/components/script-to-video/SettingSelect.svelte -->
<!-- ╭───────────────────────────────────────────────────────────────╮ -->
<!-- │ SettingSelect.svelte                                          │ -->
<!-- │ 职责：通用「图标标题 + 徽章 + 主副文案」单选下拉。           │ -->
<!-- │       徽章由调用方通过 badge snippet 自定义渲染。            │ -->
<!-- ╰───────────────────────────────────────────────────────────────╯ -->
<script
  lang="ts"
  generics="T extends { value: string; label: string; sub?: string }"
>
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import type { Icon as TablerIcon } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";

  let {
    label,
    icon: SectionIcon,
    options,
    value = $bindable(),
    badge,
  }: {
    label: string;
    icon: TablerIcon;
    options: readonly T[];
    value: string;
    /** 徽章渲染槽,接收当前选项,Trigger 与每个 Item 复用同一渲染逻辑 */
    badge?: Snippet<[T]>;
  } = $props();

  let selected = $derived(options.find((o) => o.value === value) ?? options[0]);
</script>

<section class="space-y-3">
  <div class="flex items-center gap-2">
    <SectionIcon size={16} stroke={1.5} class="text-muted-foreground" />
    <Label
      class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
    >
      {label}
    </Label>
  </div>

  <Select.Root type="single" bind:value>
    <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-2.5">
      <span class="flex items-center gap-3 min-w-0">
        {#if badge}
          {@render badge(selected)}
        {/if}
        <span class="flex items-baseline gap-2 min-w-0">
          <span class="text-sm font-semibold text-foreground truncate">
            {selected.label}
          </span>
          {#if selected.sub}
            <span class="text-xs text-muted-foreground truncate">
              {selected.sub}
            </span>
          {/if}
        </span>
      </span>
    </Select.Trigger>

    <Select.Content class="rounded-xl max-h-80">
      {#each options as option (option.value)}
        <Select.Item
          value={option.value}
          label={option.label}
          class="rounded-lg"
        >
          <div class="flex items-center gap-3 w-full">
            {#if badge}
              {@render badge(option)}
            {/if}
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-medium text-foreground"
                >{option.label}</span
              >
              {#if option.sub}
                <span class="text-xs text-muted-foreground truncate"
                  >{option.sub}</span
                >
              {/if}
            </div>
          </div>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</section>
