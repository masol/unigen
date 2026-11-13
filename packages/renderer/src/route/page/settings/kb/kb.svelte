<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import KbCard from "./KbCard.svelte";
  import KbEditorDialog from "./KbEditorDialog.svelte";
  import KbEmptyState from "./KbEmptyState.svelte";
  import KbGuideDialog from "./KbGuideDialog.svelte";
  import KbHeader from "./KbHeader.svelte";
  import { kbApi, kbStore } from "./kbStore.svelte";
  import { KB_TEMPLATES } from "./kbTemplates";
  import type { KbCollection, KbDoc } from "./kbTypes";

  const collections = $derived(kbStore.collections);
  const totalCount = $derived(collections.length);
  const totalDocs = $derived(kbStore.totalDocs);

  onMount(() => {
    void kbStore.load();
  });

  async function pickDocuments(): Promise<KbDoc[]> {
    try {
      const picked = await kbApi().knowledge.pickDocuments();
      if (Array.isArray(picked)) return picked;
    } catch {
      // 静默降级到 file input
    }
    return pickViaInput();
  }

  function pickViaInput(): Promise<KbDoc[]> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        resolve(
          files.map((f) => ({
            id: crypto.randomUUID(),
            name: f.name,
            size: f.size,
            kind: (f.name.split(".").pop() ?? "").toLowerCase(),
            status: "ready" as const,
          })),
        );
      };
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  async function openCreate(seed?: { name?: string; description?: string }) {
    const result = await dialogStore.safeShow(
      KbEditorDialog,
      { initial: seed ?? null, onPickDocuments: pickDocuments },
      { size: "xl6" },
    );
    if (!result || result.action !== "save") return;

    try {
      await kbStore.create({
        name: result.name,
        description: result.description,
        docs: result.docs,
      });
      toast.success("知识集已创建");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建知识集失败");
    }
  }

  async function openEdit(collection: KbCollection) {
    const result = await dialogStore.safeShow(
      KbEditorDialog,
      { collection, onPickDocuments: pickDocuments },
      { size: "xl6" },
    );
    if (!result || result.action === "cancel") return;

    if (result.action === "delete") {
      await handleDelete(collection, { skipConfirm: true });
      return;
    }

    try {
      await kbStore.update(collection.id, {
        name: result.name,
        description: result.description,
        docs: result.docs,
      });
      toast.success("知识集已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新知识集失败");
    }
  }

  async function handleDelete(
    collection: KbCollection,
    opts: { skipConfirm?: boolean } = {},
  ) {
    if (!opts.skipConfirm) {
      const confirmed = await confirmStore.request({
        title: "删除知识集",
        message: `删除「${collection.name}」后，其中的 ${collection.docs.length} 个文档将一并移除，AI 将不再引用这些内容。确定继续吗？`,
        variant: "question",
      });
      if (!confirmed) return;
    }

    try {
      await kbStore.remove(collection.id);
      toast.success("知识集已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除知识集失败");
    }
  }

  /**
   * 打开「推荐组织方式」弹窗。
   *
   * onClose 通过 dialogStore.close(id, data) 把选中的名称交回 safeShow，
   * 因此这里直接 await 返回值。空串 / null 视为用户关闭。
   */
  async function showGuide() {
    const pickedName = await dialogStore.safeShow(
      KbGuideDialog,
      {},
      { size: "xl6" },
    );
    if (!pickedName) return;

    const template = KB_TEMPLATES.find((t) => t.name === pickedName);
    if (!template) return;

    await openCreate({
      name: template.name,
      description: template.description,
    });
  }

  async function openDirectory() {
    try {
      await kbStore.openDirectory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "打开知识库目录失败");
    }
  }
</script>

<div class="h-full w-full overflow-y-auto bg-background">
  <div class="space-y-8 p-8 lg:p-12">
    <KbHeader
      {totalCount}
      {totalDocs}
      onCreate={() => void openCreate()}
      onShowGuide={() => void showGuide()}
      onOpenDirectory={() => void openDirectory()}
    />

    <Separator />

    {#if kbStore.error}
      <div
        class="flex animate-fade-in flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
      >
        <span class="min-w-0 wrap-break-word">{kbStore.error}</span>
        <Button
          variant="outline"
          size="sm"
          class="rounded-xl text-xs"
          onclick={() => void kbStore.load()}
        >
          重试
        </Button>
      </div>
    {/if}

    {#if kbStore.loading && collections.length === 0}
      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {#each Array(6) as _, index (index)}
          <Skeleton class="h-48 rounded-2xl" />
        {/each}
      </div>
    {:else if totalCount === 0}
      <KbEmptyState
        onAction={() => void openCreate()}
        onPick={(template) => void openCreate(template)}
      />
    {:else}
      <div
        class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        use:autoAnimate
      >
        {#each collections as collection (collection.id)}
          <KbCard
            {collection}
            onEdit={() => void openEdit(collection)}
            onDelete={() => void handleDelete(collection)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>
