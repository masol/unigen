<!-- EditorSection.svelte -->
<script lang="ts">
  import * as Scrubbable from "$lib/components/ui/scrubbable";
  import { Switch } from "$lib/components/ui/switch";
  import { configStore } from "$lib/store/config.svelte";
  import { IconCode } from "@tabler/icons-svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsSection from "./SettingsSection.svelte";
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
</SettingsSection>
