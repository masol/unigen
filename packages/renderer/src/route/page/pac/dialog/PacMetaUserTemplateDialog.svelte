<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    IconInfoCircle,
    IconSparkles,
    IconTool,
    IconWand,
  } from "@tabler/icons-svelte";
  import type { PacMetaDialogCommonProps } from "./pac-meta-dialog-utils";

  // 接口保留，未来恢复编辑功能时可直接复用 onClose/onCancel
  let { onClose, onCancel }: PacMetaDialogCommonProps = $props();

  void onClose;

  function acknowledge() {
    // 当前仅关闭对话框，不提交任何数据
    // 未来可在此处扩展为 onClose?.(defaultValue) 或触发其他副作用
    onCancel?.();
  }
</script>

<div class="flex w-full flex-col gap-6 p-6 animate-fade-in sm:p-8">
  <!-- 头部：一眼看懂当前状态与出路 -->
  <header class="flex items-start gap-4">
    <div
      class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
    >
      <IconInfoCircle size={22} stroke={1.75} />
    </div>
    <div class="space-y-1">
      <h2 class="text-base font-semibold tracking-tight">
        用户提示词渲染 · 暂未提供可视化编辑
      </h2>
      <p class="text-sm text-muted-foreground leading-relaxed">
        仍可通过 Agent 定义文件手动配置，编辑器会保留你的改动。
      </p>
    </div>
  </header>

  <!-- 逐层递进：做什么/何时生效 → 为什么没界面 → 两条路 → 未来 -->
  <div class="space-y-2.5">
    <section class="rounded-xl border bg-muted/30 p-4">
      <div class="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <IconSparkles size={15} stroke={1.75} class="text-primary" />
        它做什么 · 何时生效
      </div>
      <p class="text-sm text-muted-foreground leading-relaxed">
        当 Agent 收到输入（用户附件、语音、父 Agent
        传入的参数等）时，将输入与变量子系统（KvStore、Vector Search
        等）中的持久化数据一起格式化，生成真正送给该 Agent 的用户提示词。
      </p>
      <p class="mt-1.5 text-sm text-muted-foreground leading-relaxed">
        不配置时默认<strong class="font-medium text-foreground">透传</strong
        >：输入原样进入提示词。
      </p>
    </section>

    <section class="rounded-xl border bg-muted/30 p-4">
      <div class="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <IconInfoCircle size={15} stroke={1.75} class="text-primary" />
        为什么暂时没有界面
      </div>
      <p class="text-sm text-muted-foreground leading-relaxed">
        变量体系尚无让普通用户理解的组织方式；去掉变量后仅剩简单格式化与透传，意义有限。
      </p>
    </section>

    <section class="rounded-xl border bg-muted/30 p-4">
      <div class="mb-2.5 flex items-center gap-2 text-sm font-medium">
        <IconTool size={15} stroke={1.75} class="text-primary" />
        你可以怎么用 · 两种选择
      </div>
      <div class="space-y-3">
        <div class="flex items-start gap-2.5">
          <span
            class="mt-0.5 shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
            >普通用户</span
          >
          <p class="text-sm text-muted-foreground leading-relaxed">
            直接给 Agent 附加工具（tool）：由 Agent
            自行推理、调用工具读取与存储变量，零配置即可用；代价是每次多一步工具往返，token
            消耗更高。
          </p>
        </div>
        <div class="flex items-start gap-2.5">
          <span
            class="mt-0.5 shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
            >技术背景</span
          >
          <p class="text-sm text-muted-foreground leading-relaxed">
            在
            <code
              class="mx-0.5 rounded bg-background px-1 py-0.5 text-xs text-foreground"
              >Front-matter</code
            >
            中写模板：渲染时直接把变量注入提示词，省去 Agent 推理与调用工具的一步，更省
            token。语法见《PAC 语法参考手册》。
          </p>
        </div>
      </div>
      <div
        class="mt-3 flex items-start gap-2 border-t pt-2.5 text-xs text-muted-foreground leading-relaxed"
      >
        <IconWand
          size={14}
          stroke={1.75}
          class="mt-0.5 shrink-0 text-primary"
        />
        <span>
          未来 Unigen
          会尝试在编译期自动把工具方案编译为模板方案，两种做法效果将趋于一致。
        </span>
      </div>
    </section>
  </div>

  <!-- 一句话补充，避免正文过长 -->
  <p class="text-xs text-muted-foreground leading-relaxed">
    系统提示词同样支持模板语法，运行时自动处理变量注入 —— UI
    未作显式提示，但你手动修改同样有效。
  </p>

  <div class="flex justify-end pt-1">
    <Button class="min-w-28 rounded-xl" onclick={acknowledge}>我知道了</Button>
  </div>
</div>
