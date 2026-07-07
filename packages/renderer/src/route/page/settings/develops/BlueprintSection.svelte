<!-- BlueprintSection.svelte -->
<script lang="ts">
  import * as Scrubbable from "$lib/components/ui/scrubbable";
  import { Switch } from "$lib/components/ui/switch";
  import { configStore } from "$lib/store/config.svelte";
  import { IconTable } from "@tabler/icons-svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsSection from "./SettingsSection.svelte";
</script>

<SettingsSection
  icon={IconTable}
  title="蓝图表"
  description="表格分页与展示行为"
>
  <SettingRow title="每页显示条目数" description="单页渲染的记录数量（6 - 20）">
    {#snippet control()}
      <Scrubbable.Root
        min={6}
        max={20}
        bind:value={
          () => configStore.itemsPerPage,
          (v) => configStore.setConfig("itemsPerPage", v)
        }
        step={1}
        variant="secondary"
      >
        <Scrubbable.Value />
      </Scrubbable.Root>
    {/snippet}
  </SettingRow>
  <SettingRow
    title="可删除蓝图元素"
    description="允许删除术语表、元术语表以及能力表中成员"
  >
    {#snippet control()}
      <Switch
        bind:checked={
          () => configStore.rmblueprint,
          (v) => configStore.setConfig("rmblueprint", v)
        }
      />
    {/snippet}
  </SettingRow>
  <SettingRow
    title="变动确认"
    description="在数据变动(如保存)之前，提醒用户可能的风险。"
  >
    {#snippet control()}
      <Switch
        bind:checked={
          () => !configStore.silentSave,
          (v) => configStore.setConfig("silentSave", !v)
        }
      />
    {/snippet}
  </SettingRow>
</SettingsSection>
