<script lang="ts">
  import Icon from "@iconify/svelte";
  import { IconQuestionMark } from "@tabler/icons-svelte";
  import type { Component } from "svelte";
  import { ensureIconifyCollections, resolveIcon } from "./source";

  let {
    name = "IconMoodSmile",
    size = 20,
    stroke = 1.5,
    class: className = "",
  }: {
    name?: string;
    size?: number;
    stroke?: number;
    class?: string;
  } = $props();

  const resolved = $derived(resolveIcon(name));

  // 仅当需要 iconify 时才触发一次性注册（内部有单例守卫，不会重复执行）
  let iconifyLoaded = $state(false);
  $effect(() => {
    if (resolved.kind === "iconify" && !iconifyLoaded) {
      ensureIconifyCollections().then(() => (iconifyLoaded = true));
    }
  });

  const TablerComp = $derived(
    resolved.kind === "tabler"
      ? (resolved.value as Component)
      : IconQuestionMark,
  );
</script>

{#if resolved.kind === "tabler"}
  {@const Comp = TablerComp}
  <Comp {size} {stroke} class={className} />
{:else if resolved.kind === "iconify"}
  {#if iconifyLoaded}
    <Icon
      icon={resolved.value as string}
      width={size}
      height={size}
      class={className}
    />
  {:else}
    <!-- 注册期占位，尺寸对齐避免布局抖动 -->
    <span
      class="inline-block animate-pulse rounded-lg bg-muted {className}"
      style:width="{size}px"
      style:height="{size}px"
    ></span>
  {/if}
{:else if resolved.kind === "base64"}
  <img
    src={resolved.value as string}
    alt=""
    width={size}
    height={size}
    class="inline-block object-contain {className}"
  />
{:else if resolved.kind === "svg"}
  <span
    class="inline-flex items-center justify-center {className}"
    style:width="{size}px"
    style:height="{size}px"
    aria-hidden="true"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html resolved.value as string}
  </span>
{:else}
  <span
    class="inline-block {className}"
    style:width="{size}px"
    style:height="{size}px"
  ></span>
{/if}
