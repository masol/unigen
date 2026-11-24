<script lang="ts">
  import {
    IconChevronDown,
    IconShieldCancel,
    IconTool,
  } from "@tabler/icons-svelte";
  import { cubicInOut } from "svelte/easing";
  import { slide } from "svelte/transition";

  let noticeOpen = $state(false);
</script>

<div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-6 md:p-8">
  <header class="space-y-1">
    <h1 class="text-xl font-semibold tracking-tight text-foreground">
      自有算力
    </h1>

    <p class="text-sm text-muted-foreground">
      管理本机或通过 SSH 连接的推理与训练。
    </p>
  </header>

  <section class="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
    <button
      type="button"
      onclick={() => (noticeOpen = !noticeOpen)}
      class="flex w-full items-start gap-3 text-left"
    >
      <IconShieldCancel class="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div class="flex-1 space-y-1">
        <p class="text-sm font-medium text-foreground">用途说明</p>
        <p class="text-xs leading-relaxed text-muted-foreground">
          自有算力为支持RSI而生。如仅需本地运行AI，请使用 Ollama / LM Studio
          等工具，并在「设置 → AIGC 模型」中手动接入。
        </p>
      </div>
      <IconChevronDown
        class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform {noticeOpen
          ? 'rotate-180'
          : ''}"
      />
    </button>

    {#if noticeOpen}
      <div
        transition:slide={{ duration: 180, easing: cubicInOut }}
        class="mt-3 space-y-2 border-t border-amber-500/20 pt-3 text-xs leading-relaxed text-muted-foreground"
      >
        <p>
          <span class="font-medium text-foreground">能力边界：</span>
          民用电脑当前只能做微调（LoRA/QLoRA）。生产级、基于集群的大规模预训练不在
          Unigen 的支持范围内。
        </p>
        <p>
          <span class="font-medium text-foreground">目标：</span>
          为了实现自我改进(RSI)，AI 需要能自行发起微调、挂载模型、进行测试，并根据结果继续微调，形成完整闭环。该闭环会在「自有算力」实现后支持。
        </p>
        <p>
          <span class="font-medium text-foreground">产品定位：</span>
          Unigen 为个人服务，默认运行于民用电脑，不替代专业训练平台或工具。
        </p>
      </div>
    {/if}
  </section>

  <div
    class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center"
  >
    <span
      class="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
    >
      <IconTool class="size-7" />
    </span>
    <div class="space-y-1">
      <p class="text-sm font-medium text-foreground">自有算力尚未实现</p>
      <p class="max-w-md text-xs text-muted-foreground">
        需要执行本地AI，请使用 Ollama / LM Studio 等工具运行模型 → 在「AIGC
        模型」中手动接入 → 由 Unigen 使用该模型。
      </p>
    </div>
  </div>
</div>
