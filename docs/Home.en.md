[中文](Home) | **English**

# 🎯 Welcome to Unigen

**Unigen (Uniform Generation) lets AI complete complex, long-horizon tasks at human quality.**

From a script to a finished video. From one idea to an entire novel. From requirements to runnable code. What these tasks have in common:

- **The workflow is genuinely complex** — dozens to hundreds of steps, multiple kinds of intermediate artifacts;
- **The workflow changes infrequently** — but the quality bar is extremely high;
- **Time is not the constraint** — a single run taking days or even weeks is acceptable, **as long as quality never collapses**.

Today's mainstream ReAct-style agents are a poor fit here: a single execution is too long to gather feedback by acting one step at a time, and for sufficiently complex workflows, quality evaluation is itself a major open topic. Unigen takes a different road — **separate planning from execution; code as skeleton, LLM as filler; zero tolerance for long-chain drift.**

---

## Which Kind of User Are You?

Unigen explicitly serves two audiences — please enter through the matching door:

### 🎨 I'm a creator — I want to make things with workflows

You are a video creator, a novelist, or anyone who wants AI to do big work at high quality. What you need is a **mature workflow that is flexible and locally adjustable** — whether it was evolved by AI or written by hand is not your concern.

→ Start with [[Getting-Started.en|Getting Started]] and [[Using-Workflows.en|Running Your First Workflow]].

### 🧩 I'm a developer — I want to build / evolve workflows

You want to build high-determinism long-chain workflows for a domain, or you are interested in the direction itself: letting a planner automatically generate and improve workflows. Unigen gives you:

- A **code-based**, dynamically loadable workflow runtime;
- A built-in long-chain development method: [[prism.en|Prism: Multi-Facet Critique-Refinement]];
- A clear planner evolution path: [[loom.en|Loom: Graph-Blackboard Planning]] → [[planner.en|HTN/HDDL Symbolic Planning]].

→ Start with [[Developer-Guide.en|Workflow Development Overview]].

---

## Project Philosophy: Iterate on Records, Not Guesses

Unigen workflows are **readable, editable, publishable** structures that humans can step into directly; all execution history is collected and retained via OpenTelemetry-compatible endpoints, serving as the evidence base for human or AI improvement.

The evolution path (see [[Roadmap.en|Roadmap]]):

> Carry workflows of real practical value (primarily hand-written)
> → Planner-assisted generation and improvement
> → **Ultimate goal: fully automatic improvement with no human in the loop.**

## Project Status

Early stage. The core runtime is usable: an Electron desktop app (Windows / Linux / macOS), with portable builds downloadable from Releases. Currently ships with a built-in **Script-to-Video** project type (for testing and demonstration) and a **Blank** project type (for developers, with workflow-development capabilities built in).

The built-in reasoning methods can be tried directly in the Reflection Assistant;
the planner is progressing through three stages — Prism → Loom → HTN — with each stage's status documented on its own page.