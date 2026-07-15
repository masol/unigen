[中文](Logic-Oriented-AI) | **English**
> 🌐 This is a translation. The **Chinese version is authoritative** — if anything here conflicts with the [Chinese original](Logic-Oriented-AI), the Chinese version prevails, and translations may lag behind it.



# 🧮 Logic-Oriented AI: Dimensions, Coordinate Systems, and Two Kinds of Approximation

Current path: wiki/Logic-Oriented-AI.en.md

Status: open hypotheses. This page is the worldview behind all of Unigen's engineering decisions, deliberately kept separate from the engineering docs — most judgments here are **unverified**, and anything falsified will be explicitly marked as corrected. You may reject this page entirely; the value of Prism/Loom/HTN stands on its own.

---

## 1. An Observation: A Viewpoint Is a Dimension

Prism's "facets" are not a prompting trick. Splitting "is this answer good" into `logical soundness / emotional hook / audience fit` is, in essence, choosing a set of **coordinate axes** for the answer space:

Each viewpoint is a dimension; judgment within a single dimension is simple, and all the complexity lives in the relations between dimensions.

This is exactly how human logical reasoning works: split dimensions → judge within each → compose across them. "Looking at the problem from a different angle" is, quite literally, a **coordinate transformation**.

## 2. Two Routes for Approximating an Answer

|                        | Neural networks                              | Logical reasoning                                           |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Coordinate system      | **Fixed** (architecture and representation space determined) | **Variable** (dimensions of examination keep changing) |
| Solving method         | Gradient descent fitting a composite function | Transform coordinates until the problem is obviously solvable under some set of dimensions |
| Where complexity hides | In the function itself (composition of billions of parameters) | In the sequence of coordinate transformations (reasoning chain / proof) |
| Artifact               | Unreadable weights                            | Readable, auditable reasoning steps                           |
| Cost per solve         | Low (one forward pass)                        | High (many transformations and checks)                        |

The two converge on the same destination — both approximate the same "problem → answer" mapping in a high-dimensional space. **I conjecture the two are equivalent in expressive power, but this is an open hypothesis, not a conclusion.** [^1]

The only thing that can be confirmed: their processes and principles are entirely different, and each has irreplaceable strengths — neurons excel at generation and pattern completion *within* dimensions; logic excels at the selection, transformation, and consistency maintenance *of* dimensions.

## 3. Unigen's Position: Connecting the Two Routes

Unigen's "code as skeleton, LLM as filler" can be restated in this page's language:

> **Neurons handle computation within dimensions; logic handles computation between dimensions.**

That is what "logic-oriented AI" means. Mapped onto the roadmap, layer by layer:

| Stage                       | Form of dimensional calculus                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Prism (now)   | **Most degenerate form**: extract dimensions → evaluate independently per dimension → merge. Between dimensions there is only one operation: aggregation |
| Loom           | Dimensions gain **structure**: AND/OR, dependencies, backtracking on the deliverable graph — constraint propagation between dimensions begins |
| HTN/Prolog  | Inter-dimensional calculus is handed to a **symbolic engine**: unification, resolution, backtracking; Horn clauses as the formal carrier of dimensional relations |
| Cognitive model (long-term) | Dimensional calculus subject to **objective-world constraints**: which coordinate transformations simply do not exist in reality |

## 4. Why Prism Is the Foundation Stone

If inter-dimensional calculus is the building, Prism is the load-bearing test: it validates the most basic thing of all — **whether an LLM can, for a concrete problem, produce orthogonal, on-topic dimensions, and judge reliably within a single dimension.**

These two capabilities are the precondition for all subsequent dimensional calculus. If they fail, Loom's graphs and HTN's clauses are castles in the air; if they hold (preliminary evidence positive — see [[Prism Reasoning|prism.en]], Section 3), then every later layer is just adding richer operations to the primitive called "dimension."

That is why I keep obsessing over this "small trick," and why multi-perspective empirical feedback is listed as the most urgent need.

## 5. Boundaries

What on this page is confirmed, and what is conjecture:

**Reasonably confident** (preliminary evidence or mature theory):

- Viewpoint splitting substantially lifts weak models' generation quality (simple-task evidence, [[prism.en.md|prism.en]], Section 3);
- The structural isomorphism between HTN decomposition and Prolog SLD resolution (classical planning literature, [[planner.en.md|planner.en]], Section 6);
- Neural and symbolic approaches each have irreplaceable strengths (industry consensus).

**Open hypotheses** (may be falsified; attacks welcome):

- The neural and logical routes of approximation are equivalent in expressive power;
- Problem complexity is relative to the cognitive model, not to the problem itself ([[prism.en.md|prism.en]], Conjecture B);
- This route can reach "ultra-long-chain, ultra-high-determinism self-evolution."

**Known unreachable** (no matter how good the method):

- Input→output mappings the objective world does not permit ([[prism.en.md|prism.en]], Conjecture C). No dimensional transformation can build a perpetual motion machine — this delimits the hard boundary of logic-oriented AI.

[^1]: A rigorous mathematical equivalence (coordinate-transformation solving vs. function fitting under a fixed basis) currently has no confirmed theorem behind it — the universal approximation theorem covers only the neural side, and the logical side's counterpart (the Turing completeness of Horn clauses) is not directly comparable on the same scale.