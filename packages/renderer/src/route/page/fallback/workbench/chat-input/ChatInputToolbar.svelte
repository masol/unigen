<!-- 输入栏底部按钮组 · 附件 / 指定工具 / 指定技能 / 语音 / 命令 · 与 ChatInput 解耦 -->
<script lang="ts">
  import {
    IconMicrophone,
    IconPaperclip,
    IconSlash,
    IconSparkles,
    IconTool,
  } from "@tabler/icons-svelte";
  import ChatPickerButton from "./ChatPickerButton.svelte";

  let {
    filesCount = 0,
    toolsCount = 0,
    skillsCount = 0,
    openMenu = null,
    disabled = false,
    commandsDisabled = false,
    commandsTitle = "命令",
    onAttachClick = () => {},
    onToolsClick = () => {},
    onSkillsClick = () => {},
    onRecordClick = () => {},
    onCommandsClick = () => {},
  }: {
    filesCount?: number;
    toolsCount?: number;
    skillsCount?: number;
    openMenu?: string | null;
    disabled?: boolean;
    commandsDisabled?: boolean;
    commandsTitle?: string;
    onAttachClick?: () => void;
    onToolsClick?: () => void;
    onSkillsClick?: () => void;
    onRecordClick?: () => void;
    onCommandsClick?: () => void;
  } = $props();
</script>

<div class="flex items-center gap-0.5">
  <ChatPickerButton
    kind="attachments"
    count={filesCount}
    open={openMenu === "attachments"}
    {disabled}
    hasPopup={filesCount > 0}
    onTrigger={onAttachClick}
    label="附件"
  >
    {#snippet icon()}
      <IconPaperclip
        size={18}
        stroke={1.5}
        class="transition-transform duration-200 group-active:scale-110"
      />
    {/snippet}
  </ChatPickerButton>

  <button
    type="button"
    onclick={onRecordClick}
    {disabled}
    title="语音输入"
    aria-label="语音输入"
    class="group flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 disabled:cursor-not-allowed disabled:hover:bg-transparent"
  >
    <IconMicrophone
      size={18}
      stroke={1.5}
      class="transition-transform duration-200 group-active:scale-110"
    />
  </button>
  <button
    type="button"
    onclick={onCommandsClick}
    disabled={commandsDisabled}
    title={commandsTitle}
    aria-label={commandsTitle}
    class="group flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 disabled:cursor-not-allowed disabled:hover:bg-transparent"
  >
    <IconSlash
      size={18}
      stroke={1.5}
      class="transition-transform duration-200 group-active:scale-110"
    />
  </button>

  <ChatPickerButton
    kind="tools"
    count={toolsCount}
    open={openMenu === "tools"}
    {disabled}
    onTrigger={onToolsClick}
    label="指定工具"
  >
    {#snippet icon()}
      <IconTool
        size={18}
        stroke={1.5}
        class="transition-transform duration-200 group-active:scale-110"
      />
    {/snippet}
  </ChatPickerButton>

  <ChatPickerButton
    kind="skills"
    count={skillsCount}
    open={openMenu === "skills"}
    {disabled}
    onTrigger={onSkillsClick}
    label="指定技能"
  >
    {#snippet icon()}
      <IconSparkles
        size={18}
        stroke={1.5}
        class="transition-transform duration-200 group-active:scale-110"
      />
    {/snippet}
  </ChatPickerButton>
</div>
