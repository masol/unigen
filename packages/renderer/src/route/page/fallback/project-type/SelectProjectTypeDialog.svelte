<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Button } from "$lib/components/ui/button";
  import {
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Pagination from "$lib/components/ui/pagination";
  import { Separator } from "$lib/components/ui/separator";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import { PinyinFuseSearch } from "$lib/utils/fuse";
  import { IconMoodEmpty, IconSearch } from "@tabler/icons-svelte";
  import { debounce } from "radashi";
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import ProjectTypeCard from "./ProjectTypeCard.svelte";
  import { fetchInstalledProjectTypes } from "./service";
  import type { ProjectType } from "./types";
  import { BLANK_PROJECT_TYPE, BLANK_PROJECT_TYPE_ID } from "./types";

  const PAGE_SIZE = 6;
  const DUR = 180; // 交叉淡变时长

  type Props = {
    title?: string;
  } & DialogComponentProps<string>;

  let { title = "新建项目", onClose, onCancel }: Props = $props();

  let isLoading = $state(true);
  let installed = $state<ProjectType[]>([]);
  let selectedId = $state<string>(BLANK_PROJECT_TYPE_ID);
  let searchTerm = $state(""); // 输入框实时值
  let query = $state(""); // 防抖后用于过滤的值
  let currentPage = $state(1); // shadcn Pagination 从 1 开始

  // 搜索防抖 300ms：输入即时回显，过滤延迟触发，避免每次按键重算+重渲染
  const applySearch = debounce({ delay: 300 }, (v: string) => {
    query = v.trim();
    currentPage = 1; // 新搜索回到首页
  });

  /** 点击「管理项目类型」时触发 */
  function onManage() {}

  // 空白类型始终置顶，无条件存在
  const allTypes = $derived<ProjectType[]>([BLANK_PROJECT_TYPE, ...installed]);

  const searcher = $derived(
    new PinyinFuseSearch(
      allTypes.map((t) => ({ id: t.id, text: `${t.name} ${t.description}` })),
    ),
  );

  const filtered = $derived.by<ProjectType[]>(() => {
    if (!query) return allTypes;
    const ids = new Set(searcher.search(query) as Array<string | number>);
    return allTypes.filter((t) => ids.has(t.id));
  });

  const pageCount = $derived(
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  );
  const safePage = $derived(Math.min(currentPage, pageCount));
  const pageItems = $derived(
    filtered.slice(
      (safePage - 1) * PAGE_SIZE,
      (safePage - 1) * PAGE_SIZE + PAGE_SIZE,
    ),
  );

  // key 同时随「搜索内容」与「页码」变化 → 搜索/翻页都触发交叉淡变
  const viewKey = $derived(`${query}#${safePage}`);
  const canConfirm = $derived(selectedId.length > 0);
  // 当前选中的类型对象，用于标题栏展示；始终可见，不受翻页/搜索影响
  const selectedType = $derived(allTypes.find((t) => t.id === selectedId));

  async function load() {
    isLoading = true;
    try {
      installed = await fetchInstalledProjectTypes();
    } catch {
      installed = [];
    } finally {
      isLoading = false;
    }
  }

  function handleSelect(id: string) {
    selectedId = id;
  }

  function handleConfirm(id: string) {
    onClose(id);
  }

  onMount(load);
</script>

<DialogHeader>
  <div class="flex items-center gap-3">
    <DialogTitle class="shrink-0">{title}</DialogTitle>
    {#if selectedType}
      {#key selectedType.id}
        <span
          in:fade={{ duration: 150 }}
          class="flex min-w-0 items-center gap-1.5 rounded-lg border border-primary/20
                           bg-primary/5 py-1 pl-1.5 pr-2.5 text-sm"
        >
          <span
            class="flex size-5 shrink-0 items-center justify-center rounded-md
                               bg-primary text-primary-foreground"
          >
            <RuntimeIcon name={selectedType.icon} size={14} />
          </span>
          <span class="truncate font-medium text-foreground"
            >{selectedType.name}</span
          >
        </span>
      {/key}
    {/if}
  </div>
</DialogHeader>

<div class="space-y-4 py-4">
  <!-- 搜索框：占位符即引导，双击卡片直接创建 -->
  <div class="relative">
    <IconSearch
      class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      bind:value={searchTerm}
      oninput={() => applySearch(searchTerm)}
      placeholder="选择一个项目类型，或搜索…"
      class="rounded-xl pl-9"
      disabled={isLoading}
    />
  </div>

  <!-- 网格区：单元格叠层。新旧页占同一 grid cell，在流内交叉淡变；容器随内容撑高，绝不溢出压住分页器 -->
  <div class="grid min-h-80">
    {#if isLoading}
      <div class="col-start-1 row-start-1 grid grid-cols-3 content-start gap-4">
        {#each Array(PAGE_SIZE) as _, i (i)}
          <Skeleton class="h-40 rounded-2xl" />
        {/each}
      </div>
    {:else if pageItems.length === 0}
      <div
        class="col-start-1 row-start-1 flex flex-col items-center justify-center gap-2 text-center"
        in:fade={{ duration: DUR, easing: cubicInOut }}
      >
        <IconMoodEmpty class="size-8 text-muted-foreground" />
        <p class="text-sm text-foreground">没有匹配的项目类型</p>
        <p class="text-xs text-muted-foreground">换个关键词试试。</p>
      </div>
    {:else}
      {#key viewKey}
        <div
          class="col-start-1 row-start-1 grid grid-cols-3 content-start gap-4"
          in:fade={{ duration: DUR, easing: cubicInOut }}
          out:fade={{ duration: DUR, easing: cubicInOut }}
        >
          {#each pageItems as type (type.id)}
            <ProjectTypeCard
              {type}
              selected={selectedId === type.id}
              onSelect={handleSelect}
              onConfirm={handleConfirm}
            />
          {/each}
        </div>
      {/key}
    {/if}
  </div>

  <!-- 分页器：可直接跳页，仅多页时显示 -->
  {#if !isLoading && pageCount > 1}
    <Pagination.Root
      count={filtered.length}
      perPage={PAGE_SIZE}
      bind:page={currentPage}
    >
      {#snippet children({ pages, currentPage: cp })}
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.PrevButton class="rounded-xl" />
          </Pagination.Item>
          {#each pages as p (p.key)}
            {#if p.type === "ellipsis"}
              <Pagination.Item>
                <Pagination.Ellipsis />
              </Pagination.Item>
            {:else}
              <Pagination.Item>
                <Pagination.Link
                  page={p}
                  isActive={cp === p.value}
                  class="rounded-xl"
                >
                  {p.value}
                </Pagination.Link>
              </Pagination.Item>
            {/if}
          {/each}
          <Pagination.Item>
            <Pagination.NextButton class="rounded-xl" />
          </Pagination.Item>
        </Pagination.Content>
      {/snippet}
    </Pagination.Root>
  {/if}
</div>

<!-- 辅助信息：安静地存在，不抢焦点 -->
<Separator />
<div class="flex items-center justify-between pt-3">
  <p class="text-xs text-muted-foreground">
    本机已安装的项目类型。可在
    <button
      type="button"
      onclick={() => onManage?.()}
      class="rounded-lg text-primary underline-offset-2 transition-all duration-200
                   hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      设置 · 项目类型
    </button>
    中安装更多。
  </p>
  <!-- {#if !isLoading}
    <button
      type="button"
      onclick={load}
      class="flex shrink-0 items-center gap-1.5 rounded-lg text-xs text-muted-foreground
                   transition-all duration-200 hover:text-foreground
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconRefresh class="size-3.5" />
      刷新
    </button>
  {/if} -->
</div>

<DialogFooter class="mt-4">
  <Button variant="outline" onclick={() => onCancel()}>取消</Button>
  <Button disabled={!canConfirm} onclick={() => onClose(selectedId)}
    >创建项目</Button
  >
</DialogFooter>
