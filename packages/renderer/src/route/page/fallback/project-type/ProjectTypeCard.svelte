<!-- ╭─────────────────────────────────────────────────────────╮ -->
<!-- │ [子组件 → ProjectTypeCard.svelte]                        │ -->
<!-- │ 职责：单个项目类型的可选卡片，含图标、名称、说明与选中态    │ -->
<!-- │ 复用：项目类型网格中每一项，未来其他「选择类型」场景亦可复用 │ -->
<!-- ╰─────────────────────────────────────────────────────────╯ -->
<script lang="ts">
    import { RuntimeIcon } from '$lib/components/runtimeicon';
    import { IconCheck } from '@tabler/icons-svelte';
    import type { ProjectType } from './types';

    type Props = {
        type: ProjectType;
        selected?: boolean;
        onSelect?: (id: string) => void;
        /** 双击/回车 → 选中并直接确认创建 */
        onConfirm?: (id: string) => void;
    };

    let { type, selected = false, onSelect, onConfirm }: Props = $props();
</script>

<button
    type="button"
    onclick={() => onSelect?.(type.id)}
    ondblclick={() => onConfirm?.(type.id)}
    aria-pressed={selected}
    class="group relative flex h-full flex-col items-start gap-3 rounded-2xl border p-6 text-left
           transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
           {selected
        ? 'border-primary bg-primary/5 shadow-sm'
        : 'border-border/50 bg-card shadow-sm hover:border-border'}"
>
    {#if selected}
        <span
            class="animate-fade-in absolute right-4 top-4 flex size-6 items-center justify-center
                   rounded-lg bg-primary text-primary-foreground"
        >
            <IconCheck class="size-4" />
        </span>
    {/if}

    <span
        class="flex size-12 shrink-0 items-center justify-center rounded-xl transition-all duration-200
               {selected
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground'}"
    >
        <RuntimeIcon name={type.icon} size={24} />
    </span>

    <div class="space-y-1">
        <p class="text-base font-medium text-foreground">{type.name}</p>
        <p class="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{type.description}</p>
    </div>
</button>