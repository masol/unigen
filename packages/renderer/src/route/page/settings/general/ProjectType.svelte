<script lang="ts">
  import { IconFolderPlus } from "@tabler/icons-svelte";
  import * as Select from "$lib/components/ui/select";
  import { configStore } from "$lib/store/config.svelte";
  import { pluginStore } from "$lib/store/plugin.svelte";

  // ═══════════════════════════════════════════════════════════
  // Project type options — 静态可枚举,内嵌定义
  // ═══════════════════════════════════════════════════════════
  const projectTypes = $derived(
    pluginStore.projectPlugins.map((plugin) => {
      return {
        value: plugin.id,
        label: plugin.name,
        note: plugin.description,
        icon: plugin.icon,
      };
    }),
  );

  // ═══════════════════════════════════════════════════════════
  // Reactive bindings — configStore 是唯一真相
  // ═══════════════════════════════════════════════════════════
  let defaultProjectType = $derived(configStore.projectype ?? "video");
  let selectedTypeLabel = $derived(
    projectTypes.find((t) => t.value === defaultProjectType)?.label ??
      "选择项目类型…",
  );

  // ═══════════════════════════════════════════════════════════
  // Selection handler
  // ═══════════════════════════════════════════════════════════
  function handleTypeChange(value: string) {
    if (value && value !== configStore.projectype) {
      configStore.setProjectype(value);
    }
  }
</script>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">项目配置</h2>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <!-- ── Row: 新建项目默认类型 ── -->
    <div
      class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-8 p-6"
    >
      <div class="flex items-center gap-4 shrink-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconFolderPlus
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div>
          <p class="text-sm font-medium text-foreground">默认项目类型</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            新建项目时将自动应用此类型
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 w-full lg:w-96 shrink-0">
        <Select.Root
          type="single"
          value={defaultProjectType}
          onValueChange={handleTypeChange}
        >
          <Select.Trigger class="min-w-0 flex-1 rounded-xl">
            <span class="truncate">{selectedTypeLabel}</span>
          </Select.Trigger>
          <Select.Content class="rounded-xl max-h-80">
            {#each projectTypes as type (type.value)}
              {@const Icon = type.icon}
              <Select.Item value={type.value} class="rounded-lg">
                <div class="flex items-center gap-3 w-full">
                  <div
                    class="flex items-center justify-center size-8 rounded-lg bg-muted shrink-0"
                  >
                    <Icon
                      size={16}
                      stroke={1.5}
                      class="text-muted-foreground"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-foreground">
                      {type.label}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {type.note}
                    </p>
                  </div>
                </div>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
  </div>
</section>
