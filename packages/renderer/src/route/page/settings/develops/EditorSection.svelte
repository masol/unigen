<!-- EditorSection.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Scrubbable from "$lib/components/ui/scrubbable";
  import { Switch } from "$lib/components/ui/switch";
  import { configStore } from "$lib/store/config.svelte";
  import { safeApi } from "$lib/utils/api";
  import { IconCode } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import SettingRow from "./SettingRow.svelte";
  import SettingsSection from "./SettingsSection.svelte";

  const THEME_REFERENCE_URL =
    "https://textmate-grammars-themes.netlify.app/?theme=github-dark-default&grammar=javascript";

  // 文件选择框引用
  let fileInput = $state<HTMLInputElement>();

  // 打开主题格式参考网址（外部浏览器）
  async function openThemeReference() {
    await safeApi().system.openExternal({ url: THEME_REFERENCE_URL });
  }

  // 点击「添加」——打开文件选择对话框
  function pickThemeFile() {
    if (!fileInput) return;
    fileInput.value = ""; // 允许重复选择同一个文件
    fileInput.click();
  }

  // 选择文件后：读取内容并交给下面的异步函数处理
  async function onThemeFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const content = await file.text();
    await applyTheme(content);
  }

  // 异步留空函数：处理导入的主题 JSON 内容
  async function applyTheme(content: string) {
    const result = await safeApi().config.setTheme(content);
    if (result === "dark") {
      toast.success("深色主题:成功设置");
    } else if (result === "light") {
      toast.success("浅色主题:成功设置");
    }
  }

  // 异步留空函数：重置颜色主题
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
      <Scrubbable.Root
        min={10}
        max={32}
        bind:value={
          () => configStore.fontSize,
          (v) => configStore.setConfig("fontSize", v)
        }
        step={1}
        variant="secondary"
      >
        <Scrubbable.Value />
      </Scrubbable.Root>
    {/snippet}
  </SettingRow>

  <SettingRow title="行高" description="每行文本的垂直间距（px）">
    {#snippet control()}
      <Scrubbable.Root
        min={16}
        max={48}
        bind:value={
          () => configStore.lineHeight,
          (v) => configStore.setConfig("lineHeight", v)
        }
        step={1}
        variant="secondary"
      >
        <Scrubbable.Value />
      </Scrubbable.Root>
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
