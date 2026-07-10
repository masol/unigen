<script lang="ts">
  import * as NumberField from "$lib/components/ui/number-field";
  import { Switch } from "$lib/components/ui/switch";
  import { configStore } from "$lib/store/config.svelte";
  import { IconTable } from "@tabler/icons-svelte";
  import { debounce } from "radashi";
  import SettingRow from "./SettingRow.svelte";
  import SettingsSection from "./SettingsSection.svelte";
  //╭─────────────────────────────────────────────────────────╮
  //│ 每页条目数：500ms 防抖提交                                  │
  //╰─────────────────────────────────────────────────────────╯
  // 本地镜像值：立即反馈 UI
  let itemsPerPageLocal = $state(configStore.itemsPerPage);
  // 记录最近一次挂起值，供 flush 使用
  let pendingItemsPerPage = configStore.itemsPerPage;

  const commitItemsPerPage = debounce({ delay: 500 }, (v: number) => {
    configStore.setConfig("itemsPerPage", v);
  });

  function onItemsPerPageChange(v: number) {
    itemsPerPageLocal = v; // 立即反馈
    pendingItemsPerPage = v; // 记录挂起值
    commitItemsPerPage(v); // 500ms 防抖落库
  }

  // 卸载前冲刷挂起值
  $effect(() => {
    return () => {
      if (commitItemsPerPage.isPending()) {
        commitItemsPerPage.flush(pendingItemsPerPage);
      }
    };
  });
</script>

<SettingsSection icon={IconTable} title="蓝图" description="表格分页与展示行为">
  <SettingRow title="每页显示条目数" description="单页渲染的记录数量（6 - 20）">
    {#snippet control()}
      <NumberField.Root
        bind:value={() => itemsPerPageLocal, (v) => onItemsPerPageChange(v)}
        min={6}
        max={28}
      >
        <NumberField.Group>
          <NumberField.Decrement />
          <NumberField.Input />
          <NumberField.Increment />
        </NumberField.Group>
      </NumberField.Root>
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
    description="在工作流变动(编辑、反思)之前，提醒用户可能的风险。"
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

  <SettingRow
    title="并行执行"
    description="在助手调整工作流时，是否允许工作流执行。"
  >
    {#snippet control()}
      <Switch
        bind:checked={
          () => configStore.parallelRun,
          (v) => configStore.setConfig("parallelRun", v)
        }
      />
    {/snippet}
  </SettingRow>
</SettingsSection>
