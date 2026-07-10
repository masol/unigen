<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as NumberField from "$lib/components/ui/number-field";
  import { Switch } from "$lib/components/ui/switch";
  import { configStore } from "$lib/store/config.svelte";
  import { safeApi } from "$lib/utils/api";
  import { IconCode } from "@tabler/icons-svelte";
  import { debounce } from "radashi";
  import { toast } from "svelte-sonner";
  import SettingRow from "./SettingRow.svelte";
  import SettingsSection from "./SettingsSection.svelte";

  const THEME_REFERENCE_URL =
    "https://textmate-grammars-themes.netlify.app/?theme=github-dark-default&grammar=javascript";

  // 文件选择框引用
  let fileInput = $state<HTMLInputElement>();

  //╭─────────────────────────────────────────────────────────╮
  //│ 防抖提交逻辑（500ms）                                       │
  //│ 连续变动重置计时器，只保留最后一次值，静默满 500ms 才落库。│
  //╰─────────────────────────────────────────────────────────╯

  // 本地镜像值：负责即时 UI 反馈
  let fontSizeLocal = $state(configStore.fontSize);
  let lineHeightLocal = $state(configStore.lineHeight);

  // 记录最近一次挂起值，供 flush 使用
  let pendingFontSize = configStore.fontSize;
  let pendingLineHeight = configStore.lineHeight;

  const commitFontSize = debounce({ delay: 500 }, (v: number) => {
    configStore.setConfig("fontSize", v);
  });
  const commitLineHeight = debounce({ delay: 500 }, (v: number) => {
    configStore.setConfig("lineHeight", v);
  });

  function onFontSizeChange(v: number) {
    fontSizeLocal = v; // 立即反馈
    pendingFontSize = v; // 记录挂起值
    commitFontSize(v); // 500ms 防抖落库
  }

  function onLineHeightChange(v: number) {
    lineHeightLocal = v;
    pendingLineHeight = v;
    commitLineHeight(v);
  }

  // 组件卸载前，冲刷尚未提交的挂起值
  $effect(() => {
    return () => {
      if (commitFontSize.isPending()) commitFontSize.flush(pendingFontSize);
      if (commitLineHeight.isPending())
        commitLineHeight.flush(pendingLineHeight);
    };
  });

  async function openThemeReference() {
    await safeApi().system.openExternal({ url: THEME_REFERENCE_URL });
  }

  function pickThemeFile() {
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
  }

  async function onThemeFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const content = await file.text();
    await applyTheme(content);
  }

  async function applyTheme(content: string) {
    const result = await safeApi().config.setTheme(content);
    if (result === "dark") {
      toast.success("深色主题:成功设置");
    } else if (result === "light") {
      toast.success("浅色主题:成功设置");
    }
  }

  async function resetTheme() {
    await safeApi().config.resetTheme();
  }
</script>

<SettingsSection
  icon={IconCode}
  title="编辑器"
  description="代码编辑器外观与行为"
>
  <SettingRow title="字体大小" description="编辑器正文字号（px）">
    {#snippet control()}
      <NumberField.Root
        bind:value={() => fontSizeLocal, (v) => onFontSizeChange(v)}
        min={10}
        max={32}
      >
        <NumberField.Group>
          <NumberField.Decrement />
          <NumberField.Input />
          <NumberField.Increment />
        </NumberField.Group>
      </NumberField.Root>
    {/snippet}
  </SettingRow>

  <SettingRow title="行高" description="每行文本的垂直间距（px）">
    {#snippet control()}
      <NumberField.Root
        bind:value={() => lineHeightLocal, (v) => onLineHeightChange(v)}
        min={16}
        max={48}
      >
        <NumberField.Group>
          <NumberField.Decrement />
          <NumberField.Input />
          <NumberField.Increment />
        </NumberField.Group>
      </NumberField.Root>
    {/snippet}
  </SettingRow>

  <SettingRow title="显示行号" description="在左侧边栏展示行号">
    {#snippet control()}
      <Switch
        bind:checked={
          () => configStore.lineNumbers,
          (v) => configStore.setConfig("lineNumbers", v)
        }
      />
    {/snippet}
  </SettingRow>

  <SettingRow title="颜色主题">
    {#snippet description()}
      使用 VSCode 编辑器兼容的 JSON 格式（<button
        type="button"
        class="text-primary underline underline-offset-2 hover:opacity-80"
        onclick={openThemeReference}>查看textmate主题库</button
      >）
    {/snippet}
    {#snippet control()}
      <div class="flex items-center gap-2">
        <Button variant="secondary" size="sm" onclick={pickThemeFile}>
          添加
        </Button>
        <Button variant="outline" size="sm" onclick={resetTheme}>重置</Button>
      </div>
    {/snippet}
  </SettingRow>
</SettingsSection>

<!-- 隐藏的文件选择框，仅接受 JSON -->
<input
  bind:this={fileInput}
  type="file"
  accept="application/json,.json"
  class="hidden"
  onchange={onThemeFileChange}
/>
