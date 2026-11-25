<!-- packages/renderer/src/route/page/settings/general/SectionCard.svelte -->
<script lang="ts">
  import { IconChevronDown } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";

  type Props = {
    /** 区块标题 */
    title: string;
    /**
     * 可选角标计数（长时任务数量）。
     * <= 0 / 非有限数 / 未提供时一律不渲染，避免出现无意义的 “0”。
     */
    badge?: number | null;
    /** 初始是否展开；默认展开，保证 Tour 锚点首次进入可见。 */
    defaultOpen?: boolean;
    children: Snippet;
  };

  let { title, badge = null, defaultOpen = true, children }: Props = $props();

  // 折叠属于纯 UI 记忆，不回写配置。
  // svelte-ignore state_referenced_locally
  let open = $state(defaultOpen);

  const badgeText = $derived.by((): string | null => {
    if (typeof badge !== "number" || !Number.isFinite(badge)) return null;
    const count = Math.trunc(badge);
    if (count <= 0) return null;
    return count > 99 ? "99+" : String(count);
  });
</script>

<section>
  <!--
    标题行整体是点击热区：h2 内嵌 button 是合法的披露式标题写法
    （button 属于 phrasing content），既保留文档大纲，又让整行可点。
  -->
  <h2 class="px-1">
    <button
      type="button"
      onclick={() => (open = !open)}
      aria-expanded={open}
      class="flex w-full items-center gap-2 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span class="text-lg font-medium text-foreground">{title}</span>

      {#if badgeText}
        <span
          class="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground tabular-nums"
          aria-label={`${badgeText} 个长时任务进行中`}
        >
          {badgeText}
        </span>
      {/if}

      <IconChevronDown
        class="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 {open
          ? 'rotate-180'
          : ''}"
      />
    </button>
  </h2>

  <!--
    与 RuntimeCard 同一手法：grid-template-rows 0fr↔1fr 的纯 CSS 过渡，
    内容始终留在 DOM 中（折叠期间不会丢掉正在进行的刷新状态），
    折叠后 aria-hidden + inert，避免 Tab 焦点落到被裁剪的不可见控件上。
  -->
  <div
    class="grid transition-[grid-template-rows] duration-200 ease-out {open
      ? 'grid-rows-[1fr]'
      : 'grid-rows-[0fr]'}"
    aria-hidden={!open}
    inert={!open}
  >
    <div class="min-h-0 overflow-hidden">
      <div class="pt-4">
        {@render children()}
      </div>
    </div>
  </div>
</section>
