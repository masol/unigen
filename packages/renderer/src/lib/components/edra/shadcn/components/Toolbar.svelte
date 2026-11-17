<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { cn } from "$lib/utils/index.js";
  import { WandSparkles } from "@lucide/svelte";
  import {
    IconChevronDown,
    IconDeviceFloppy,
    IconLoader2,
  } from "@tabler/icons-svelte";
  import { commands, type EdraCommand } from "../../commands/index.js";
  import {
    addAIHighlight,
    getEditor,
    useEditorTransaction,
  } from "../../tiptap/index.js";
  import { ISMAC } from "../../utils.js";
  import Tooltip from "./Tooltip.svelte";

  type ToolbarMetaMenuItem = {
    label: string;
    icon: typeof IconChevronDown;
    /** 数字 1-5，对应 Alt+1 … Alt+5。 */
    hotKey?: number;
    onSelect: () => void;
  };

  type ToolbarMetaMenu = {
    id: string;
    label: string;
    /**
     * 使用 Tabler 图标 class 的构造签名作为类型来源（本文件已导入
     * IconChevronDown）。EdraCommand["icon"] 是 Lucide 的
     * `Component<LucideProps>` 函数签名，无法与 Tabler 的 class 组件互赋。
     */
    icon: typeof IconChevronDown;
    /** 数字 1-5，对应 Alt+1 … Alt+5。 */
    hotKey?: number;
    /**
     * 下拉菜单项：非空时渲染为下拉菜单。
     * 为空或未提供时，若存在 `onSelect` 则渲染为普通按钮。
     */
    items?: ToolbarMetaMenuItem[];
    /** 无 items 时点击按钮直接触发的回调。 */
    onSelect?: () => void;
  };

  interface Props {
    class?: string;
    onSave?: () => void;
    canSave?: boolean;
    saving?: boolean;
    metaMenus?: ToolbarMetaMenu[];
  }

  const {
    class: className,
    onSave,
    canSave = false,
    saving = false,
    metaMenus = [],
  }: Props = $props();

  const editor = getEditor();
  const transaction = useEditorTransaction(editor);

  const EXPANDED_GROUP = "undo-redo";

  const groupTitles: Record<string, string> = {
    headings: "标题",
    "text-formatting": "文本格式",
    alignment: "对齐方式",
    lists: "列表",
    table: "表格",
    math: "数学公式",
  };

  const undoRedoGroup: EdraCommand[] = commands[EXPANDED_GROUP] ?? [];
  const restEntries = Object.entries(commands).filter(
    ([key]) => key !== EXPANDED_GROUP,
  );

  const saveShortCut = `${ISMAC ? "⌘" : "Ctrl+"}S`;

  function formatHotKey(hotKey?: number): string {
    if (!hotKey) return "";
    return ISMAC ? `⌥${hotKey}` : `Alt+${hotKey}`;
  }

  function useAI() {
    void transaction.version;
    return editor.extensionManager.extensions.some(
      (e) => e.name === "ai-highlight" && e.options?.callAI != null,
    );
  }

  function isActive(command: EdraCommand): boolean {
    void transaction.version;
    return command.isActive?.(editor) ?? false;
  }

  function isClickable(command: EdraCommand): boolean {
    void transaction.version;
    return command.clickable?.(editor) ?? true;
  }

  function runCommand(command: EdraCommand) {
    command.onClick?.(editor);
  }
</script>

{#snippet groupTriggerButton(
  triggerProps: Record<string, unknown>,
  GroupIcon: EdraCommand["icon"],
  active: boolean,
  disabled: boolean,
)}
  <Button
    {...triggerProps}
    variant="ghost"
    size="icon"
    {disabled}
    class={cn(
      "relative",
      active && !disabled && "bg-muted text-primary",
      disabled && "opacity-40",
    )}
  >
    <GroupIcon />
    <span
      class="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-background"
    >
      <IconChevronDown size={10} stroke={2.5} class="text-foreground/70" />
    </span>
  </Button>
{/snippet}

<div class={cn("flex h-full w-fit items-center gap-2", className)}>
  {#each undoRedoGroup as command (command.name)}
    {@const Icon = command.icon}
    <Tooltip tooltip={command.tooltip} shortCut={command.shortCut ?? ""}>
      <Button
        variant="ghost"
        size="icon"
        class={cn(
          "disabled:opacity-40",
          isActive(command) && "bg-muted text-primary",
        )}
        disabled={!isClickable(command)}
        onclick={() => runCommand(command)}
      >
        <Icon />
      </Button>
    </Tooltip>
  {/each}

  {#if onSave}
    <Tooltip tooltip="保存" shortCut={saveShortCut}>
      <Button
        variant="ghost"
        size="icon"
        class={cn(
          "text-muted-foreground disabled:opacity-40",
          canSave && "text-primary",
        )}
        disabled={!canSave || saving}
        onclick={() => onSave?.()}
      >
        {#if saving}
          <IconLoader2 size={20} stroke={1.5} class="animate-spin" />
        {:else}
          <IconDeviceFloppy size={20} stroke={1.5} />
        {/if}
      </Button>
    </Tooltip>
  {/if}

  <Separator orientation="vertical" class="h-6!" />

  {#if useAI()}
    <Tooltip tooltip="Use AI">
      <Button
        onmousedown={(e) => {
          e.preventDefault();
          addAIHighlight(editor);
        }}
        variant="ghost"
        size="icon"
      >
        <WandSparkles />
      </Button>
    </Tooltip>
  {/if}

  {#each restEntries as [key, group] (key)}
    {#if group.length === 1}
      {@const command = group[0]}
      {@const Icon = command.icon}
      <Tooltip tooltip={command.tooltip} shortCut={command.shortCut ?? ""}>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={isActive(command)}
          class={cn(
            "disabled:opacity-40",
            isActive(command) && "bg-muted text-primary",
          )}
          disabled={!isClickable(command)}
          onclick={() => runCommand(command)}
        >
          <Icon />
        </Button>
      </Tooltip>
    {:else if group.length > 1}
      {@const GroupIcon = group[0].icon}
      {@const groupActive = group.some((c) => isActive(c))}
      {@const groupDisabled = group.every((c) => !isClickable(c))}
      {@const groupTitle = groupTitles[key]}
      <DropdownMenu.Root>
        {#if groupTitle}
          <Tooltip tooltip={groupTitle}>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                {@render groupTriggerButton(
                  props,
                  GroupIcon,
                  groupActive,
                  groupDisabled,
                )}
              {/snippet}
            </DropdownMenu.Trigger>
          </Tooltip>
        {:else}
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              {@render groupTriggerButton(
                props,
                GroupIcon,
                groupActive,
                groupDisabled,
              )}
            {/snippet}
          </DropdownMenu.Trigger>
        {/if}
        <DropdownMenu.Content align="start" class="w-56">
          {#each group as command (command.name)}
            {@const Icon = command.icon}
            <DropdownMenu.Item
              disabled={!isClickable(command)}
              class={cn(isActive(command) && "bg-muted text-primary")}
              onSelect={() => runCommand(command)}
            >
              <Icon size={16} />
              <span>{command.tooltip}</span>
              {#if command.shortCut}
                <DropdownMenu.Shortcut>
                  {command.shortCut}
                </DropdownMenu.Shortcut>
              {/if}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  {/each}

  {#if metaMenus.length > 0}
    <Separator orientation="vertical" class="h-6!" />

    {#each metaMenus as menu (menu.id)}
      {@const MenuIcon = menu.icon}
      {#if menu.items && menu.items.length > 0}
        <DropdownMenu.Root>
          <Tooltip tooltip={menu.label} shortCut={formatHotKey(menu.hotKey)}>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="relative"
                  aria-label={menu.label}
                >
                  <MenuIcon />
                  <span
                    class="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-background"
                  >
                    <IconChevronDown
                      size={10}
                      stroke={2.5}
                      class="text-foreground/70"
                    />
                  </span>
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
          </Tooltip>

          <DropdownMenu.Content align="end" class="w-56">
            {#each menu.items as item (item.label)}
              {@const ItemIcon = item.icon}
              <DropdownMenu.Item onSelect={item.onSelect}>
                <ItemIcon size={16} />
                <span>{item.label}</span>
                {#if item.hotKey}
                  <DropdownMenu.Shortcut>
                    {formatHotKey(item.hotKey)}
                  </DropdownMenu.Shortcut>
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else if menu.onSelect}
        <Tooltip tooltip={menu.label} shortCut={formatHotKey(menu.hotKey)}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={menu.label}
            onclick={() => menu.onSelect?.()}
          >
            <MenuIcon />
          </Button>
        </Tooltip>
      {/if}
    {/each}
  {/if}
</div>
