<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogOverlay,
  } from "$lib/components/ui/dialog";
  // import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { dialogStore, DIALOG_SIZE_CLASSES } from "$lib/store/ui/dialog.svelte";
  import { IconX } from "@tabler/icons-svelte";

  const dialogs = $derived(dialogStore.dialogs);

  function handleOpenChange(dialogId: string, isOpen: boolean): void {
    if (!isOpen) {
      const dialog = dialogs.find((d) => d.id === dialogId);
      if (dialog && !dialog.persistent) {
        dialogStore.cancel(dialogId, "backdrop");
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      const current = dialogStore.current;
      if (current && !current.closeOnEscape) {
        e.stopPropagation();
        e.preventDefault();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#each dialogs as dialog, index (dialog.id)}
  {@const isTop = index === dialogs.length - 1}
  {@const zIndex = 50 + index * 2}
  {@const isFull = dialog.size === "full"}
  {@const sizeClass = dialog.contentClass ?? DIALOG_SIZE_CLASSES[dialog.size]}

  <Dialog
    open={true}
    onOpenChange={(open) => handleOpenChange(dialog.id, open)}
  >
    <!-- Overlay -->
    <DialogOverlay
      class="fixed inset-0 bg-black/50 backdrop-blur-sm"
      style="z-index: {zIndex};"
    />

    <!--
            DialogContent 作为纯定位容器，去除内部 padding 和尺寸限制。
            shadcn 的 DialogContent 默认有 max-w、padding 等样式，
            通过 class 覆盖掉，完全由我们自己控制。
        -->
    <DialogContent
      class="
        fixed p-0 border-0 bg-transparent shadow-none ring-0
        focus:outline-none focus-visible:outline-none
        {isFull
        ? 'inset-0 translate-x-0 translate-y-0 top-0 left-0 w-screen h-screen max-w-none'
        : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full ' +
          sizeClass}
    "
      style="z-index: {zIndex + 1};"
      showCloseButton={false}
    >
      <div
        class="
            relative flex flex-col bg-background border border-border/50 shadow-2xl w-full
            {isFull ? 'h-full rounded-none' : 'rounded-3xl'}
        "
        style={isFull ? "" : "max-height: calc(100vh - 2rem);"}
      >
        {#if dialog.showCloseButton}
          <button
            class="absolute top-4 right-4 z-10 size-8 flex items-center justify-center
                    rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted
                    transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onclick={() => dialogStore.cancel(dialog.id, "close_button")}
            aria-label="关闭"
          >
            <IconX class="size-4" />
          </button>
        {/if}

        <!-- overflow-y-auto 直接在这个 div 上，高度由父容器的 max-height 约束 -->
        <div class="overflow-y-auto flex-1 min-h-0">
          <div class="p-6">
            <dialog.component
              {...dialog.props}
              dialogId={dialog.id}
              isTopDialog={isTop}
              onClose={(data: unknown) => dialogStore.close(dialog.id, data)}
              onCancel={(reason: unknown) =>
                dialogStore.cancel(dialog.id, reason)}
            />
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
{/each}
