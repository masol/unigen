<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { pacStore } from "$lib/store/ui/pac.svelte";
  import type { PacFrontMatter, PacToolConfig } from "@app/main/types";
  import { onMount } from "svelte";
  import {
    buildArrayPatch,
    buildStringArrayPatch,
    readStringArray,
    type PacMetaDialogCommonProps,
  } from "../pac-meta-dialog-utils";
  import {
    createAgentsSource,
    createSkillsSource,
    createToolsSource,
    normalizeAgentPath,
    type PickerItem,
    type PickerSource,
  } from "./pac-meta-tools-store.svelte";
  import PacMetaPickerPanel from "./PacMetaPickerPanel.svelte";

  let { value, onClose, onCancel }: PacMetaDialogCommonProps = $props();

  type TabId = "agents" | "tools" | "skills";

  // svelte-ignore state_referenced_locally
  const initialTools: PacToolConfig[] = Array.isArray(value.tools)
    ? [...value.tools]
    : [];

  // svelte-ignore state_referenced_locally
  const initialSkills = readStringArray(value, "skills");

  const initialBuiltinToolIds = initialTools
    .filter(
      (tool): tool is Extract<PacToolConfig, { type: "builtin" }> =>
        tool.type === "builtin",
    )
    .map((tool) => tool.id);

  const currentPath = pacStore.doc?.path ?? "";
  const initialAgentPaths = initialTools
    .filter(
      (tool): tool is Extract<PacToolConfig, { type: "agent" }> =>
        tool.type === "agent",
    )
    .map((tool) => normalizeAgentPath(currentPath, tool.path));

  let selectedSkills = $state<string[]>([...initialSkills]);
  let selectedBuiltinToolIds = $state<string[]>([...initialBuiltinToolIds]);
  let selectedAgentPaths = $state<string[]>([...initialAgentPaths]);

  const agentsSource = createAgentsSource(currentPath);
  const toolsSource = createToolsSource();
  const skillsSource = createSkillsSource();

  const sourceByTab: Record<TabId, PickerSource> = {
    agents: agentsSource,
    tools: toolsSource,
    skills: skillsSource,
  };

  let activeTab = $state<TabId>("agents");

  let builtinTools = $derived.by<PickerItem[]>(() => {
    return (messageStore.builtinTools ?? []).map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
    }));
  });

  let totalCount = $derived(
    selectedAgentPaths.length +
      selectedBuiltinToolIds.length +
      selectedSkills.length,
  );

  let agentsCount = $derived(selectedAgentPaths.length);
  let toolsCount = $derived(selectedBuiltinToolIds.length);
  let skillsCount = $derived(selectedSkills.length);

  let hasChanges = $derived(
    JSON.stringify(selectedSkills.slice().sort()) !==
      JSON.stringify(initialSkills.slice().sort()) ||
      JSON.stringify(selectedBuiltinToolIds.slice().sort()) !==
        JSON.stringify(initialBuiltinToolIds.slice().sort()) ||
      JSON.stringify(selectedAgentPaths.slice().sort()) !==
        JSON.stringify(initialAgentPaths.slice().sort()),
  );

  function ensureLoaded(tab: TabId): void {
    const source = sourceByTab[tab];
    if (source.loadedOnce || source.loading) return;
    void source.reload();
  }

  function handleTabChange(next: string): void {
    const tab = next as TabId;
    if (tab === activeTab) return;
    activeTab = tab;
    ensureLoaded(tab);
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function toggleAgent(path: string): void {
    selectedAgentPaths = toggle(selectedAgentPaths, path);
  }

  function toggleBuiltinTool(id: string): void {
    selectedBuiltinToolIds = toggle(selectedBuiltinToolIds, id);
  }

  function toggleSkill(id: string): void {
    selectedSkills = toggle(selectedSkills, id);
  }

  function buildTools(): PacToolConfig[] {
    const result: PacToolConfig[] = [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const usedBuiltin = new Set<string>();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const usedAgent = new Set<string>();

    for (const tool of initialTools) {
      if (tool.type === "builtin") {
        if (
          selectedBuiltinToolIds.includes(tool.id) &&
          !usedBuiltin.has(tool.id)
        ) {
          usedBuiltin.add(tool.id);
          result.push(tool);
        }
      } else if (tool.type === "agent") {
        const path = normalizeAgentPath(currentPath, tool.path);
        if (selectedAgentPaths.includes(path) && !usedAgent.has(path)) {
          usedAgent.add(path);
          result.push({ ...tool, path });
        }
      } else {
        result.push(tool);
      }
    }

    for (const id of selectedBuiltinToolIds) {
      if (!usedBuiltin.has(id)) {
        usedBuiltin.add(id);
        result.push({ type: "builtin", id });
      }
    }

    for (const path of selectedAgentPaths) {
      if (!usedAgent.has(path)) {
        usedAgent.add(path);
        result.push({ type: "agent", path });
      }
    }

    return result;
  }

  function save(): void {
    const tools = buildTools();

    const patch: Partial<PacFrontMatter> = {
      skills: buildStringArrayPatch(value.skills, selectedSkills),
      tools: buildArrayPatch(value.tools, tools) as PacToolConfig[] | undefined,
    };

    onClose?.(patch);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      onCancel?.();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && hasChanges) {
      save();
    }
  }

  onMount(() => {
    ensureLoaded(activeTab);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      for (const source of Object.values(sourceByTab)) source.dispose();
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

{#snippet badge(count: number)}
  {#if count > 0}
    <span
      class="ml-1.5 inline-flex items-center justify-center rounded-md bg-primary/10 px-1.5 py-px text-[10px] font-medium tabular-nums text-primary"
    >
      {count}
    </span>
  {/if}
{/snippet}

<div class="space-y-5 p-6">
  <header class="space-y-1.5">
    <div class="flex items-center gap-2">
      <h2 class="text-lg font-medium">AI装备栏</h2>
      {#if totalCount > 0}
        <span
          class="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-medium tabular-nums text-primary"
        >
          已选 {totalCount}
        </span>
      {/if}
    </div>
    <p class="text-sm text-muted-foreground leading-relaxed">
      勾选 Agent 可用的技能、工具、子 Agent。其他类型的工具声明（如 search /
      mcp_local）会原样保留。
    </p>
  </header>

  <div class="min-h-105">
    <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
      <Tabs.List class="grid w-full grid-cols-3">
        <Tabs.Trigger value="agents">
          Agent{@render badge(agentsCount)}
        </Tabs.Trigger>
        <Tabs.Trigger value="tools">
          工具{@render badge(toolsCount)}
        </Tabs.Trigger>
        <Tabs.Trigger value="skills">
          技能{@render badge(skillsCount)}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="agents" class="mt-4 animate-fade-in">
        <PacMetaPickerPanel
          source={agentsSource}
          selectedIds={selectedAgentPaths}
          toggleFn={toggleAgent}
          placeholder="筛选 Agent…"
          emptyLabel="没有找到可用的 Agent 文件。"
        />
      </Tabs.Content>

      <Tabs.Content value="tools" class="mt-4 animate-fade-in">
        <PacMetaPickerPanel
          source={toolsSource}
          selectedIds={selectedBuiltinToolIds}
          builtinItems={builtinTools}
          toggleFn={toggleBuiltinTool}
          placeholder="筛选工具…"
          emptyLabel="没有匹配的工具,试试调整筛选词。"
        />
      </Tabs.Content>

      <Tabs.Content value="skills" class="mt-4 animate-fade-in">
        <PacMetaPickerPanel
          source={skillsSource}
          selectedIds={selectedSkills}
          toggleFn={toggleSkill}
          placeholder="筛选技能…"
          emptyLabel="没有匹配的技能,试试调整筛选词。"
        />
      </Tabs.Content>
    </Tabs.Root>
  </div>

  <div class="flex justify-end gap-3 pt-1">
    <Button variant="outline" class="rounded-xl" onclick={() => onCancel?.()}>
      取消
    </Button>
    <Button class="rounded-xl" disabled={!hasChanges} onclick={save}
      >保存</Button
    >
  </div>
</div>
