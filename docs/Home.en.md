[中文](Home) | **English**

> 🌐 This is a translation. The **Chinese version is authoritative** — if anything conflicts with the [Chinese original](Home), the Chinese version prevails; translations may lag behind.

# 🎯 Unigen: Making AI Reliably Execute Human Workflows

**In one line**: Unigen compiles human workflows into programs an AI can execute, trading structured verification for stability on long-horizon tasks.

If a single GPT/Claude call is "one generation," Unigen is about "running a task through dozens of steps over hours or days without drifting."

---

## 1. Three Shapes of AI Applications Today

Look at today's AI product landscape and you see three parallel paths:

### ① General autonomous agents

Examples: AutoGPT, OpenClaw, Manus, Hermes, BabyAGI...

**What it does**: The model plans as it goes (ReAct) or plans first then executes (Plan-and-Execute), for arbitrary tasks.
**Pros**: Flexible; no per-task orchestration.
**Cons**: Quality on long chains is unreliable — the longer the chain, the more it drifts, forgets, fabricates. Each run is expensive; retries hurt.

### ② Vertical specialist agents

Examples: Cursor, Claude Code, Devin, v0 (Vercel), Bolt.new, Perplexity, Cline...

**What it does**: Engineers **pre-design the pipeline**; the LLM only fills specific steps.
**Pros**: Stable, predictable, commercially viable within its domain.
**Cons**: Domain-bound. Rebuilding for a new domain costs enormously — essentially "professional tool + LLM plug-in."

### ③ LLM as a traditional component

Examples: GitHub Copilot, Grammarly, Notion AI, NotebookLM, DeepL Write...

**What it does**: Inside a mature software product, the LLM is "a feature that couldn't be built before, now buildable." Users see the product; the LLM is one call behind the scenes.
**Pros**: The most stable, the least agent-like, the easiest to ship.
**Cons**: LLM capability trimmed to a single feature — can't carry complex tasks.

---

## 2. An Observation Verified Over and Over: Structure Itself Boosts Capability

We spent years building vertical specialist agents: promotional copy from a product brief, novels of hundreds of thousands of Chinese characters, script-to-video, even problems LLMs struggle with in one shot (like optimal Blackjack strategy).

The finding is consistent: **if humans design the workflow finely enough, even weak models produce stable, high-quality output.**

This matches a line of academic work — CoT, ReAct, ToT, Self-Refine, Reflexion — all pointing at the same thing: **give the model the right external structure and its effective capability rises significantly**. Capability isn't purely in the model; part of it lives in how the system organizes tasks.

---

## 3. The Real Watershed Is Not the Model — It's "Who Designs the Call Sequence"

Peel it apart. Every AI application's difference lies not in which model was picked but in **who decides the call sequence, and when**:

|                    | General agent                | Vertical agent                |
| ------------------ | ---------------------------- | ----------------------------- |
| Call sequence      | LLM plans itself             | Human engineer pre-designs    |
| Flexibility        | High                         | Low                           |
| Long-chain quality | Poor                         | High                          |
| Engineering cost   | Low (one general build)      | High (rebuild per domain)     |
| Best for           | Short, volatile, exploratory | Long, stable, demanding tasks |

Hybrids abound: Cursor is "humans set up the coding environment + LLM operates within the frame"; NotebookLM is "humans structure the note workflow + LLM generates within steps." The hybrid direction is always the same — **humans narrow the portion the LLM has to plan on its own.**

Once you see this line, Unigen's core question surfaces:

> **Can we make an LLM's self-planned call sequence approximate what a human engineer would carefully design?**

If yes, the high quality of vertical specialist agents can be automatically extended to any domain, unconstrained by engineer hours. That is Unigen's target.

---

## 4. Method: Treat Planning as a Logical Process

To make the LLM plan the way a human expert does, first see how humans do it.

When an expert designs a workflow, two things happen in their head simultaneously:

1. **Action**: decompose the task into steps and wire dependencies.
2. **Judgment**: is this step enough? Is the input complete? Is the intermediate output acceptable? Should we continue?

Both are **logical processes**. And logical processes have a formalizable skeleton — **lifting**.

### Logical order: the bridge from concrete to abstract

In traditional logic, "order" refers to the **level of reference** (first-order over individuals, second-order over properties, etc.). Unigen borrows the notion and adds one thing: **within one order, we also distinguish content** (elsewhere we call this a "dimension").

The point of lifting: **abstract a concrete object into some concept so the rules attached to that concept apply.**

This is exactly the syllogism:

- Rule: "All men are mortal" (attached to the concept "man")
- Lifting: classify "Aristotle" as "man"
- Application: "Aristotle is mortal"

Every judgment in planning follows this pattern: **lift to a concept → apply the concept's rules → obtain a judgment.**

---

## 5. Minimum Engineering Instance: DAG Executability Verification

Make it concrete. Ask the LLM to output a call sequence — natural language plus some dependencies. **You cannot directly tell whether it is executable.**

Solution: lift.

**Lift the natural-language sequence to a DAG (directed acyclic graph)** and clear rules become available:

- Acyclicity (no cyclic dependencies)
- Dependency closure (every input has a source)
- Complete delivery (terminal outputs cover the goal)
- Boundary consistency (a sub-workflow matches its parent's I/O)

These rules **are deterministic and programmable**. Write them as code and you have a **Validator**: give it a candidate call sequence, and it tells you "executable or not / what's wrong / at which step."

**Unigen's current `/plan` command is exactly this minimum implementation**:
