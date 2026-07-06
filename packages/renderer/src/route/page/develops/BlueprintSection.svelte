<!-- BlueprintSection.svelte -->
<script lang="ts">
  import * as Scrubbable from "$lib/components/ui/scrubbable";
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
</SettingsSection>
