<script lang="ts">
  import { buttonVariants } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import strings from "../../../strings.js";
  import { getEditor, useEditorTransaction } from "../../../tiptap/index.js";
  import Tooltip from "../Tooltip.svelte";

  const editor = getEditor();
  const transaction = useEditorTransaction(editor);

  const currentSize = () => {
    void transaction.version;
    return editor.getAttributes("textStyle").fontSize || "";
  };

  const FONT_SIZE = [
    { label: strings.toolbar.font.tiny, value: "0.7rem" },
    { label: strings.toolbar.font.smaller, value: "0.75rem" },
    { label: strings.toolbar.font.small, value: "0.9rem" },
    { label: strings.toolbar.font.default, value: "" },
    { label: strings.toolbar.font.large, value: "1.25rem" },
    { label: strings.toolbar.font.extraLarge, value: "1.5rem" },
  ];

  const currentLabel = $derived.by(() => {
    const l = FONT_SIZE.find((f) => f.value === currentSize());
    if (l) return l.label.split(" ")[0];
    return strings.toolbar.font.default;
  });
</script>

<DropdownMenu.Root>
  <Tooltip tooltip={strings.toolbar.font.buttonTitle}>
    <DropdownMenu.Trigger
      class={buttonVariants({
        variant: "ghost",
      })}
    >
      <span>{currentLabel}</span>
      <ChevronDown class="size-2! text-muted-foreground" />
    </DropdownMenu.Trigger>
  </Tooltip>
  <DropdownMenu.Content class="z-110 w-fit" portalProps={{ to: document.body }}>
    <DropdownMenu.Label>{strings.toolbar.font.dropdownTitle}</DropdownMenu.Label
    >
    {#each FONT_SIZE as fontSize (fontSize)}
      <DropdownMenu.Item
        onclick={() => {
          editor.chain().focus().setFontSize(fontSize.value).run();
        }}
        >{fontSize.label}
        <DropdownMenu.Shortcut>
          {fontSize.value}
        </DropdownMenu.Shortcut>
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
