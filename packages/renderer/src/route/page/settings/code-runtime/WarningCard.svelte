<script lang="ts">
  import { IconChevronDown, IconShieldCancel } from "@tabler/icons-svelte";
  import { cubicInOut } from "svelte/easing";
  import { slide } from "svelte/transition";

  // 默认展开：安全信息必须显性化，用户可以点收起。
  let open = $state(true);
</script>

<section class="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
  <button
    type="button"
    onclick={() => (open = !open)}
    class="flex w-full items-start gap-3 text-left"
  >
    <IconShieldCancel class="mt-0.5 size-5 shrink-0 text-amber-600" />
    <div class="flex-1 space-y-1">
      <p class="text-sm font-medium text-foreground">关于安全边界</p>
      <p class="text-xs leading-relaxed text-muted-foreground">
        这里的限制只约束 AI <b>通过工具直接发起</b>的访问。AI
        生成的代码本身具备完整的脚本能力，恶意代码理论上可以绕过这些边界访问磁盘其他位置或网络。隔离模式（如沙盒）只能提高难度，无法
        100% 保证隔离。
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
      class="mt-3 space-y-1 border-t border-amber-500/20 pt-3 text-xs leading-relaxed text-muted-foreground"
    >
      <p>推荐做法：</p>
      <ul class="ml-4 list-disc space-y-1">
        <li>把工作目录限制在专门的文件夹，不要指向包含密钥的目录；</li>
        <li>敏感任务关闭网络访问，或使用隔离模式；</li>
        <li>只在信任的任务上启用代码执行。</li>
      </ul>
    </div>
  {/if}
</section>
