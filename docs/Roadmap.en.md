[中文](Roadmap) | **English**
> 🌐 This is a translation. The **Chinese version is authoritative** — if anything here conflicts with the [Chinese original](Roadmap), the Chinese version prevails, and translations may lag behind it.



# 🧭 Roadmap

Unigen's order of advance: **deliver certain, concrete value first; hand over to the planner step by step.**

## Step 1: Carry Workflows of Real Practical Value (In Progress)

Land a batch of genuinely valuable long-chain workflows first:

- Script → Video
- Idea/Requirements → Novel
- Novel → Script
- Requirements → Code (possibly focused on a vertical, e.g., Web)

This stage is primarily hand-authored, assisted by built-in methods (Plan, etc.), while validating the platform itself: stable / efficient / flexible execution, plus workflow publication.

## Step 2: The Planner Takes Over Generation and Improvement

Advance along [[prism.en|Prism (viewpoint layer)]] → [[loom.en|Loom (transitional structure layer)]] → [[planner.en|HTN/HDDL (full structure layer)]], letting the planner handle as much of workflow creation, improvement, and maintenance as possible. Continuous improvement based on OpenTelemetry execution history also lands in this stage.

## The Ultimate Goal

**Fully automatic improvement, no human in the loop.** Further out lies the cognitive-model / world-constraint layer (see [[prism.en|Prism Reasoning]], Section 9) — a planner that knows "what is objectively impossible." Currently open research.

## The Community Feedback Most Wanted

- Verify or falsify Prism's "flattening" phenomenon with **complex, real-world tasks** ([[prism.en|Prism Reasoning]], Sections 3 and 6);
- Rigorous evaluation data under quantitative metrics;
- Task types where Prism is clearly ineffective or harmful — counterexamples are equally valuable.

---

## Why Keep Obsessing Over Prism, a "Small Trick"

Because Prism is not a quality trick — it is the minimal logical unit of the entire system. What it does — split a problem into orthogonal viewpoints, judge independently within each, then merge across them — is precisely the atomic operation of human logical reasoning: **a viewpoint is a dimension, and dimensions are the basis of logical calculus.** Facing a hard problem, a human expert does not "think harder"; they keep switching the dimensions along which they examine the problem, until it becomes obvious under some set of dimensions.

Behind this are two routes for approximating an answer: a neural network **fixes the coordinate system** and fits a composite function by gradient descent; logical reasoning **fixes the function and transforms the coordinate system** — repeatedly changing dimensions (changing basis) until the problem becomes solvable under the right coordinates. The two converge on the same destination (I conjecture their expressive power is equivalent — an open hypothesis, see [[prism.en|Prism Reasoning]], Section 4), but their processes and principles are entirely different. Unigen attempts to connect the two routes: neurons handle generation *within* dimensions; logic handles the selection, transformation, and composition *of* dimensions — call it **logic-oriented AI**.

Seen this way, today's Prism is only the **most degenerate form** of dimensional calculus: extract dimensions, evaluate per dimension, merge and refine. Real logical reasoning happens **between dimensions** — composition, transformation, constraint propagation of dimensions — which is exactly what the Loom and HTN stages will land step by step, and why this route, if it works, could trigger a new paradigm. Every brick in the foundation must be tamped solid, which is why multi-perspective empirical feedback on Prism is the most urgent need right now.

What underlies Prism is, in fact, the human capacity for logic (the process of logical decomposition and recomposition): viewpoints are dimensions, and the calculus between dimensions is logic. Unigen can therefore also be called logic-oriented AI — it attempts to connect Horn-clause-based logical inference with neuron-based generative AI, in pursuit of **ultra-long-chain, ultra-high-determinism self-evolution**. This is why multi-perspective evaluation of Prism is the most pressing need.

### Further Reading

[[Logic-Oriented-AI.en|Logic-Oriented AI]]