# Writing Tools

This directory contains all AI-callable tools. Each tool is a single file that exports a `ToolDefinition` object.

## Where to put a tool

Group by domain under a subdirectory:

- `fs/` — file system (read/write/edit, dirs, copy, remove, stat, grep, diff, apply_patch)
- `archive/` — create/extract archives
- `net/` — network requests
- `proc/` — process execution
- `media/` — image/audio/video generation
- `interaction/` — user-facing queries
- `memory/` — project persistence (KV, sessions/messages/metags/capabilities)
- `context/` — runtime context inspection / capability execution
- `meta-tools/` — framework meta tools (`search_tools`, `invoke_tool`, skills, knowledge). These are mounted directly and excluded from tool search.

`path-utils.ts` is shared; keep it at the tools root.

## ToolDefinition contract

```ts
import type { ToolDefinition } from "<relative>/type.js";

export const myTool: ToolDefinition<Input, Output> = {
  name: "my_tool", // snake_case, unique
  description: "...", // intent-oriented; used by search_tools
  inputSchema, // zod schema
  outputSchema, // zod schema (optional, recommended)
  execute: async (input) => {
    /* ... */ return output;
  },
  toModelOutput: ({ output }) => {
    /* optional custom formatting */
  },
};
```

### Input / output

- Always declare `inputSchema` with `zod`. It drives validation and is shown to the model via `search_tools`.
- `outputSchema` is optional but strongly recommended — it is surfaced in `invocation.outputSchema`.
- `execute` may be `async`. Throw on failure; the framework reports the message and hints to the model.
- `toModelOutput` is optional. Use it when raw JSON is not ideal (e.g. `exec` prints a summary, `read_file` emits multimodal content).

### Description rules

- Describe **intent**, not implementation: "what it does", "when to use", "when not to use".
- Name related tools explicitly (e.g. "use `search_tools` + `invoke_tool` for tools, `read_file` for file content") so the model picks the right one.
- Keep it concise; it is embedded in the search index. Do not restate the input schema field by field unless ordering/constraints matter.

### Paths

Use helpers from `path-utils.ts`:

- `resolveReadPath(raw)` — relative paths resolve against project cwd; absolute paths are allowed (read outside project).
- `resolveProjectWritePath(raw)` — writes are restricted to project cwd; `..` escape is rejected.
- `toPreferredPath(abs)` — returns the project-relative path when inside cwd, absolute otherwise.

Do not resolve paths manually. `cwd` is the current project root.

### Context

```ts
import { getRunnerContext } from "$libs/project/controllers/runner.js";

const ctx = getRunnerContext();
// ctx.prj.path, ctx.prj.notify, ctx.signal, ctx.info, ctx.error
```

`getRunnerContext()` is valid only during execution. Do not call it at module top level.

### Database

```ts
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
const db = PrjDB.ensure(ctx.prj);
```

Prefer `PrjDB` methods (`get`, `set`, `getSession`, `saveMessage`, `getMetag`, `upcertCapa`, ...) over raw SQL.

### Registering

Add the tool to `getBuiltinTools()` in `builtins.ts`. Meta tools go in `getMetaTools()`.

**Do not add meta tools to the search index.** They are mounted by the framework and excluded via `meta-tools/registry.ts`.

## Checklist

1. File under the right subdirectory, named after the tool (`my_tool.ts`).
2. `ToolDefinition<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>>`.
3. `name` is snake_case and unique across all sources.
4. `description` says what it does and when (not) to use it.
5. Use `path-utils` for any path argument.
6. Throw errors for invalid state; do not return fake success.
7. Register in `builtins.ts`.
8. Update `getMetaTools()` only for framework-level tools.
