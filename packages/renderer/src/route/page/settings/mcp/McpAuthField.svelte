<!--
  鉴权字段：选择 MCP 鉴权方式（无 / Bearer / API Key）并输入 Token 值。

  - 组件本身只负责 UI 与双向绑定；
  - 与之配对的反解析/构建函数放在 <script module> 中，供父组件复用，
    保证"编辑时反解析、提交时合并"的语义只存在一处。
-->
<script module lang="ts">
  export type AuthMode = "none" | "bearer" | "x-api-key";

  export const AUTH_OPTIONS: { value: AuthMode; label: string }[] = [
    { value: "none", label: "无" },
    { value: "bearer", label: "Bearer Token" },
    { value: "x-api-key", label: "API Key" },
  ];

  export function authHeaderName(mode: AuthMode): string {
    return mode === "bearer" ? "Authorization" : "X-API-Key";
  }

  /**
   * 从 headers 反解析鉴权：
   * - `Authorization: Bearer <token>` 识别为 bearer
   * - `X-API-Key: <key>` 识别为 x-api-key
   * - 其余（含非 Bearer 形态的 Authorization）保留到 remaining
   */
  export function parseAuthFromHeaders(
    headers: Record<string, string> | undefined,
  ): {
    authMode: AuthMode;
    authToken: string;
    remaining: Record<string, string>;
  } {
    const remaining: Record<string, string> = {};
    let authMode: AuthMode = "none";
    let authToken = "";
    let consumed = false;

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        const lower = key.toLowerCase();

        if (!consumed && lower === "authorization") {
          const match = value.match(/^Bearer\s+(.+)$/i);
          if (match) {
            authMode = "bearer";
            authToken = match[1];
            consumed = true;
            continue;
          }
        }

        if (!consumed && lower === "x-api-key") {
          authMode = "x-api-key";
          authToken = value;
          consumed = true;
          continue;
        }

        remaining[key] = value;
      }
    }

    return { authMode, authToken, remaining };
  }

  /**
   * 构建鉴权相关请求头。authMode 为 none 或 token 为空时不产生 header。
   * 调用方负责与自定义请求头合并（鉴权优先）。
   */
  export function buildAuthHeaders(
    authMode: AuthMode,
    authToken: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = authToken.trim();

    if (authMode === "bearer" && token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else if (authMode === "x-api-key" && token) {
      headers["X-API-Key"] = token;
    }

    return headers;
  }
</script>

<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { IconKey } from "@tabler/icons-svelte";

  let {
    authMode = $bindable<AuthMode>("none"),
    authToken = $bindable(""),
  }: {
    authMode?: AuthMode;
    authToken?: string;
  } = $props();

  const hint = $derived(
    authMode === "bearer"
      ? "Authorization: Bearer <token>"
      : "X-API-Key: <key>",
  );

  const placeholder = $derived(
    authMode === "bearer" ? "sk-..." : "your-api-key",
  );
</script>

<div class="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
  <div class="flex items-center gap-2">
    <IconKey size={14} stroke={1.5} class="text-muted-foreground" />
    <Label class="text-xs text-muted-foreground">鉴权</Label>
  </div>

  <div class="flex flex-wrap gap-2">
    {#each AUTH_OPTIONS as option (option.value)}
      {@const active = authMode === option.value}
      <button
        type="button"
        onclick={() => (authMode = option.value)}
        class={[
          "rounded-lg border px-2.5 py-1 text-xs transition-all duration-200",
          active
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border/50 bg-background text-muted-foreground hover:bg-muted",
        ]}
      >
        {option.label}
      </button>
    {/each}
  </div>

  {#if authMode !== "none"}
    <div class="space-y-1">
      <p class="text-[11px] text-muted-foreground">
        将写入请求头
        <code class="rounded bg-muted px-1 py-0.5 font-mono">{hint}</code>
      </p>
      <Input
        type="password"
        bind:value={authToken}
        {placeholder}
        class="rounded-lg font-mono"
        autocomplete="off"
        aria-label={authHeaderName(authMode)}
      />
    </div>
  {/if}
</div>
