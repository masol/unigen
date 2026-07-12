<!-- ╭───────────────────────────────────────────────────────────────╮ -->
<!-- │ SettingSelect.svelte                                          │ -->
<!-- │ 职责：通用「图标标题 + 徽章 + 主副文案」单选下拉。           │ -->
<!-- │       徽章由调用方通过 badge snippet 自定义渲染。            │ -->
<!-- │       改为单向数据流：接收 value prop，触发 onchange 回调。  │ -->
<!-- ╰───────────────────────────────────────────────────────────────╯ -->
<script
  lang="ts"
  generics="T extends { value: string; label: string; sub?: string }"
>
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import type { Icon as TablerIcon } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";

  let {
    label,
    icon: SectionIcon,
    options,
    value,
    onchange,
    badge,
  }: {
    label: string;
    icon: TablerIcon;
    options: readonly T[];
    value: string;
    /** 值变更时的回调，接收新值并返回 Promise（异步保存） */
    onchange: (newValue: string) => Promise<void>;
    /** 徽章渲染槽,接收当前选项,Trigger 与每个 Item 复用同一渲染逻辑 */
    badge?: Snippet<[T]>;
  } = $props();

  let selected = $derived(options.find((o) => o.value === value) ?? options[0]);

  // 内部受控值，用于处理异步更新期间的 UI 状态
  let internalValue = $derived(value);

  // 同步外部 value 到内部状态
  async function handleChange(newValue: string | undefined) {
    console.log("handleChange",newValue)
    if (!newValue || newValue === value) return;

    // 立即更新 UI（乐观更新）
    internalValue = newValue;

    // 异步保存到 store
    try {
      await onchange(newValue);
    } catch (error) {
      // 保存失败时回滚 UI
      console.error("Failed to save setting:", error);
      internalValue = value;
    }
  }
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

  <Select.Root type="single" value={internalValue} onValueChange={handleChange}>
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

<!--
╭───────────────────────────────────────────────────────────────╮
│ 需要的组件                                                     │
╰───────────────────────────────────────────────────────────────╯
• Select
• Label
-->
