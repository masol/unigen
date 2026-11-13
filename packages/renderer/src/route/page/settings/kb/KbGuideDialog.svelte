<script lang="ts">
  import type { DialogComponentProps } from "$lib/types/dialog";
  import KbGuide from "./KbGuide.svelte";

  /**
   * 返回值契约：只返回范例名称（字符串）。
   *
   * DialogHost 模板里的 onClose 是 `(data: unknown) => void`，
   * 我们声明 `(result: string) => void` —— 反方向上 (data: unknown)
   * 可赋给 (result: string)，交叉类型安全。
   */
  type Props = {
    /** 由 DialogHost 注入，关闭对话框并把名称交回 safeShow。 */
    onClose?: (result: string) => void;
    /** 由 DialogHost 注入，处理 Esc / 遮罩取消。 */
    onCancel?: (reason: unknown) => void;
  } & DialogComponentProps<string>;

  let { onClose }: Props = $props();
</script>

<div class="py-4">
  <KbGuide onPick={(template) => onClose?.(template.name)} />
</div>
