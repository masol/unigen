<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { IconBulb, IconPlus } from "@tabler/icons-svelte";
  import { KB_TEMPLATES, type KbTemplate } from "./kbTemplates";

  let {
    onPick,
  }: {
    /** 点击范例卡时触发；调用方负责预填新建对话框。 */
    onPick?: (template: KbTemplate) => void;
  } = $props();
</script>

<div class="space-y-4">
  <div class="space-y-1">
    <div class="flex items-center gap-2">
      <IconBulb size={16} stroke={1.5} class="text-primary" />
      <h3 class="text-lg font-medium">推荐的组织方式</h3>
    </div>
    <p class="text-sm text-muted-foreground">
      下面不是你已经建好的知识集，而是可以照着建的范例。点击任意一个，名称与说明会自动填进新建表单，改一改就是你自己的。
    </p>
  </div>

  <div class="grid gap-3 sm:grid-cols-2">
    {#each KB_TEMPLATES as ex (ex.name)}
      {@const Icon = ex.icon}
      <button
        type="button"
        class="group flex h-full flex-col gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-xl focus-visible:-translate-y-0.5 focus-visible:shadow-xl focus-visible:outline-none"
        onclick={() => onPick?.(ex)}
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Icon size={16} stroke={1.5} class="shrink-0 text-primary" />
            <span class="truncate">{ex.name}</span>
          </div>
          <Badge
            variant="outline"
            class="shrink-0 rounded-lg text-[11px] font-normal"
          >
            范例
          </Badge>
        </div>

        <p class="text-xs leading-relaxed text-muted-foreground">
          {ex.description}
        </p>

        <span
          class="mt-auto inline-flex items-center gap-1 pt-1 text-xs text-primary opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <IconPlus size={12} stroke={1.5} />
          用这个范例新建
        </span>
      </button>
    {/each}
  </div>

  <div class="rounded-xl border border-border/50 bg-muted/40 p-4">
    <p class="text-xs font-medium">说明怎么写，AI 才找得到</p>
    <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
      写清三件事：① 里面放了哪些资料；② 什么问题上该用它；③
      常用术语。检索时会优先匹配这些词——泛泛写「一些资料」，通常匹配不到。上面的范例就是按这个写法写的。
    </p>
  </div>
</div>
