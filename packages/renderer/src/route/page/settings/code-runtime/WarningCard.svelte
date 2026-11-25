<script lang="ts">
  import { IconChevronDown, IconShieldCancel } from "@tabler/icons-svelte";
  import { cubicInOut } from "svelte/easing";
  import { slide } from "svelte/transition";

  // 默认收起：折叠态已展示核心风险摘要，展开后给出完整说明。
  let open = $state(false);

  const panelId = "code-runtime-safety-panel";
</script>

<section class="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-controls={panelId}
    class="flex w-full items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
  >
    <IconShieldCancel class="mt-0.5 size-5 shrink-0 text-amber-600" />
    <div class="flex-1 space-y-1">
      <p class="text-sm font-medium text-foreground">安全须知</p>
      <p class="text-xs leading-relaxed text-muted-foreground">
        本页管理的是 AI
        可调用的本机工具。编程类工具自由度更高、可能性更多，风险也更高。
      </p>
    </div>
    <IconChevronDown
      class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 {open
        ? 'rotate-180'
        : ''}"
    />
  </button>

  {#if open}
    <div
      id={panelId}
      transition:slide={{ duration: 180, easing: cubicInOut }}
      class="mt-3 space-y-2 border-t border-amber-500/20 pt-3 text-xs leading-relaxed text-muted-foreground"
    >
      <p>
        <span class="font-medium text-foreground">适用范围：</span>
        本页设置作用于 AI 生成并执行的代码、脚本，以及通过本机工具发起的下载等操作。技能附带的脚本默认拒绝执行，如需允许，请在技能页面启用。
      </p>
      <p>
        <span class="font-medium text-foreground">风险：</span>
        编程类工具可以组合、修改并生成新行为，入口处的安全限制只能降低误操作概率，无法阻止
        AI 通过撰写代码绕过限制；本机工具也可能读写文件、访问网络或执行下载任务。
      </p>
      <p>
        <span class="font-medium text-foreground">应对：</span>
        确认模型及技能来源，不使用来源不明的模型或技能；按需启用本机工具，遵循最小权限；对高风险任务改用云端沙盒或人工审查。云端沙盒可降低
        AI 犯错造成的影响，但延迟更高，并可能产生费用。
      </p>
    </div>
  {/if}
</section>
