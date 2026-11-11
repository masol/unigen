<!--
  自定义请求头编辑器：一行一个键值对，支持动态增删。

  - 使用 $bindable 与父组件共享 headerPairs 数组（父组件 mutation 即可同步）；
  - 与 pairsToRecord / recordToPairs 配对，供父组件在提交时序列化/反序列化。
-->
<script module lang="ts">
  export type HeaderPair = { id: string; key: string; value: string };

  /** 把 { key, value } 数组序列化为 headers Record，空 key 会被丢弃。 */
  export function pairsToRecord(pairs: HeaderPair[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of pairs) {
      const key = pair.key.trim();
      if (!key) continue;
      out[key] = pair.value;
    }
    return out;
  }

  /** 把 headers Record 转换为可编辑的 HeaderPair[]，保持原有顺序。 */
  export function recordToPairs(
    headers: Record<string, string> | undefined,
    makeId: () => string,
  ): HeaderPair[] {
    if (!headers) return [];
    return Object.entries(headers).map(([key, value]) => ({
      id: makeId(),
      key,
      value,
    }));
  }
</script>

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import autoAnimate from "@formkit/auto-animate";
  import { IconPlus, IconTrash } from "@tabler/icons-svelte";

  let {
    headerPairs = $bindable<HeaderPair[]>([]),
  }: {
    headerPairs?: HeaderPair[];
  } = $props();

  function addHeader() {
    headerPairs.push({ id: crypto.randomUUID(), key: "", value: "" });
  }

  function removeHeader(idx: number) {
    headerPairs.splice(idx, 1);
  }
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between">
    <Label class="text-xs text-muted-foreground">自定义请求头</Label>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="gap-1.5 rounded-lg text-xs"
      onclick={addHeader}
    >
      <IconPlus size={12} stroke={1.5} />
      添加
    </Button>
  </div>

  <div class="space-y-2" use:autoAnimate>
    {#each headerPairs as pair, idx (pair.id)}
      <div class="flex items-center gap-2">
        <Input
          bind:value={pair.key}
          placeholder="Header 名"
          class="min-w-0 flex-1 rounded-lg font-mono text-xs"
        />
        <Input
          bind:value={pair.value}
          placeholder="值"
          class="min-w-0 flex-2 rounded-lg font-mono text-xs"
        />
        <button
          type="button"
          aria-label="删除请求头"
          class="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
          onclick={() => removeHeader(idx)}
        >
          <IconTrash size={14} stroke={1.5} />
        </button>
      </div>
    {/each}

    {#if headerPairs.length === 0}
      <p
        class="rounded-lg border border-dashed border-border/50 py-3 text-center text-xs text-muted-foreground"
      >
        无自定义请求头
      </p>
    {/if}
  </div>
</div>
