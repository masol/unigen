<!--╭─────────────────────────────────────────────────────────╮ -->
<!-- │ [子组件 → header/menu/help-menu.svelte]                 │ -->
<!-- │ 职责：文档 / 代码 / 反馈 / 检查更新 / 关于               │ -->
<!-- ╰─────────────────────────────────────────────────────────╯ -->
<script lang="ts">
  import * as Menubar from "$lib/components/ui/menubar";
  import { safeApi } from "$lib/utils/api";
  import {
    IconBook,
    IconBug,
    IconInfoCircle,
    IconRefresh,
    IconWorld,
  } from "@tabler/icons-svelte";

  async function openUrl(url: string) {
    await safeApi().system.openExternal({ url });
  }
</script>

<Menubar.Menu>
  <Menubar.Trigger
    class="h-9 rounded-none px-2.5 text-xs font-normal data-[state=open]:bg-accent/80 hover:bg-accent/80"
  >
    帮助
  </Menubar.Trigger>
  <Menubar.Content align="start" class="z-200 min-w-48">
    <Menubar.Item
      onSelect={() => openUrl("https://github.com/masol/unigen/wiki")}
    >
      <IconBook size={20} stroke={1.5} class="mr-2 text-muted-foreground" />
      查看文档
    </Menubar.Item>
    <Menubar.Item onSelect={() => openUrl("https://github.com/masol/unigen")}>
      <IconWorld size={20} stroke={1.5} class="mr-2 text-muted-foreground" />
      查看代码
    </Menubar.Item>
    <Menubar.Item
      onSelect={() => openUrl("https://github.com/masol/unigen/issues")}
    >
      <IconBug size={20} stroke={1.5} class="mr-2 text-muted-foreground" />
      报告问题
    </Menubar.Item>
    <Menubar.Separator />
    <Menubar.Item
      onSelect={() => openUrl("https://github.com/masol/unigen/releases")}
    >
      <IconRefresh size={20} stroke={1.5} class="mr-2 text-muted-foreground" />
      检查更新
    </Menubar.Item>
    <Menubar.Item onSelect={() => openUrl("https://www.lizt.top")}>
      <IconInfoCircle
        size={20}
        stroke={1.5}
        class="mr-2 text-muted-foreground"
      />
      关于
    </Menubar.Item>
  </Menubar.Content>
</Menubar.Menu>
