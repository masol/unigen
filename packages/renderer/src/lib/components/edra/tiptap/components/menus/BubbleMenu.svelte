<script lang="ts">
  import type { BubbleMenuPluginProps } from "@tiptap/extension-bubble-menu";
  import { BubbleMenuPlugin } from "@tiptap/extension-bubble-menu";
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import type { Editor } from "../../Editor.ts";
  interface Props {
    editor: Editor;
    pluginKey?: BubbleMenuPluginProps["pluginKey"];
    updateDelay?: BubbleMenuPluginProps["updateDelay"];
    resizeDelay?: BubbleMenuPluginProps["resizeDelay"];
    options?: BubbleMenuPluginProps["options"];
    appendTo?: BubbleMenuPluginProps["appendTo"];
    shouldShow?: BubbleMenuPluginProps["shouldShow"];
    getReferencedVirtualElement?: BubbleMenuPluginProps["getReferencedVirtualElement"];
    children: Snippet<[]>;
    class?: string;
    [key: string]: unknown;
  }

  let {
    editor,
    pluginKey = "bubbleMenu",
    updateDelay = undefined,
    resizeDelay = undefined,
    options = {},
    appendTo = undefined,
    shouldShow = null,
    getReferencedVirtualElement = undefined,
    children,
    class: className,
    ...rest
  }: Props = $props();

  let rootEl: HTMLDivElement | undefined = $state();

  let registered = false;

  $effect(() => {
    if (!rootEl || !editor) {
      return;
    }

    // Guard against Hot re-runs driven by reactive reads (e.g. transaction version)
    if (registered) {
      return;
    }
    registered = true;

    const el = rootEl;

    untrack(() => {
      el.style.visibility = "hidden";
      // 不在这里硬编码 position，交给 onShow 根据 strategy 动态设置

      el.remove();

      const mergedOptions: NonNullable<BubbleMenuPluginProps["options"]> = {
        ...options,
        onShow: () => {
          // Tiptap 包装器首次渲染时元素默认是 absolute，
          // 但 strategy: 'fixed' 需要 computePosition 看到 position: fixed，
          // 否则 getOffsetParent 返回定位祖先而非视口，导致首次坐标计算错误。
          el.style.position =
            options?.strategy === "fixed" ? "fixed" : "absolute";
          options?.onShow?.();
        },
      };

      editor.registerPlugin(
        BubbleMenuPlugin({
          editor,
          element: el,
          options: mergedOptions,
          pluginKey,
          resizeDelay,
          appendTo,
          shouldShow,
          getReferencedVirtualElement,
          updateDelay,
        }),
      );
    });

    return () => {
      registered = false;
      try {
        editor.unregisterPlugin(pluginKey);
      } catch {
        // editor may already be destroyed during navigation
      }
    };
  });
</script>

<div bind:this={rootEl} class={className} {...rest}>
  {@render children()}
</div>
