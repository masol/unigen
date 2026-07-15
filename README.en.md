[中文](./README.md) | **English**

> 🌐 This is a translation of the Chinese README, which is the **authoritative version**. In case of any discrepancy, the [Chinese version](./README.md) prevails; translations may lag behind.



# Unigen — Uniform Generation

**Unigen is a workflow platform for complex, long-chain tasks demanding human-level quality: when you need AI to take a script all the way to a finished video, or an idea all the way to a full novel — tasks with a great many steps and extremely high quality requirements, but no urgency (a single run taking days or even weeks is acceptable, as long as quality never collapses) — Unigen carries such workflows reliably, and uses a planner to keep the workflows themselves evolving: today through human–AI collaboration, ultimately with no human in the loop at all.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## Who Unigen Is For

| You are                                                               | What Unigen gives you                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A creator / end user** (video creator, novelist, quant researcher…) | High-quality workflows that work out of the box: create a project, click run, collect the result. You never need to care whether a workflow was written by a human or evolved by AI.                                          |
| **A workflow developer**                                              | A code-based, dynamically loadable workflow runtime ("blueprints"), plus a built-in methodology for high-determinism long-chain development — build workflows with many steps that never drift, and publish them to creators. |

## What Unigen Is Not For

- **Conversational, real-time agent tasks** — that is home turf for ReAct-style frameworks; Unigen deliberately stays out.
- **Simple 3–5 step automations** — Unigen's determinism machinery is pure overhead for short tasks.
- **Open-ended tasks requiring exploration during execution** — Unigen assumes workflows that are complex but change infrequently, with extremely high quality requirements. Highly dynamic workflow modification is theoretically feasible, but at current compute levels it is not practical.

## Installation

An Electron desktop application[^unigen-tauri], supporting **Windows / Linux / macOS**:

- **Recommended**: download the **portable build** for your platform from [Releases](../releases) — unzip and run.
- **Build from source**: see [Local Setup](../wiki/Local-Setup.en) in the wiki (full Ubuntu instructions provided).

**System requirements**: if you use external model APIs exclusively (built-in models disabled), the only local components are two lightweight stores — SQLite and LanceDB — so an ordinary office machine runs smoothly (reference floor: 4-core CPU / 8 GB RAM / 2 GB disk, no GPU required). **This is the recommended setup for creators.** If you enable built-in models (embedding / reranking, etc.), which models you can run depends on your hardware — see [Getting Started](../wiki/Getting-Started.en) in the wiki.

On first launch, configure your models once (settings, bottom-left) — the configuration applies to all project types.

## Core Ideas (One-Minute Version)

1. **Workflows are code (blueprints), dynamically loadable** — so both humans and the planner can modify them: the planner improves workflows precisely by editing blueprints.
2. **Planning and execution are separated** — the executor runs; the planner compiles legal paths.
3. **Code as skeleton, LLM as filler** — structure (dependencies, vocabulary, acyclicity) is hard-guaranteed by code; semantics are filled in locally by LLMs. Zero tolerance for long-chain drift.
4. **Iteration is driven by records, not guesses** — execution history is fully traceable (collected via OpenTelemetry-compatible endpoints); every improvement is grounded in real run data.

## Learn More → [Wiki](../wiki)

- **Creators**: [Getting Started](../wiki/Getting-Started.en) → create a project → click run.
- **Developers**: [Workflow Development Overview](../wiki/Developer-Guide.en)

## Contributing

- File an [Issue](../issues)
- Especially welcome: **falsify my methods with complex, real-world tasks.**

## License

AGPL-3.0.

[^unigen-tauri]: unigen-tauri is a legacy version based on [Tauri v2](https://v2.tauri.app/). Due to the current Rust ecosystem's limited support for AI development, the project has switched to Electron; the Tauri version is no longer maintained, and its documentation is being migrated in batches.
