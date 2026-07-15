[中文](planner) | **English**
> 🌐 This is a translation. The **Chinese version is authoritative** — if anything here conflicts with the [Chinese original](planner), the Chinese version prevails, and translations may lag behind it.



# Planner Design Notes: Graph-Constrained HDDL Generation and Path Solving

Current path: docs/planner.en.md
Status: concept-validation stage. The core data pipeline (graph construction + vocabulary alignment) is under development; the solving layer is a transitional implementation.

This document records the design trade-offs and evolution direction of this system's **task planning** layer. What is described here is a route under validation, not a settled conclusion; the comparisons in this document rest on logical reasoning and architectural design, not engineering benchmarks. The industry mainstream — ReAct, Plan-and-Solve, LangGraph state machines — has extensive community practice and the test of time behind it; this route is still early, and many of its judgments await being overturned or corrected by real tasks.

---

## 1. System Positioning: Planner and Executor Separated

The system consists of two layers with clean responsibility boundaries:

- **Executor**: completes concrete complex tasks — e.g., multi-step pipelines with intermediate artifacts such as "script to video." The executor owns the actual scheduling and running of atomic actions.
- **Planner**: does not do the work itself; it **plans workflows for the executor** — compiling high-level intent into a structurally legal, dependency-explicit task path and handing it to the executor to run.

This separation yields three properties:

1. **Humans can intervene.** The workflows the planner produces are readable, editable structures that people can inspect and modify directly — not a string of LLM decisions inside a black box.
2. **AI can improve continuously.** The same workflow can later be handed to AI for further optimization based on historical performance.
3. **History is traceable.** All execution history is preserved (collected via configurable OpenTelemetry-compatible endpoints) as the evidence base for subsequent human or AI improvement. Improvement runs on real records, not guesses.

The planner's core stance: **it compiles static paths only; it does not execute dynamically.** Production fault tolerance, retries, and environment feedback all converge into the executor's (outer workflow engine's) loop:

1. The executor captures the current environment's errors, exceptions, or feedback;
2. It condenses the latest state into context and feeds it back to the planner;
3. The planner recompiles a legal path based on the new facts and returns it to the executor for continued scheduling.

---

## 2. Design Trade-off: Why "Code as Skeleton, LLM as Filler"

The route's basic assumption: **structure is maintained by conventional code; semantics are filled in locally by LLMs.** Graph topology, dependency relations, and vocabulary consistency are guaranteed by `graphology` and code logic; "what should this goal decompose into" at each step is delegated to the LLM.

Below is a comparison with mainstream planners. To be emphasized: the right column states **design intent**, not verified conclusions — most of these "advantages" are, for now, inference.

| Dimension             | Mainstream agent planners (ReAct / LangGraph)            | This route (graph-constrained HDDL generation)                                 |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Core driver           | LLM semantic intuition                                   | Code skeleton + local LLM semantic filling                                     |
| Plan/execute boundary | Interleaved; act one step, look one step                 | Separated; the planner only compiles paths                                     |
| State maintenance     | LLM simulates state mutation in long text                | Immutable fact chain; temporality via append-only facts                        |
| Long chains           | Context drift and hallucination grow with steps          | Structural constraints intercept logic cycles; **inferred** to be more stable  |
| Context cost          | Reasoning history + feedback accumulate with steps       | Per-step decomposition context is small; concurrency within topological layers |
| Degree of validation  | Large-scale engineering validation; high fault tolerance | Early stage; high demands on concept-alignment precision                       |

One addition on cost: ReAct's token growth is roughly quadratic in step count. This route's context stays small because each call performs only one micro-decomposition; the price is more calls and stricter demands on "concepts must not drift."

---

## 3. Where This Route Fits — and Where It Does Not

It does not fit open-ended, fuzzy, weakly rule-constrained generic tasks — there, ReAct's semantic intuition is actually the better fit. Its value concentrates in **high-compliance, strongly logical, many-step** deep vertical scenarios: the longer the chain and the harder the constraints, the more visible the determinism dividend of code skeletons and immutable state.

Conversely, for simple 3–5 step tasks, this route must go through environment bootstrapping, graph construction, and dependency validation — clearly heavyweight, with worse cost-effectiveness than plain ReAct. This must be stated honestly when choosing an approach.

---

## 4. Graph Model: AND-OR Graphs and Controlled Recursion

This is what distinguishes the route from an "ordinary dependency graph," and the place easiest to get wrong in early design.

### 4.1 Use an AND-OR Graph, Not a Pure AND Dependency Graph

In HTN/HDDL, a compound task typically has **multiple decomposition methods**, and planning must choose among them. If a node in the graph permits only one decomposition, `(:method)` degenerates into fixed expansion, losing "method choice" — the very core of HTN.

Node relations therefore come in two kinds:

- **OR relations**: a compound node hangs multiple candidate methods — satisfying any one suffices.
- **AND relations**: within a method there are several subtasks — all must be satisfied, respecting ordering constraints, for the method to hold.

### 4.2 Recursion Is Legal — Do Not Kill It Wholesale as a Dead Loop

An early intuition was "run DAG detection; intercept on any cycle." But in HTN, recursive methods are **legal and common**, e.g.:

```
deliver all packages = deliver one package + deliver the remaining packages
```

A blanket global-acyclicity check (`hasCycle`) would kill legal recursion together with genuine logical dead loops. Two kinds of "cycle" must be distinguished:

- **At the goal-dependency level**: acyclicity may be required, as a structural sanity check.
- **At the method-decomposition level**: controlled recursion is allowed, with dead loops prevented by a **depth cap + repeated-pattern detection** — i.e., anomaly is declared only when "the same decomposition pattern repeats more than N times along one path," not on sight of any cycle.

In engineering terms: before adding an edge, use `graphology-dag`'s `willCreateCycle(graph, src, dst)` to test first, avoiding wasteful "add — detect — roll back." Whether to admit the edge then also applies the recursion-depth / repeated-pattern rules above.

---

## 5. Vocabulary Alignment: This Route's Engineering Ceiling

HDDL demands code-level precision in predicate naming. Across multi-stage decomposition, LLMs readily coin fuzzy near-synonyms (writing `code_ready` as `is_code_finished`); once concept alignment fails, the graph fragments into disconnected islands. This is the route's most concrete risk, controlled hard at the code layer:

- **Normalization**: all state/attribute names are forced to lowercase snake_case before entering the graph.
- **Vocabulary reuse**: when calling the LLM to decompose, existing graph node IDs are passed along as an `allowed_vocabulary`, steering the LLM to reuse existing concepts rather than mint new terms.
- **Near-synonym interception**: the LLM may return raw text, but a code-layer alignment function decides whether "the new term is equivalent to an existing node." If judged equivalent, the existing ID is reused by force — no new node; low-confidence cases go to human confirmation or cautious creation, never automatic merging.

---

## 6. The Solving Layer: From LLM Simulation to Prolog Symbolic Derivation

After the planner decomposes high-level intent into graph-conformant compound tasks, methods, and atomic actions, one more step remains: "find an executable path from the HDDL." This layer's target solver advances in two stages, with Prolog as the end state.

### 6.1 Why Prolog as the HTN Solver

HTN decomposition search and Prolog's SLD resolution (top-down, depth-first, with backtracking) are structurally near-identical; the mapping is almost one-to-one:

| HTN / HDDL concept             | Prolog counterpart                                               |
| ------------------------------ | ---------------------------------------------------------------- |
| Compound task                  | Goal predicate                                                   |
| One decomposition method       | One Horn clause (rule)                                           |
| Multiple methods for one task  | Multiple clauses with the same head — natural OR (method choice) |
| Subtask sequence in a method   | Conjunction in the clause body — natural AND + ordering          |
| Primitive action               | Ground fact / clause with preconditions and effects              |
| Parameter passing across tasks | Handled automatically by unification                             |

Direct benefits:

- **AND-OR search is the engine's job.** OR backtracking across methods and AND expansion across subtasks are delegated to Prolog — no hand-maintained backtracking stack. Section 4's AND-OR graph lands here exactly as "same-head multi-clause + body conjunction."
- **The translation layer is thin.** Translating the HDDL domain compiled in graphology into Prolog clauses is nearly clause-by-clause; the engineering effort concentrates in vocabulary and predicate naming (Section 5), not search logic.
- **Tabling directly tames recursion.** Modern Prolog (e.g., SWI-Prolog) tabling (SLG resolution) memoizes subgoals: it avoids redundant derivation, and lets left recursion — which would loop forever in naive Prolog — terminate. This moves Section 7's "infinite-recursion defense" from purely outer-layer interception into a real mechanism inside the solver: the outer `graphology-dag` handles compile-time structural sanity; tabling handles solve-time termination. The two are complementary.
- **Declarative and auditable.** The same rules are human-readable and human-editable, matching the "humans can intervene, AI keeps improving" positioning.
- **Mature implementations.** Reuse the backtracking search of WAM/SWI, tuned over decades — performance is not our problem to solve.

A boundary to note: Prolog defaults to **satisfiability search** (return upon finding one legal path), not **optimal-cost search**. It guarantees "exists and conflict-free," not "optimal." If optimality or near-optimality is needed, add cost constraints, layer evaluation on top of Prolog, or switch to a heuristic symbolic planner (SHOP2, PANDA, Fast Downward). The current route pursues "certifiably legal" first; optimality is deferred.

### 6.2 Stage One (Current Transition): LLM-Simulated Prolog Derivation

- **Approach**: no Prolog VM yet. Using `zod`-constrained structured output, the LLM follows the immutable fact chain and simulates Prolog's backtracking and derivation in its chain of thought, producing an atomic action sequence. This step is a **stand-in placeholder** for the Prolog solver; its interface (input: HDDL + initial facts; output: action sequence) matches Stage Two exactly, enabling seamless replacement.
- **What it can validate**: whether vocabulary alignment is stable, whether the structure is legal (topologically sortable), whether the data pipeline is connected.
- **What it cannot guarantee**: LLM simulation lacks a symbolic solver's rigid constraints; deep backtracking can still hallucinate, and solution correctness is not guaranteed. The transitional version's capability is not the end state's capability.

### 6.3 Stage Two (Target): Prolog Symbolic Derivation (over Immutable State)

- **Solving mechanism**: after the HDDL domain is translated into Prolog clauses, the top-level task becomes the Goal and the initial facts the fact base; Prolog's SLD resolution performs the search over method choice and subtask expansion, outputting one grounded atomic action sequence. Method OR and subtask AND are both handled by engine backtracking.
- **State maintenance**: abandon destructive in-memory mutation; introduce time steps and treat world state as an append-only fact chain, e.g., `at(car, shanghai, t0)` → execute action → append `at(car, beijing, t1)`. With predicates carrying a time-step parameter, state change advances temporally through unification; side effects are eliminated, and backtracking requires no state undo.
- **Recursion and termination**: enable tabling to memoize subgoals, combined with Section 4's depth cap and repeated-pattern detection — legal recursion ("deliver all packages"-style) expands normally; pathological loops terminate or are intercepted.
- **Value delivered**: reuse the symbolic engine's decades-validated backtracking and search, outputting conflict-free action sequences along the HDDL pipeline the LLM laid down. The "determinism" gains in Section 2's table are truly realized at this stage, with Prolog plugged in.

---

## 7. Edge Cases Requiring Focused Defense

### 7.1 Infinite-Recursion Defense

- **Risk**: LLM-generated methods may introduce logical closed loops (A depends on B, B depends on A), deadlocking the solver or overflowing the stack.
- **Defense**: as in Section 4 — `willCreateCycle` pre-check before adding edges, layered with a recursion-depth cap and repeated-pattern detection. Legal recursion is admitted; pathological loops are intercepted at compile time and trigger local retry. The key here is distinguishing "legal recursion" from "dead loop" — never regress to intercepting on sight of any cycle.

### 7.2 Search Explosion from Fact-Base Bloat

- **Risk**: immutable facts keep appending; the fact base grows linearly with time steps, and long-horizon tasks may see the search space balloon.
- **Defense**: a "state snapshot and pruning" mechanism. When the executor reaches a safe milestone, historical facts are compressed into the current minimal state; old facts that no longer affect the future are dropped, and a new `t0` baseline is rebuilt. This step also gives the historical record (Section 1's OpenTelemetry retention) natural segment boundaries.

---

## 8. Current Status and Next Steps

- **The current version** first implements a planner with a G-Eval + MoA + Self-Refine structure, as the foundation for human-driven workflow refinement. First validate, in engineering practice, the value of the whole system — even hand-built long-chain workflows are highly valuable. Only afterwards introduce the planning strategy described in this document, attempting fully automatic planning and improvement.
- **In progress**: graph construction, vocabulary alignment (LexiconManager), the single-step decomposition data pipeline.
- **Transitional implementation**: the solving layer uses LLM simulation, validating only structural legality and pipeline connectivity.
- **Key hypotheses awaiting validation**: whether AND-OR graphs + controlled recursion can stably express method choice in real business; how high the vocabulary-alignment failure rate is under multi-stage decomposition — this determines whether the route holds at all.
- Whether, after the HDDL domain is translated into Prolog clauses, tabling + time-stepped fact chains can stably terminate on real business's recursive methods and yield legal paths — this determines whether Stage Two can deliver determinism.
- **Further out**: plug in a real symbolic solver to realize determinism; use OpenTelemetry-collected execution history to let humans and AI continuously improve generated workflows.

This document will be updated as validation results come in. Any judgment falsified by real tasks will be explicitly marked as corrected, not silently rewritten.
