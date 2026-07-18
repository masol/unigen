[中文](./README.md) | **English**

> 🌐 This is a translation of the Chinese README, which is the **authoritative version**. In case of any discrepancy, the [Chinese version](./README.md) prevails; translations may lag behind.

# Unigen — Uniform Generation

**Unigen is a zero-drift execution platform designed for "ultra-long-chain, human-level quality" tasks.**

When your task is turning a script into a film, an idea into a novel, or requirements into runnable code, your enemy isn't compute power—it's **entropy (drift) over time**.

Unigen's core promise is: **zero tolerance for drift**. Unlike general-purpose, flexible agents (e.g., OpenClaw), Unigen uses a deterministic logical skeleton to govern the generation process, ensuring that over execution chains lasting days or even weeks, state is never lost, facts are never fabricated, and logic never collapses.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## Who is Unigen for?

| You are                                                              | What Unigen gives you                                                                                                                                                                                                                                         |
| :------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A Creator / End User**(Video creator, novelist, quant researcher…) | **Delivers a finished product, not just a tool.** High-quality, out-of-the-box workflows: create a project, click run, and get your result. You don't need to care if a workflow was written by a human or evolved by AI; you only care about the outcome.     |
| **A Workflow Developer**                                             | **The ability to build "drift-free" long chains.** A code-based, dynamically loadable runtime, plus a built-in methodology for long-chain development, to help you build workflows with countless steps but the highest quality, and publish them to creators. |

## What Unigen is NOT for

- **Conversational, real-time agent tasks** — that is the home turf for ReAct-style frameworks (like OpenClaw); Unigen deliberately stays out.
- **Simple 3–5 step automations** — Unigen's determinism machinery is pure overhead for short tasks.
- **Open-ended tasks requiring exploration during execution** — Unigen assumes workflows are complex but change infrequently, with extremely high quality requirements. Highly dynamic workflow modification is theoretically feasible, but at current compute levels, it is not practical.

## Installation

An Electron desktop application[^unigen-tauri], supporting **Windows / Linux / macOS**:

- **Recommended**: download the **portable build** for your platform from [Releases](../../releases) — unzip and run.
- **Build from source**: see [Local Setup](../../wiki/Local-Setup.en) in the wiki (full Ubuntu instructions provided).

**System requirements**: 
- if you use external model APIs exclusively (built-in models disabled), the only local components are two lightweight stores — SQLite and LanceDB — so an ordinary office machine runs smoothly (reference floor: 4-core CPU / 8 GB RAM / 2 GB disk, no GPU required). **This is the recommended setup for creators.** 
- If you enable built-in models (embedding / reranking, etc.), which models you can run depends on your hardware — see [Getting Started](../../wiki/Getting-Started.en) in the wiki.

On first launch, configure your models once (settings, bottom-left) — the configuration applies to all project types.

## Core Philosophy (One-Minute Version)

1.  **Zero-Drift Execution** — The number one killer of long-chain tasks is "state drift". Unigen uses a logical skeleton to strictly constrain LLMs, ensuring consistency from the first step to the last, even after days of execution.
2.  **Workflows are Code (Blueprints)** — Structure is hard-guaranteed by code; semantics are filled in by LLMs. The planner improves workflows by modifying the blueprints, not by guessing.
3.  **Planning and Execution are Separated** — The executor runs; the planner compiles legal paths.
4.  **Iteration is Driven by Records** — Execution history is fully traceable (OpenTelemetry-compatible); every improvement is grounded in real run data.

## Learn More → [Wiki](../../wiki)

- **Creators**: [Getting Started](../../wiki/Getting-Started.en) → create a project → click run.
- **Developers**: [Workflow Development Overview](../../wiki/Developer-Guide.en)

## Contributing

- File an [Issue](../../issues)
- Especially welcome: **falsify my methods with complex, real-world tasks.**

## License

AGPL-3.0.

[^unigen-tauri]: unigen-tauri is a legacy version based on [Tauri v2](https://v2.tauri.app/). Due to the current Rust ecosystem's limited support for AI development, the project has switched to Electron; the Tauri version is no longer maintained, and its documentation is being migrated in batches.
