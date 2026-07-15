[中文](prism) | **English**
> 🌐 This is a translation. The **Chinese version is authoritative** — if anything here conflicts with the [Chinese original](prism), the Chinese version prevails, and translations may lag behind it.



# Prism: A Multi-Facet Critique-Refinement Method

Current path: docs/prism.en.md
Status: early empirical stage. Positive results have been observed on several **simple generation tasks** (see Section 3), but complex tasks, quantitative metrics, and scaled cross-model comparisons are all incomplete. This document is both a method description and an open request for verification — you are welcome to falsify or correct the claims below with more complex, real-world tasks.

---

## 1. Motivation: CoT's Problem Is Not "Too Little Thinking" but "Only One Viewpoint"

Chain-of-Thought makes the model write out its reasoning, and it does improve quality. But it has a structural weakness: **it is a single, unidirectional chain**. Any perspective bias, omission, or early error on the chain is carried all the way to the end — the model never gets a chance to step to a different vantage point and re-examine itself. It "thinks more clearly," but never "thinks it over again from another angle."

Human experts do not work this way. After writing a piece of code, an expert reviews it from several **mutually distinct viewpoints** — "is the syntax correct," "is the structure sound," "are edge cases covered," "is the performance acceptable" — each viewpoint being an independent check with its own dedicated standard, rather than cramming every concern into one chain of thought.

Prism makes this explicit: **answer first, then critique from multiple orthogonal viewpoints separately, and finally merge and rewrite.**

---

## 2. Method: Draft → Facet Split → Per-Facet Critique → Merge-Refine

Prism is a four-stage **reflection loop** (note: it is not ReAct — it takes no external actions; everything is model-internal introspection. ReAct's quality comes from external ground truth; Prism's quality comes from the orthogonality of viewpoints and the independence of critiques):

1. **Draft**: respond to the user normally to obtain a first draft. Equivalent to "give an answer first."
2. **Facet Split**: for the question "what would make an answer to this problem good," derive 2–5 **orthogonal viewpoints** (facets). For example, a promotional-copy task splits into `angle of approach` / `emotional hook` / `logical soundness` / `audience fit`; a poetry-imitation task splits into `imagery` / `meter` / `emotional sincerity` / `originality`. Facets are generated dynamically by the model **for the problem at hand** — not drawn from a fixed checklist.
3. **Per-Facet Critique**: each facet is assigned a dedicated "reviewer" that examines the draft **from that one angle only**, producing issues and revision suggestions. Facets are mutually independent and can run concurrently. Crucially, each critique sees both the **original user input** and the **draft**, preventing reviewers from drifting off-topic or forgetting what the user actually asked for.
4. **Merge-Refine**: aggregate all facet critiques and rewrite the final version, gated by a binary check — "did it actually get better?" If not, fall back to the draft; never revise for revision's sake.

The output is "a final version + a readable critique/change record," which is auditable by construction.

The metaphor is the name: a beam of white light (the draft) enters a prism and is decomposed into a spectrum (multiple orthogonal viewpoints); each spectral line is inspected separately, then reconverged into a purer beam (the refined version). In code, `prism` is the codename, `facet` denotes a single facet, and `draft`/`refined` denote the draft and the final version.

---

## 3. Empirical Observations (Simple Tasks, Preliminary, Not a Rigorous Evaluation)

Prism has been tried on several **open-ended generation tasks**, including: generating promotional copy from a product brief, casual poetry imitation, and continuing fiction excerpts. Observations follow — these are subjective impressions with no quantitative metrics yet, listed to solicit verification rather than to draw conclusions:

1. **Low-end models are lifted substantially, approaching — and on some facets locally exceeding — the raw output of high-end models.**
   The same weak model is unrecognizable with and without Prism. On **certain facets** (especially "sharpness of angle/approach" and "logical soundness"), a Prism-boosted low-end model can even **outperform a high-end model's single direct answer**. Conjectured reason: the value of these facets comes from "being forced to look again from a different angle," not from the model's raw capacity — and "changing angles" is exactly what Prism supplies procedurally, relatively decoupled from model size.

2. **On simple tasks, high-end and low-end models show little difference once wrapped in Prism — both are very good.**
   This is the most worth investigating. The gap between raw models is obvious; with Prism, the gap is largely erased and both converge to "quite good."

   A natural suspicion: **the tasks are simply too easy**. For easy tasks the space of "good answers" is small; once Prism carries the low-end model over the threshold, the high-end model's headroom has nowhere to show, so the two appear "flattened." If so, on **sufficiently complex** tasks the two should separate again — because complex tasks have a larger space of good answers, raw capacity becomes the bottleneck once more, and the "viewpoints" Prism supplies cannot substitute for "capacity."

   **But this is only a hypothesis. Complex tasks have not been tested.** This is exactly where this document most wants external feedback (see Section 6).

---

## 4. A More Fundamental Doubt: Capability, Complexity, Cognitive Models, and the Objective World

The "flattening" phenomenon of Section 3 pushes me toward a larger question, recorded here as **open hypotheses** — I have no verdict:

**Conjecture A: model capability and problem complexity may be two ends of the same ruler.**

"Is this model strong enough" and "how hard is this problem" are perhaps not two separate things, but a comparison on the same scale — sufficient capability solves it; insufficient capability does not. If true, Section 3's flattening has an explanation: simple tasks sit at the low end of the ruler, within reach of both large and small models; complex tasks sit at the high end, where the gap reopens.

**Conjecture B: problem complexity is not a property of the problem itself, but is determined by the "cognitive model."**

The same problem, viewed through a different cognitive framework, differs vastly in difficulty. "Complexity" is therefore not absolute — it is relative to the cognitive model held by the solver. Prism may lift weak models precisely because it **temporarily equips the model with a better cognitive model** (multiple viewpoints, per-facet critique), rather than adding capacity.

**Conjecture C: the upper bound of any cognitive model is set by the objective world — some input-to-output mappings simply do not hold.**

Ask an LLM to design a perpetual motion machine, and no matter how strong the model, how good the Prism, or how ingenious the viewpoints, it will not succeed — because **reachability from input to output is constrained by the objective world** and does not change with the reasoning method. This draws the hard boundary of Prism (and indeed all pure reasoning methods): **Prism can optimize "expression" and "angle," but cannot change "whether it is objectively reachable."** No method, however good, can construct a path the objective world does not permit.

Connecting the three: **the objective world → bounds the cognitive model → the cognitive model → determines problem complexity → complexity and capability share one ruler → determining solvability.**

Prism acts at the "cognitive model" layer: it trades for better viewpoints, so it works when the cognitive model is the bottleneck; when the bottleneck falls to "objective reachability," it is powerless.

These are conjectures, not conclusions. For some I have no answer and am still investigating. They are listed here so that Prism grows with awareness of its boundaries from day one, rather than being treated as a panacea.

---

## 5. Why It May Beat CoT on Specific Task Types (Inference + Partial Evidence)

| Dimension            | CoT                                     | Prism                                                        |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Reasoning shape      | A single unidirectional chain            | One generation + multiple orthogonal short critique chains + one convergence |
| Error propagation    | Early bias carried to the end            | The critique layer acts as a gate, catching some single-chain drift |
| Viewpoint coverage   | Depends on what the model happens to think of | Multiple orthogonal angles enforced explicitly            |
| Lifting weak models  | Limited                                  | **Empirically substantial** (Section 3)                       |
| Auditability         | Reasoning mixed into one chain, hard to localize | Each facet critique is an independent record; changes are traceable |
| Cost                 | 1 call                                   | 1 (draft) + 1 (split) + N (facets) + 1–2 (refine), ≈ N+3 calls |

The core bet: **spend a few extra calls to buy fewer structural errors + a higher floor for weak models.** It converts CoT's implicit self-doubt — squeezed into one chain — into explicit, per-angle, concurrently executable critique.

---

## 6. Suitable / Unsuitable, and the Feedback Most Wanted

- **Suitable**: open-ended generation where answers have clear quality standards jointly determined by multiple orthogonal dimensions — promotional copy, poetry/fiction imitation, solution design, reviews. The clearer the facets, the larger the gain. Preliminarily verified.
- **Unsuitable**: chit-chat, fact retrieval, single-dimension simple Q&A. The extra N+2 calls buy no improvement — pure waste. Do not wrap Prism by default; use it only when the task deserves it.
- **Not a substitute for external ground truth**: Prism's critiques come from the model itself. Tasks that need looking things up / running code / probing the environment belong to ReAct. The two are orthogonal and composable (ReAct obtains ground truth; Prism refines expression).

**The feedback this document most wants: complex-task results.** All current evidence comes from simple tasks; whether Section 3's "flattening" re-separates on complex tasks directly determines whether Conjectures A/B in Section 4 hold. Verification and data are welcome in these directions:

- Long-chain, strongly constrained, multi-step-dependent tasks (does Prism still lift weak models? do large and small models separate again?)
- Rigorous evaluation under quantitative metrics (rather than this document's subjective impressions).
- Counterexamples: task types where Prism is clearly ineffective or actively harmful — such feedback is equally valuable.

---

## 7. Known Boundaries

1. **The ceiling of self-critique = the model's own capability.** Errors the model cannot see will not surface no matter how many viewpoints you split. Prism reduces "thinking one-sidedly," not "fundamentally not knowing how."
2. **Objective unreachability cannot be rescued** (Conjecture C, Section 4). Prism cannot change whether input-to-output holds objectively.
3. **Facets may be non-orthogonal or padded.** Deduplication and a cap (≤5) must be enforced at the code layer.
4. **Refinement may make things worse.** A binary "did it actually improve" gate with fallback is mandatory; at most 1–2 rounds.
5. **The cost genuinely multiplies.** This is inherent to the method, not a bug; whether to use it depends on whether the task warrants it.
6. **Current evidence is limited to simple tasks and subjective judgment.** Scaling, quantification, and complex tasks all remain to be done.

---

## 8. Relation to Existing Methods

Prism is not a brand-new invention; it is **a generalized positioning of a specific combination**:

- Facet splitting ← inspired by G-Eval (LLM self-authored evaluation dimensions) and Branch-Solve-Merge (branch → solve → merge)
- The generate–critique–refine loop ← inspired by Self-Refine / Reflexion

What is new is the synthesis: a **plug-and-play reasoning shell, like CoT** — any single generation can be wrapped as `prism(generate)` without hand-writing evaluation logic per task. G-Eval evaluates without revising; BSM is task decomposition; Self-Refine does not emphasize viewpoint splitting — none of the three positions itself as "a general-purpose replacement for CoT." That positioning is what Prism supplies.

---

## 9. Roadmap: From Prism to a Cognitive Model Constrained by the Objective World

Prism is the **starting point** of this route, not its destination. It addresses "viewpoint poverty in single-point generation," but Section 4's conjectures point at a larger goal: making planning itself subject to "cognitive models" and ultimately "the objective world." Three stages:

- **Stage 1 · Prism (current): the viewpoint layer.**
  General multi-facet critique-refinement, lifting single-point generation quality, replacing CoT. Run it as a standalone method first and gather broad empirical feedback — especially on complex tasks. The critique/change records it produces are, by construction, training and reference data for later stages.

- **Stage 2 · Prism → HTN: the structure layer.**
  Promote Prism's "facet splitting" from "evaluation viewpoints" to "task-decomposition viewpoints," driving method generation and convergence for Hierarchical Task Networks (HTN) (see docs/planner.en.md). Here Prism no longer optimizes a piece of text; it optimizes "which subgoals a goal should decompose into." **Hard structural guarantees (vocabulary alignment, cycle detection, controlled recursion, AND-OR backtracking) are carried by the code skeleton; Prism supplies only semantics** — i.e., "keep it as the generator; do not let it be the architect."

- **Stage 3 · HTN → cognitive model: the world-constraint layer.**
  Introduce an explicit **cognitive model** into the planner: input-to-output reachability is no longer judged by LLM intuition alone but is checked against a layer of objective constraints (Conjecture C, Section 4 — a perpetual-motion-style goal should be ruled unreachable at compile time, rather than generated and failed repeatedly). This layer is a natural extension of HTN precondition/effect models, ultimately pointing toward "a planner that knows what is objectively impossible." Most of this stage is open research; no mature solution exists.

The route in one sentence: **Prism optimizes "how to think," HTN constrains "how to decompose," and the cognitive model delimits "what is objectively reachable."** Three layers from soft to hard, progressively converging uncertainty into determinism.

---

This document will be updated as evidence accumulates. Any judgment falsified by real tasks — especially the hypotheses of Sections 3 and 4 — will be explicitly marked as corrected, not silently rewritten. If you have verified or overturned the conjectures here with complex tasks, that data is exactly what this document is asking for.

## 10. A Prism Execution

To try it yourself: open or create any project in Unigen, and in the Reflection Assistant on the right enter `/prism your instruction`.

Note: there is also a `preprism` command, which creates the evaluation dimensions **in advance**, so even the first draft is constrained by them.

| | prism | preprism |
|---|---|---|
| Effort spent | After answering (multi-round critique-refinement) | Before writing (domain reconnaissance → expert-persona draft) |
| Split based on | query + **draft** (evaluation viewpoints) | query only (answer dimensions + terminology + best method) |
| Draft system prompt | None (neutral) | Dynamically assembled expert prompt |
| Refinement rounds | ≤2 | Fixed at 1 |
| Reuse | | Dimensions both guide generation (into the system prompt) and drive critique (the same `Dimension` set), guaranteeing "evaluated by the same standard it was written to" |