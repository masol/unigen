<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { SvelteSet } from "svelte/reactivity";

  import {
    buildJsonPatch,
    type PacMetaDialogCommonProps,
  } from "./pac-meta-dialog-utils";

  type EditableInputItem = {
    kind: "editable";
    id: number;
    name: string;
    description: string;
    optional: boolean;
    originalSchema: Record<string, unknown> | null;
  };

  type RawInputItem = {
    kind: "raw";
    id: number;
    key: string;
    required: boolean;
    value: unknown;
  };

  type InputItem = EditableInputItem | RawInputItem;
  type DialogMode = "object" | "array" | "unsupported";

  interface InitialState {
    mode: DialogMode;
    initialRoot: unknown;
    hasOriginal: boolean;
    items: InputItem[];
    snapshot: string;
  }

  let { value, onClose, onCancel }: PacMetaDialogCommonProps = $props();

  let nextId = 1;

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function cloneJson<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Svelte 5 proxy / 含不可克隆值时回退到 JSON
      }
    }

    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }

  function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
  }

  function isStringSchema(schema: unknown): schema is Record<string, unknown> {
    return isPlainObject(schema) && schema.type === "string";
  }

  function jsonFull(value: unknown): string {
    try {
      const text = JSON.stringify(value, null, 2);
      return typeof text === "string" ? text : String(value);
    } catch {
      try {
        return String(value);
      } catch {
        return "[无法预览的 JSON]";
      }
    }
  }

  function jsonPreviewOneLine(value: unknown, maxLength = 120): string {
    const text = (() => {
      try {
        const compact = JSON.stringify(value);
        return typeof compact === "string" ? compact : String(value);
      } catch {
        return "[无法预览的 JSON]";
      }
    })();

    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }

  function setJsonProperty(
    target: Record<string, unknown>,
    key: string,
    value: unknown,
  ): void {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  function parseItems(
    properties: Record<string, unknown>,
    required: readonly string[],
  ): InputItem[] {
    const requiredSet = new SvelteSet(required);
    const result: InputItem[] = [];

    for (const [key, schema] of Object.entries(properties)) {
      try {
        if (isStringSchema(schema)) {
          result.push({
            kind: "editable",
            id: nextId++,
            name: key,
            description:
              typeof schema.description === "string" ? schema.description : "",
            optional: !requiredSet.has(key),
            originalSchema: cloneJson(schema),
          });
        } else {
          result.push({
            kind: "raw",
            id: nextId++,
            key,
            required: requiredSet.has(key),
            value: cloneJson(schema),
          });
        }
      } catch {
        result.push({
          kind: "raw",
          id: nextId++,
          key,
          required: requiredSet.has(key),
          value: schema,
        });
      }
    }

    return result;
  }

  function serializeItems(items: InputItem[]): string {
    try {
      return JSON.stringify(items);
    } catch {
      return `__error_${Date.now()}`;
    }
  }

  function parseInitial(inputs: unknown): InitialState {
    try {
      if (inputs === undefined) {
        return {
          mode: "object",
          initialRoot: undefined,
          hasOriginal: false,
          items: [],
          snapshot: serializeItems([]),
        };
      }

      if (!isPlainObject(inputs)) {
        return {
          mode: "unsupported",
          initialRoot: inputs,
          hasOriginal: true,
          items: [],
          snapshot: serializeItems([]),
        };
      }

      const root = cloneJson(inputs);

      if (root.type === "array") {
        const itemSchema = isPlainObject(root.items) ? root.items : null;
        if (
          !itemSchema ||
          (itemSchema.type !== "object" &&
            !isPlainObject(itemSchema.properties))
        ) {
          return {
            mode: "unsupported",
            initialRoot: root,
            hasOriginal: true,
            items: [],
            snapshot: serializeItems([]),
          };
        }

        const properties = isPlainObject(itemSchema.properties)
          ? itemSchema.properties
          : {};
        const required = asStringArray(itemSchema.required);
        const items = parseItems(properties, required);

        return {
          mode: "array",
          initialRoot: root,
          hasOriginal: true,
          items,
          snapshot: serializeItems(items),
        };
      }

      if (root.type !== undefined && root.type !== "object") {
        return {
          mode: "unsupported",
          initialRoot: root,
          hasOriginal: true,
          items: [],
          snapshot: serializeItems([]),
        };
      }

      const properties = isPlainObject(root.properties) ? root.properties : {};
      const required = asStringArray(root.required);
      const items = parseItems(properties, required);

      return {
        mode: "object",
        initialRoot: root,
        hasOriginal: true,
        items,
        snapshot: serializeItems(items),
      };
    } catch {
      toast.warning("内容解析失败，已按原始格式展示，你可以删除它。");
      return {
        mode: "unsupported",
        initialRoot: inputs,
        hasOriginal: true,
        items: [],
        snapshot: serializeItems([]),
      };
    }
  }

  const initial = parseInitial(value.inputs);
  const mode = initial.mode;
  const initialRoot = initial.initialRoot;
  const hasOriginal = initial.hasOriginal;
  const initialItemsSnapshot = initial.snapshot;

  let items = $state<InputItem[]>(initial.items);
  let rootDeleted = $state(false);
  let error = $state<string | null>(null);

  let hasChanges = $derived(
    (mode === "unsupported" && rootDeleted) ||
      (mode !== "unsupported" &&
        serializeItems(items) !== initialItemsSnapshot),
  );

  function addItem() {
    items = [
      ...items,
      {
        kind: "editable",
        id: nextId++,
        name: "",
        description: "",
        optional: false,
        originalSchema: null,
      },
    ];
  }

  function removeItem(id: number) {
    items = items.filter((item) => item.id !== id);
  }

  function validate(): string | null {
    if (mode === "unsupported") return null;

    try {
      const names = new SvelteSet<string>();

      for (const item of items) {
        if (item.kind === "raw") names.add(item.key);
      }

      for (const item of items) {
        if (item.kind !== "editable") continue;

        const name = item.name.trim();
        if (!name) return "请填写信息名称。";

        if (!/^[\p{L}\p{N}_-]+$/u.test(name)) {
          return `信息名称"${name}"不合法：只能包含中文、字母、数字、下划线或短横线，不能有空格或标点。`;
        }

        if (names.has(name)) {
          return `信息名称"${name}"重复，请换一个名称。`;
        }

        names.add(name);
      }

      return null;
    } catch {
      toast.warning("检查时出现意外，已跳过本次检查。");
      return "检查时出现意外，请检查信息名称。";
    }
  }

  function buildStringSchema(item: EditableInputItem): Record<string, unknown> {
    const schema = item.originalSchema
      ? cloneJson(item.originalSchema)
      : ({} as Record<string, unknown>);

    schema.type = "string";

    const description = item.description.trim();
    if (description) {
      schema.description = description;
    } else {
      delete schema.description;
    }

    return schema;
  }

  function buildProperties(): Record<string, unknown> {
    const properties: Record<string, unknown> = {};

    for (const item of items) {
      try {
        if (item.kind === "editable") {
          setJsonProperty(
            properties,
            item.name.trim(),
            buildStringSchema(item),
          );
        } else {
          setJsonProperty(properties, item.key, cloneJson(item.value));
        }
      } catch {
        // 单个字段构建失败时跳过
      }
    }

    return properties;
  }

  function applyRequired(
    container: Record<string, unknown>,
    properties: Record<string, unknown>,
  ) {
    const required = new SvelteSet<string>();

    for (const item of items) {
      if (item.kind === "raw") {
        if (item.required) required.add(item.key);
      } else {
        const name = item.name.trim();
        if (!item.optional) required.add(name);
      }
    }

    const nextRequired = [...required].filter((key) =>
      Object.prototype.hasOwnProperty.call(properties, key),
    );

    if (nextRequired.length > 0) {
      container.required = nextRequired;
    } else {
      delete container.required;
    }
  }

  function buildFinalSchema(): unknown | undefined {
    if (mode === "unsupported") {
      return rootDeleted ? {} : cloneJson(initialRoot);
    }

    if (!hasOriginal && items.length === 0) return undefined;

    try {
      if (hasOriginal && serializeItems(items) === initialItemsSnapshot) {
        return cloneJson(initialRoot);
      }
    } catch {
      // 序列化失败时继续重建
    }

    const root: Record<string, unknown> = isPlainObject(initialRoot)
      ? cloneJson(initialRoot)
      : { type: "object", properties: {} };

    const properties = buildProperties();

    if (mode === "object") {
      setJsonProperty(root, "properties", properties);
      applyRequired(root, properties);
      return root;
    }

    root.type = "array";

    const itemSchema: Record<string, unknown> = isPlainObject(root.items)
      ? cloneJson(root.items)
      : { type: "object" };

    itemSchema.type = itemSchema.type ?? "object";
    setJsonProperty(itemSchema, "properties", properties);
    applyRequired(itemSchema, properties);
    root.items = itemSchema;

    return root;
  }

  function save() {
    try {
      error = validate();
      if (error) return;

      const final = buildFinalSchema();
      const nextInputs = buildJsonPatch(value.inputs, final) as
        | Record<string, unknown>
        | undefined;

      onClose?.({ inputs: nextInputs });
    } catch {
      toast.warning("保存时出现意外，已取消本次操作。你的修改仍然保留。");
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      onCancel?.();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && hasChanges) {
      save();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

<div class="space-y-4 p-4">
  <div class="space-y-1">
    <h2 class="text-base font-medium">调用时需要提供的信息</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      当本 Agent被
      调用时，调用方按下面清单准备信息。
    </p>
  </div>

  {#if mode === "unsupported"}
    <div class="space-y-3 rounded-xl border bg-muted/20 p-3">
      <div class="flex items-start gap-2.5">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          <IconInfoCircle size={16} stroke={1.75} />
        </div>
        <div class="min-w-0 space-y-1">
          <p class="text-sm font-medium">这部分暂时无法直接编辑</p>
          <p class="text-xs text-muted-foreground leading-relaxed">
            当前内容不是常见格式，会按原样保留；你也可以删除它。
          </p>
        </div>
      </div>

      <pre
        class="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-background px-2.5 py-2 font-mono text-[11px] leading-relaxed"
        title={jsonFull(initialRoot)}>{jsonPreviewOneLine(
          initialRoot,
          400,
        )}</pre>

      {#if rootDeleted}
        <p class="text-xs text-muted-foreground">
          已标记删除，保存后就不再需要提供这些信息。
        </p>
      {:else}
        <Button
          variant="outline"
          size="sm"
          class="rounded-lg"
          onclick={() => {
            rootDeleted = true;
          }}
        >
          <IconTrash size={14} />
          删除这段内容
        </Button>
      {/if}
    </div>
  {:else}
    {#if items.length === 0}
      <div class="rounded-xl border border-dashed p-6 text-center">
        <p class="text-sm text-muted-foreground">还没有需要提供的信息。</p>
        <p class="mt-1 text-xs text-muted-foreground">
          添加后，其他 Agent 调用时就知道需要提供什么。
        </p>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each items as item (item.id)}
          {#if item.kind === "editable"}
            <div class="space-y-2.5 rounded-xl border p-3 even:bg-muted/20">
              <div class="flex items-center gap-2">
                <input
                  class="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                  bind:value={item.name}
                  placeholder="信息名称，例如：主题"
                />

                <label
                  class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Switch
                    checked={!item.optional}
                    onCheckedChange={(checked) => {
                      item.optional = !checked;
                    }}
                  />
                  必填
                </label>

                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="删除这条信息"
                  onclick={() => removeItem(item.id)}
                >
                  <IconTrash size={15} />
                </Button>
              </div>

              <textarea
                class="min-h-16 w-full resize-y rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                rows={2}
                bind:value={item.description}
                placeholder="说明这条信息是什么，调用方应该提供什么。例如：需要审查的代码片段。"
              ></textarea>
            </div>
          {:else}
            <div class="space-y-2 rounded-xl border p-3 even:bg-muted/20">
              <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="truncate font-mono text-sm font-medium"
                      title={item.key}>{item.key}</span
                    >
                    <span
                      class="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {item.required ? "必填" : "可选"}
                    </span>
                    <span
                      class="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400"
                    >
                      其他格式
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="删除这条信息"
                  onclick={() => removeItem(item.id)}
                >
                  <IconTrash size={15} />
                </Button>
              </div>

              <pre
                class="overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-dashed bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
                title={jsonFull(item.value)}>{jsonPreviewOneLine(
                  item.value,
                )}</pre>

              <p class="text-[11px] text-muted-foreground leading-relaxed">
                这一项不是普通文字，会按原始格式保留，不能在这里编辑；删除后会从要求中移除。
              </p>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <Button
      variant="outline"
      class="w-full rounded-xl border-dashed"
      onclick={addItem}
    >
      <IconPlus size={15} />
      添加一条信息
    </Button>
  {/if}

  <p class="text-[11px] text-muted-foreground leading-relaxed">
    名称是否可以使用中文，取决于最终使用的文本模型。
  </p>

  {#if error}
    <p
      class="rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
    >
      {error}
    </p>
  {/if}

  <div class="flex justify-end gap-2 pt-1">
    <Button
      variant="outline"
      size="sm"
      class="rounded-lg"
      onclick={() => onCancel?.()}
    >
      取消
    </Button>
    <Button size="sm" class="rounded-xl" disabled={!hasChanges} onclick={save}
      >保存</Button
    >
  </div>
</div>
