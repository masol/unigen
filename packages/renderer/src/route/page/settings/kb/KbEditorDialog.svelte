<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import {
    IconAlertTriangle,
    IconCheck,
    IconLoader2,
    IconPlus,
    IconTrash,
  } from "@tabler/icons-svelte";
  import KbDocumentList from "./KbDocumentList.svelte";
  import type { KbCollection, KbDoc, KbEditorResult } from "./kbTypes";

  type Props = {
    /** 传入时为「编辑已有知识集」，为空时为「新建」。 */
    collection?: KbCollection | null;
    /** 新建时的预填内容（来自范例卡），编辑态忽略。 */
    initial?: { name?: string; description?: string } | null;
    /** 由主组件注入：弹系统文件选择并返回文档元数据。 */
    onPickDocuments: () => Promise<KbDoc[]>;
    /**
     * 由 DialogHost 注入，负责关闭对话框并把 payload 交回 safeShow。
     * 声明为可选：safeShow(Component, props) 推断的 P 不含 onClose，
     * 若声明为必需会导致 P 无法赋值给 Props。
     */
    onClose?: (result: KbEditorResult) => void;
    /** 由 DialogHost 注入，处理 Esc / 遮罩等取消路径。 */
    onCancel?: (reason: unknown) => void;
  } & DialogComponentProps<KbEditorResult>;

  let {
    collection = null,
    initial = null,
    onPickDocuments,
    onClose,
  }: Props = $props();

  /** 编辑模式由 collection 是否存在决定，无需额外 mode 字段。 */
  const isEdit = $derived(collection !== null && collection !== undefined);

  let name = $state(collection?.name ?? initial?.name ?? "");
  let description = $state(
    collection?.description ?? initial?.description ?? "",
  );
  let docs = $state<KbDoc[]>(collection?.docs ? [...collection.docs] : []);
  let picking = $state(false);

  /** 编辑态清空全部文档 → 保存即删除此知识集（文档是其存在前提）。 */
  const willDelete = $derived(isEdit && docs.length === 0);
  const canSave = $derived(name.trim().length > 0 && docs.length > 0);

  async function handleAdd() {
    if (picking) return;
    picking = true;
    try {
      const picked = await onPickDocuments();
      if (picked.length > 0) docs = [...docs, ...picked];
    } finally {
      picking = false;
    }
  }

  function handleRemove(id: string) {
    docs = docs.filter((d) => d.id !== id);
  }

  function handleSave() {
    if (willDelete) {
      onClose?.({ action: "delete" });
      return;
    }
    if (!canSave) return;
    onClose?.({
      action: "save",
      name: name.trim(),
      description: description.trim(),
      docs,
    });
  }
</script>

<div class="space-y-6 p-6">
  <div class="space-y-1">
    <h2 class="text-lg font-medium">
      {isEdit ? "编辑知识集" : "新建知识集"}
    </h2>
    <p class="text-xs text-muted-foreground">
      {isEdit
        ? "修改名称、简介或文档。清空全部文档后，此知识集将随之删除。"
        : "给知识集起个名字，再把相关资料添加进来。"}
    </p>
  </div>

  <div class="space-y-4">
    <div class="space-y-2">
      <label for="kb-name" class="text-sm font-medium">名称</label>
      <Input
        id="kb-name"
        bind:value={name}
        placeholder="例如：员工手册、我的简历、写作偏好"
        class="rounded-xl"
        maxlength={40}
      />
    </div>

    <div class="space-y-2">
      <label for="kb-desc" class="text-sm font-medium">简介</label>
      <Textarea
        id="kb-desc"
        bind:value={description}
        placeholder="写清：里面放了哪些资料、什么问题上该用它、常用术语有哪些"
        class="min-h-28 rounded-xl"
        maxlength={400}
      />
      <p class="text-xs text-muted-foreground">
        这段说明会参与检索。写清资料内容和适用场景，AI 才能在对的问题上找到它。
      </p>
    </div>
  </div>

  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">文档</span>
        <Badge variant="secondary" class="rounded-lg text-xs">
          {docs.length}
        </Badge>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="gap-1.5 rounded-xl text-xs"
        disabled={picking}
        aria-busy={picking}
        onclick={() => void handleAdd()}
      >
        {#if picking}
          <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
          添加中
        {:else}
          <IconPlus size={14} stroke={1.5} />
          添加文档
        {/if}
      </Button>
    </div>

    <KbDocumentList {docs} onRemove={handleRemove} />

    {#if willDelete}
      <div
        class="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
      >
        <IconAlertTriangle size={14} stroke={1.5} class="mt-0.5 shrink-0" />
        <span>
          文档已全部移除。点击下方红色按钮将删除此知识集，此操作不可恢复，AI
          也不再引用其中内容。
        </span>
      </div>
    {/if}
  </div>

  <div class="flex justify-end gap-3 pt-2">
    <Button
      variant="outline"
      class="rounded-xl"
      onclick={() => onClose?.({ action: "cancel" })}
    >
      取消
    </Button>

    {#if willDelete}
      <Button
        variant="destructive"
        class="gap-1.5 rounded-xl"
        onclick={handleSave}
      >
        <IconTrash size={14} stroke={1.5} />
        删除知识集
      </Button>
    {:else}
      <Button
        class="gap-1.5 rounded-xl"
        disabled={!canSave}
        onclick={handleSave}
      >
        <IconCheck size={14} stroke={1.5} />
        保存
      </Button>
    {/if}
  </div>
</div>
