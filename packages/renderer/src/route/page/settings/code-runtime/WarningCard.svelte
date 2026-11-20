<script lang="ts">
  import { IconChevronDown, IconShieldCancel } from "@tabler/icons-svelte";
  import { cubicInOut } from "svelte/easing";
  import { slide } from "svelte/transition";

  // 默认展开：安全信息必须显性化，用户可以点收起。
  let open = $state(false);
</script>

<section class="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
  <button
    type="button"
    onclick={() => (open = !open)}
    class="flex w-full items-start gap-3 text-left"
  >
    <IconShieldCancel class="mt-0.5 size-5 shrink-0 text-amber-600" />
    <div class="flex-1 space-y-1">
      <p class="text-sm font-medium text-foreground">安全须知</p>
      <p class="text-xs leading-relaxed text-muted-foreground">
        代码执行的风险取决于两点：AI 是否会犯错；AI 是否为你服务。
      </p>
    </div>
    <IconChevronDown
      class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform {open
        ? 'rotate-180'
        : ''}"
    />
  </button>

  {#if open}
    <div
      transition:slide={{ duration: 180, easing: cubicInOut }}
      class="mt-3 space-y-2 border-t border-amber-500/20 pt-3 text-xs leading-relaxed text-muted-foreground"
    >
      <p>
        <span class="font-medium text-foreground">适用范围：</span>
        本页设置只作用于 AI 生成并执行的代码。
      </p>
      <p>技能附带的脚本默认拒绝执行，如需允许，请在技能页面启用。</p>
      <p>
        <span class="font-medium text-foreground">风险：</span>
        本地环境在入口限定代码访问项目目录，但AI 可以通过撰写代码绕过该限制。同理，云端沙盒也不保证
        100% 隔离，AI 具备相应能力时可能会突破限制。
      </p>
      <p>
        <span class="font-medium text-foreground">应对：</span>
        确认模型及技能来源，不使用来源不明的模型或技能。可以改用云端沙盒来执行代码；虽然云端沙盒也无法100%阻止
        AI 的有意破坏，但可以降低 AI 犯错造成的影响。代价是延迟高，并且会产生费用。
      </p>
    </div>
  {/if}
</section>
