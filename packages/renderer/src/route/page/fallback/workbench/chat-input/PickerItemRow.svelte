<!-- 通用可勾选行 · tools / skills 复用 · 选中态圆圈勾 + 标题 + 描述 -->
<!--
  长内容防御（关键）：
  - 外层 flex item 只负责布局（min-w-0 flex-1），严禁加 overflow-hidden —
    祖先 overflow:hidden 会吞掉 truncate 的 text-overflow:ellipsis 绘制
  - 内层文字只挂 line-clamp-1，严禁再挂 block / inline-block —
    line-clamp-1 依赖 display:-webkit-box，任何其它 display 覆盖都会让 -webkit-line-clamp 失效
    （失效表现：内容整段显示，只有 overflow:hidden 在裁，省略号不出现）
  原生 title 策略：整行只挂一个 title（内容=简介），避免 name+desc 双 tooltip 重叠
-->
<script module lang="ts">
  export type PickerItem = {
    id: string;
    name?: string;
    title?: string;
    label?: string;
    description?: string;
    desc?: string;
    // 注：不要在此添加 "builtin" 或其它数据标记字段。
    // 内建工具由 PickerMenu 通过 builtinItems(id 白名单) 判定，不依赖 item 上的标记。
    // 任何在此声明但组件内不读取的字段，都会触发 svelte/no-unused-props。
  };
</script>

<script lang="ts">
  import { IconCheck, IconCircle } from "@tabler/icons-svelte";

  let {
    item,
    selected = false,
    onToggle = () => {},
  }: {
    item: PickerItem;
    selected?: boolean;
    onToggle?: () => void;
  } = $props();

  let name = $derived(item.name ?? item.title ?? item.label ?? item.id);
  let desc = $derived(item.description ?? item.desc ?? "");
</script>

<button
  type="button"
  onclick={onToggle}
  aria-pressed={selected}
  title={desc || undefined}
  class="flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
>
  <span class="mt-0.5 flex size-4 shrink-0 items-center justify-center">
    {#if selected}
      <span
        class="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <IconCheck size={10} stroke={2.5} />
      </span>
    {:else}
      <IconCircle size={14} stroke={1.5} class="text-muted-foreground/50" />
    {/if}
  </span>
  <span class="min-w-0 flex-1">
    <span class="line-clamp-1 text-xs font-medium text-foreground">
      {name}
    </span>
    {#if desc}
      <span class="line-clamp-1 text-xs text-muted-foreground">
        {desc}
      </span>
    {/if}
  </span>
</button>
