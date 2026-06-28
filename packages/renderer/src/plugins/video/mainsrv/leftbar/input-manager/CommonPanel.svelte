<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ GlobalRequirements.svelte                          │ -->
<!-- │ 职责：全局要求区域 — 项目基础信息的静态编辑表单       │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import * as Accordion from "$lib/components/ui/accordion";
  import {
    IconFileText,
    IconPencil,
    IconLoader2,
    IconAlertTriangle,
  } from "@tabler/icons-svelte";
  import { inputStore } from "./input.svelte";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import ScriptSegmentDialog from "./ScriptSegmentDialog.svelte";
  import { DbKeys } from "../../../dbkeys";

  let accordionValue = $state("");

  let loading = $derived(inputStore.isLoading);
  let error = $derived(inputStore.error);

  let isEditingName = $state(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nameInputRef: any = null;
  let tempName = $state(inputStore.bookName);

  function startEditName() {
    if (loading) return;
    tempName = inputStore.bookName;
    isEditingName = true;
    setTimeout(() => {
      nameInputRef?.focus();
      nameInputRef?.select();
    }, 0);
  }

  async function saveName() {
    if (loading) return;
    const trimmed = tempName.trim();
    if (trimmed && trimmed !== inputStore.bookName) {
      await inputStore.setCommon(DbKeys.book_name, tempName.trim());
    }
    isEditingName = false;
  }

  function cancelEditName() {
    tempName = inputStore.bookName;
    isEditingName = false;
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveName();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditName();
    }
  }

  async function handleEditSynopsis() {
    if (loading) return;

    const content = await dialogStore.safeShow(
      ScriptSegmentDialog,
      {
        title: "编辑简介",
        description: "简要描述项目的核心内容、主题或风格定位。",
        initialText: inputStore.synopsis,
      },
      {
        size: "xl",
      },
    );
    if (content === null) return;

    await inputStore.setCommon(DbKeys.synopsis, content);
  }

  async function handleEditCharSpec() {
    if (loading) return;

    const content = await dialogStore.safeShow(
      ScriptSegmentDialog,
      {
        title: "编辑人物要求",
        description: "定义主要角色的性格、背景、关系等设定。",
        placeholder:
          "依次写出要求角色的人设要求。除了主角，其它建议在素材表中填写。",
        initialText: inputStore.charSpec,
      },
      {
        size: "xl",
      },
    );
    if (content === null) return;

    await inputStore.setCommon(DbKeys.character_specifications, content);
  }

  async function handleEditRequirements() {
    if (loading) return;

    const content = await dialogStore.safeShow(
      ScriptSegmentDialog,
      {
        title: "编辑其它要求",
        description: "补充任何特殊的叙事手法、情节约束或创作偏好。",
        placeholder: "当前版本尚未支持。仅提供了保存。",
        initialText: inputStore.requirements,
      },
      {
        size: "xl",
      },
    );
    if (content === null) return;

    await inputStore.setCommon(DbKeys.requirements, content);
  }
</script>

<Accordion.Root type="single" bind:value={accordionValue} class="w-full">
  <Accordion.Item
    value="global-requirements"
    class="rounded-2xl border border-border/50 bg-card"
  >
    <Accordion.Trigger
      class="rounded-2xl px-6 py-4 hover:no-underline hover:bg-muted/40 transition-all duration-200"
    >
      <div class="flex w-full items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconFileText size={18} stroke={1.5} />
        </div>
        <h3 class="text-base font-medium tracking-tight">全局要求</h3>

        {#if loading}
          <IconLoader2
            size={16}
            stroke={1.5}
            class="ml-2 animate-spin text-muted-foreground"
          />
        {/if}

        <Badge
          variant="secondary"
          class="ml-auto rounded-lg px-2 py-0.5 text-xs"
        >
          4 项
        </Badge>
      </div>
    </Accordion.Trigger>

    <Accordion.Content class="px-3 pb-4">
      <div class="space-y-3">
        {#if error}
          <div
            class="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-fade-in"
            role="alert"
          >
            <IconAlertTriangle size={16} stroke={1.5} class="mt-0.5 shrink-0" />
            <span class="whitespace-pre-wrap wrap-break-word">{error}</span>
          </div>
        {/if}

        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ 职责：名称字段 — 就地编辑的单行文本框                 │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <div
          class="group relative rounded-xl border border-border/50 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md"
        >
          {#if isEditingName}
            <div class="flex items-center gap-2 animate-fade-in">
              <Input
                id="project-name"
                bind:this={nameInputRef}
                bind:value={tempName}
                class="rounded-lg flex-1 h-8 text-sm"
                placeholder="输入项目名称"
                onblur={saveName}
                onkeydown={handleNameKeydown}
                disabled={loading}
              />
              <Button
                size="sm"
                variant="ghost"
                class="h-7 rounded-lg px-2 text-xs"
                onclick={cancelEditName}
                disabled={loading}
              >
                取消
              </Button>
            </div>
          {:else}
            <div class="flex items-center justify-between gap-3">
              <div class="flex-1 min-w-0">
                <label
                  for="project-name"
                  class="block text-xs text-muted-foreground mb-1"
                >
                  项目名称
                </label>
                <button
                  class="text-sm font-medium text-foreground hover:text-primary transition-colors duration-200 text-left truncate w-full"
                  onclick={startEditName}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      startEditName();
                    }
                  }}
                >
                  {inputStore.bookName || "未命名项目"}
                </button>
              </div>
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7 rounded-lg shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                onclick={startEditName}
                disabled={loading}
                aria-label="编辑项目名称"
              >
                <IconPencil size={14} stroke={1.5} />
              </Button>
            </div>
          {/if}
        </div>
        <!-- ╭─── / NameField ───╮ -->

        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ 职责：简介字段 — 点击打开对话框编辑多行文本           │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <button
          class="group w-full text-left rounded-xl border border-border/50 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border"
          onclick={handleEditSynopsis}
          disabled={loading}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-xs text-muted-foreground mb-1.5">简介</div>
              {#if inputStore.synopsis}
                <p
                  class="text-sm text-foreground/80 leading-relaxed line-clamp-2"
                >
                  {inputStore.synopsis}
                </p>
              {:else}
                <p class="text-sm text-muted-foreground/60 italic">
                  点击添加简介
                </p>
              {/if}
            </div>
            <IconPencil
              size={14}
              stroke={1.5}
              class="shrink-0 mt-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
          </div>
        </button>
        <!-- ╭─── / SynopsisField ───╮ -->

        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ 职责：人物要求字段 — 点击打开对话框编辑多行文本       │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <button
          class="group w-full text-left rounded-xl border border-border/50 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border"
          onclick={handleEditCharSpec}
          disabled={loading}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-xs text-muted-foreground mb-1.5">人物要求</div>
              {#if inputStore.charSpec}
                <p
                  class="text-sm text-foreground/80 leading-relaxed line-clamp-2"
                >
                  {inputStore.charSpec}
                </p>
              {:else}
                <p class="text-sm text-muted-foreground/60 italic">
                  点击添加人物要求
                </p>
              {/if}
            </div>
            <IconPencil
              size={14}
              stroke={1.5}
              class="shrink-0 mt-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
          </div>
        </button>
        <!-- ╭─── / CharSpecField ───╮ -->

        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ 职责：其它要求字段 — 点击打开对话框编辑多行文本       │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <button
          class="group w-full text-left rounded-xl border border-border/50 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border"
          onclick={handleEditRequirements}
          disabled={loading}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-xs text-muted-foreground mb-1.5">
                其它要求
                <span class="text-muted-foreground/50">（未实现）</span>
              </div>
              {#if inputStore.requirements}
                <p
                  class="text-sm text-foreground/80 leading-relaxed line-clamp-2"
                >
                  {inputStore.requirements}
                </p>
              {:else}
                <p class="text-sm text-muted-foreground/60 italic">
                  点击添加其它要求
                </p>
              {/if}
            </div>
            <IconPencil
              size={14}
              stroke={1.5}
              class="shrink-0 mt-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
          </div>
        </button>
        <!-- ╭─── / RequirementsField ───╮ -->
      </div>
    </Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
