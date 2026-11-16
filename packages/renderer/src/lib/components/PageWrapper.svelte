<script lang="ts">
  import {
    registerBeforeLeave,
    unregisterBeforeLeave,
  } from "@keenmate/svelte-spa-router/helpers/navigation-guard";
  import type { Snippet } from "svelte";
  import { onDestroy, onMount } from "svelte";

  interface Props {
    beforeLeave?: (ctx: unknown) => Promise<void> | void;
    children?: Snippet;
  }

  let { beforeLeave = undefined, children }: Props = $props();

  /**
   * 记录实际注册到 navigation-guard 的引用，保证注册/注销严格配对。
   *
   * Svelte 5 中 `$props()` 是响应式的，onDestroy 时读到的 beforeLeave
   * 可能已不是 onMount 注册的那个引用（父组件重渲染、传新函数、或变为
   * undefined）。直接用当前值注销会残留旧守卫，导致后续导航时同一个
   * beforeLeave 被调用多次（表现为离开确认弹窗重复）。
   */
  let registeredGuard: ((ctx: unknown) => Promise<void> | void) | undefined;

  onMount(() => {
    if (beforeLeave) {
      registeredGuard = beforeLeave;
      registerBeforeLeave(registeredGuard);
    }
  });

  onDestroy(() => {
    if (registeredGuard) {
      unregisterBeforeLeave(registeredGuard);
      registeredGuard = undefined;
    }
  });
</script>

{@render children?.()}
