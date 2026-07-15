[中文](Logic-Oriented-AI) | **English**
> 🌐 This is a translation. The **Chinese version is authoritative** — if anything here conflicts with the [Chinese original](Logic-Oriented-AI), the Chinese version prevails, and translations may lag behind it.


# 🧮 Logic-Oriented AI: Dimensions, Coordinate Systems, and Two Kinds of Approximation

Current path: wiki/Logic-Oriented-AI.en.md

Status: open hypotheses. This page is the worldview behind all of Unigen's engineering decisions, deliberately kept separate from the engineering docs. Claims here are sorted into **three tiers — theorem-backed, belief-level, and theorem-refuted** — each labeled; anything falsified will be explicitly corrected. You may reject this page entirely; the value of Prism/Loom/HTN stands on its own.

---

## 1. The Core Intuition: Complexity May Be a Disguise Worn by a Bad Coordinate System

Start with one of mathematics' oldest moves — **substitution**:

∫f(x)dx is intractable; substitute u=g(x), and it suddenly becomes ∫h(u)du, solved in one step. The function didn't change, the values didn't change — only the coordinate system changed, and the problem "vanished."

The same vector is (3, 4) in Cartesian coordinates and (5, 53.13°) in polar — **the value is unchanged; only its expression changed**. Generalizing: a mapping y = f(x) may look extremely complex in the original coordinates, but if there exists a transformation T under which T(y) relates simply to T(x), then solving f reduces to finding T.

The history of science replays this scene again and again: before Newton, celestial motion and falling apples followed two separate rulebooks; introduce the coordinates of "universal gravitation + calculus," and the **laws** of the entire macroscopic world collapse into F=ma. In such cases, f was never complex — it was merely disguised as complex by a bad coordinate system.

But this intuition has strict limits of validity (see Section 4) and must not be generalized without qualification. First, the engineering contrast it motivates.

## 2. Two Routes: Both "Compile + Execute" — What Differs Is What Gets Compiled

First, rule out a level-of-analysis trap: one might say "every layer of a neural network is also a coordinate transformation — deep learning *is* representation learning." True at the level of the **function's internal structure**, but irrelevant here — those layer-wise transformations belong to **the fitted answer itself**, not to the solver's reformulation of the problem. This page is concerned, throughout, with coordinate systems at the **solver level**.

At the solver level, the two routes are in fact **symmetric** — both split into a build phase (train/compile) and an execution phase (predict/run):

**Neural networks: compiling = filling in coefficients within a pre-committed coordinate system.** The moment the architecture is fixed, the parameter space — its dimensionality, its metric — is frozen; however long training runs, it only adjusts numbers inside this unchanging high-dimensional frame. Feature adaptation during training does exist (it is why deep learning beats fixed-basis fitting), but it stays confined within the pre-committed space. Compilation happens **once and is amortized over all problems**; execution is a single forward pass — pure function evaluation — and the artifact is unreadable weights. [^2]

**Logic: compiling = searching for the coordinate-transformation sequence itself.** Facing a problem (class), logic re-selects the dimensions of examination and re-constructs the concept mappings — at compile time it invents a "Fourier basis" specific to the problem: decompose the problem into components (dimensions), equip each component with a transformation function (concept mapping), so that the recomposed form becomes minimal. The compilation artifact is the **reasoning chain / proof / workflow** — viewed as a composite function, one of potentially very high degree. Execution then **runs this sequence once**: cost on the same order as a single forward pass, and the artifact is **reusable within its problem class**.

So the real watershed is neither "whether coordinate transformations happen" nor "which side is more expensive to solve with" — it is **what the compile phase searches for, and what the artifact looks like**:

|                          | Neural networks (gradient descent)                                  | Logical reasoning (coordinate-transformation compilation)             |
| ------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| What gets compiled       | **Coefficients**: the coordinate system is pre-committed; training only fills in numbers within it | **The coordinate system itself**: search for a transformation sequence until the problem becomes obviously solvable under some set of dimensions |
| Amortization granularity | Compiled once, serving all problems                                 | Compiled per problem class, reused within the class, incrementally recompilable |
| Compilation artifact     | Unreadable weights; can only be retrained wholesale                 | Readable workflow / reasoning chain; auditable, modifiable node by node |
| Execution form           | One forward pass (pure function evaluation; no mid-course checks can be inserted) | Running a program (verification nodes, branches, local rollback can be embedded) |
| Where complexity hides   | In the coefficients (the values of billions of parameters)          | In the transformation sequence (the structure of the workflow)         |
| Failure mode             | Local optima, uninterpretability, out-of-distribution collapse      | No good coordinate system found — or proven not to exist               |

An analogy: **gradient descent compresses the way through the entire terrain into muscle memory once, then walks with eyes closed; logic draws a readable map for each maze, then walks by the map.** The former compiles once for all mazes but cannot say why it walks this way; the latter maps maze by maze, yet every step can be pointed at and corrected — and the same map serves that whole class of mazes.

Note: **the two are trivially equivalent in expressive power in the computability sense** (both neural networks and Horn clauses are Turing-complete) — that is not this page's open question. The genuine open question is **compilation efficiency**: on the problem classes we actually care about, does coordinate-system search admit heuristics cheaper than brute-force fitting? [^1]

What can be confirmed: each has irreplaceable strengths — neurons excel at generation and pattern completion *within* dimensions; logic excels at the selection, transformation, and consistency maintenance *of* dimensions.

## 3. Logic Is Recursive Coordinate Transformation; Concepts Are Transformation Functions

Prism's "facets" are not a prompting trick. Splitting "is this answer good" into `logical soundness / emotional hook / audience fit` is, in essence, choosing a set of **coordinate axes** for the answer space:

- Each viewpoint is a dimension;
- Judgment within a single dimension is simple;
- All the complexity lives in the relations between dimensions.

"Looking at the problem from a different angle" is, quite literally, a **coordinate transformation**. And logic's key property is that it **composes and recurses**: each recursion lifts the problem into a more abstract coordinate system; in the right one, entangled variables decouple, and complex reasoning degenerates into simple derivation.

Dig one level deeper: **concepts themselves are transformation functions**. Nouns like "human, dog, animal" are not labels but mappings — every act of categorization projects a concrete object onto a set of conceptual coordinate axes. The intension of a concept is inherently fuzzy — which is exactly why one apt analogy can make everything click: what happens in that instant is a sudden alignment of coordinate systems.

Look at the syllogism: "All men are mortal; Aristotle is a man; therefore Aristotle is mortal." The inference structure is trivial — **the entire load rests on the categorization judgment "is Aristotle a man?"** — and that judgment cannot be formalized. It is the **symbol grounding problem** that symbolic AI failed to cross for sixty years: however precise the calculus inside the symbol system, the hook between symbols and reality stays dangling.

Prism's answer is a division of labor: **hand the categorization judgment to intuition (the LLM); once categorization is done, symbolic calculation can proceed.** Neurons do the fuzzy grounding they excel at; logic does the structural calculus it excels at — this is Section 5's "connecting the two routes" at its smallest scale.

This division of labor has a property often mistaken for a fatal flaw that is in fact a strength: **logic preserves truth; it does not produce truth** — if the LLM's categorization is wrong, symbolic calculation will propagate the error with perfect legality, step by step. But that very "perfect legality" is the rescue: the syllogism run in reverse (modus tollens) — if the conclusion is falsified by reality while the inference is valid, then a premise must be wrong. A neural network's errors are smeared across billions of parameters, impossible to attribute; a logic chain's errors erupt as contradictions at specific nodes — trace back along the chain to locate the faulty categorization judgment and hand it back to the LLM for re-judgment. This is precisely science's error-correction mechanism: what gets falsified is not the logic but the hypothesis. Plug in reality checks (ReAct-style execution, running, verification), and the logic chain flips from an error amplifier into an **error locator**.

The condition for this reversal must be stated precisely. The line people tend to draw — "works for factual judgments, fails for taste judgments" — is the wrong line. "Is this scene moving?" can equally be handled by logic: once split into sufficiently fine dimensions — `pacing tension / suspense density / character empathy points` — the judgment becomes just as attributable and improvable, triggering backtracking exactly like "the code doesn't pass." Taste is not off-limits to logic.

The real boundary is: **does the judgment standard constitute a function?** The premise of "all prediction is a function" is that it must *be* a function — the same input yields the same output. As long as a consistent judge exists (even just one person's stable preferences), "more moving" is an approachable target: logic compiles it into a workflow — execute, collect feedback, trace back the premises, improve — progressively approximating that judge's judgment logic. Conversely, if the standard is inconsistent (public opinion split with no aggregation rule; the judge itself drifting), it simply does not constitute a function mathematically — **it is not that logic fails to approximate it; there is no object there to approximate**. The problem is ill-posed, and logic does not apply to it. The boundary of logic-oriented AI is not "taste" — it is "non-function."

Two points that must be honestly flagged: first, dimensional decomposition does not eliminate judgment — it only **pushes it down**: the fuzziness is pushed to a finer granularity, and the claim is "the finer the granularity, the more reliable the single-point judgment" (exactly what Prism must test empirically), while "the sum of sub-dimensions predicts the top-level standard" is itself an assumption — the reduction may be lossy. Second, "given a consistent standard, logic can always approximate it" is a belief, not a theorem — consistency guarantees the target exists, not that the cost of approximation is acceptable; this lands back on Section 2's "compilation efficiency" question. At least for work at the human level, this belief has not yet been refuted (see the constructive guarantee in Section 4).

## 4. The Target: Hallucination-Free Ultra-Long Chains, and Why It Is Reachable

First, nail down the target. Today's AI's real weakness is not "not smart enough" — it is the inability to execute ultra-long-chain tasks without hallucination: writing a novel, quality aside, is something any person can finish self-consistently, yet what AI writes falls short of the basic human baseline — character settings drift, plotlines contradict, facts get fabricated. The arithmetic reason is simple: let the per-step reliability of autoregressive generation be p; the probability of an error-free n-step chain is p^n — the longer the chain, the more inevitably hallucination erupts. The role of the logical skeleton is to convert the "error-compounding product" into a "loop where every node is checkable, fixable, and traceable" — this is exactly the "execution form" watershed in Section 2's table: a single forward pass admits no mid-course checks, whereas every node of a workflow is a mounting point for verification. Hallucination-freedom / long chains / consistency maintenance are precisely logic's home turf. **The target of logic-oriented AI is: let logic harness the LLM to achieve hallucination-free ultra-long-chain execution.**

Note the wording of the target: "hallucination-free," not "well-written." The two carry different levels of commitment. **Hallucination-freedom is an unconditional commitment** — hallucination is, at its essence, inconsistency (setting drift, mutual contradiction, fabrication), and consistency can be self-checked internally, requiring no external judge. **"Well-written" is a conditional commitment** — it requires a consistent external judgment standard: if one exists, logic can compile "better" into a workflow and progressively approximate it (Section 3); if none exists (the standard does not constitute a function), then no method can approximate it — not just logic. The boundary of the target coincides exactly with the boundary of the method's capability — evidence of this route's self-consistency, not a coincidence.

Next, delimit what this method does **not** promise. There is a larger question — "can all the complexity of the universe be compressed?" — whose answer theorems have already nailed down as pessimistic. But that is not this page's question; it need only be listed as a boundary:

- **Arbitrary functions cannot all be simplified**: the counting argument (Shannon, 1949) shows almost all functions admit no simplified representation whatsoever; "a coordinate system can always be found," as a universal claim, is false;
- **Simplifying the laws ≠ simplifying the solving**: Newton simplified the laws, yet the three-body problem still has no closed-form general solution (a theorem-level negative from Poincaré/Bruns); chaotic systems have trivially simple rules yet computationally irreducible long-term behavior. Coordinate transformations can simplify the world's rules; they do not guarantee simplifying the rules' consequences;
- **A hoped-for coordinate system can be proven nonexistent**: Einstein believed quantum weirdness was just the wrong coordinate system (local hidden variables); Bell's theorem plus experiment proved that coordinate system does not exist.

The problems these theorems fence off were never inside the target — we do not expect AI to solve what human intelligence cannot; only what humans can do is what we ask it to do. And once the problem domain is restricted to "human problems," the situation reverses completely:

**The domain of human problems comes with an existence guarantee.** Copywriting, planning, novel writing, code generation — all are problems humans constructed out of concepts and have solved over and over. Every successful human solution is a constructive proof that "a good coordinate system exists." On this domain, "there exists a coordinate system that makes the problem simple" is not a gamble but a fact already cashed in.

But two things must be kept apart: **existence ≠ cheaply findable**. That humans found coordinate systems only proves solutions exist; whether LLM + logic engine can compile them at acceptable cost remains an open hypothesis — this is exactly Section 2's "compilation efficiency" question, and the entire reason Prism's empirical tests (Section 6) exist.

## 5. Unigen's Position: Connecting the Two Routes

Unigen's "code as skeleton, LLM as filler" can be restated in this page's language:

> **Neurons handle computation within dimensions; logic handles computation between dimensions.**

That is: let the pattern-completing neural network judge and generate within a single axis, and let the structure-manipulating logical system select, transform, and compose the axes. That is what "logic-oriented AI" means.

Viewed through Section 2's compile/execute split, **the workflow is the compilation artifact of the logic side** — the engineering form of a coordinate-transformation sequence. Around it there are two pairs of routes:

**How to obtain a workflow (compile)**:

1. Have the LLM design the workflow directly — one forward pass emits the structure: cheap, but the structure itself may carry hallucinations;
2. Build the workflow via logic — dimensional decomposition, constraint propagation, symbolic calculation: expensive, but the structure is auditable.

**How to run a workflow (execute)**:

1. ReAct-style LLM self-loop — step boundaries are fuzzy, verification depends on the model's self-discipline, and long chains fall back to p^n;
2. Logic-driven / logic-guaranteed multi-step execution — step boundaries are crisp, every node mounts a check: natively long-chain-capable, hallucination-resistant.

Unigen's choice is **the logic side at both ends** — not to exclude the LLM, but to put it back where it excels: at compile time, serving as the heuristic for coordinate-system search (Section 6); at execution time, serving as in-node generation and grounding judgment (Section 3). Mapped onto the roadmap, layer by layer:

| Stage                       | Form of dimensional calculus                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Prism (now)                 | **Most degenerate form**: extract dimensions → evaluate independently per dimension → merge. Between dimensions there is only one operation: aggregation |
| Loom                        | Dimensions gain **structure**: AND/OR, dependencies, backtracking on the deliverable graph — constraint propagation between dimensions begins |
| HTN/Prolog                  | Inter-dimensional calculus is handed to a **symbolic engine**: unification, resolution, backtracking; Horn clauses as the formal carrier of dimensional relations |
| Cognitive model (long-term) | Dimensional calculus subject to **objective-world constraints**: which coordinate transformations simply do not exist in reality |

## 6. Why Prism Is the Foundation Stone

If inter-dimensional calculus is the building, Prism is the load-bearing test: it validates the most basic thing of all — **whether an LLM can, for a concrete problem, produce approximately orthogonal, on-topic dimensions, and judge reliably within a single dimension.**

In this page's language: Prism tests whether the LLM can serve as the cheap heuristic for "coordinate-system compilation" — exactly the genuine open question flagged in Section 2. If these two capabilities fail, Loom's graphs and HTN's clauses are castles in the air; if they hold (preliminary evidence positive — see [[Prism Reasoning|prism.en]], Section 3), then every later layer is just adding richer operations to the primitive called "dimension."

That is why I keep obsessing over this "small trick," and why multi-perspective empirical testing is listed as the most urgent need.

## 7. Boundaries

What on this page is confirmed, what is belief, and what has been refuted:

### Theorem- or evidence-backed

- Viewpoint splitting substantially lifts weak models' generation quality (simple-task evidence, [[prism.en.md|prism.en]], Section 3);
- Coordinate-transformation solving has abundant mature counterparts in mathematics: substitution, reparameterization, natural gradient, equivariant networks — "the right coordinate system can bypass brute-force fitting" is proven in these local settings;
- Errors in long-chain autoregressive generation compound as p^n — hallucination erupting on long tasks is an arithmetic inevitability;
- Errors on a logic chain can be traced back to specific premises via modus tollens (requires a verifiable signal, Section 3);
- "A good coordinate system exists" on the domain of human problems has a constructive guarantee (humans have solved these problems over and over, Section 4);
- Neural networks and Horn clauses are both Turing-complete in the computability sense — "expressive power" is not the watershed between the two routes;
- The structural isomorphism between HTN decomposition and Prolog SLD resolution (classical planning literature, [[planner.en.md|planner.en]], Section 6).

### Open hypotheses (may be falsified; attacks welcome)

- Good coordinate systems not only exist, but the LLM can serve as a cheap compilation heuristic (Section 2's central open question; what Prism's empirical tests target);
- The LLM's categorization judgments (symbol grounding) are reliable enough on engineering tasks, and their errors can be caught by the reality-verification loop;
- As long as the judgment standard is consistent (constitutes a function), logic can approximate it at acceptable cost; and dimensional decomposition can push fuzzy judgment down to a granularity where single-point judgment is reliable, with the sum of sub-dimensions predicting the top-level standard (Section 3; risk of lossy reduction);
- The reuse gains of a logic-compiled workflow within its problem class suffice to amortize the high cost of compilation (the workflow's generalization boundary awaits empirical testing);
- Problem complexity is relative to the cognitive model, not to the problem itself ([[prism.en.md|prism.en]], Conjecture B);
- This route can reach "ultra-long-chain, ultra-high-determinism self-evolution."

### Outside the target / fenced off by theorems (this method does not promise)

- Problems human intelligence cannot solve (the three theorem-level negatives in Section 4: arbitrary functions cannot all be simplified; simplifying the laws ≠ simplifying the solving; a specific coordinate system can be proven nonexistent);
- Problems whose judgment standard does not constitute a function — the same input yields no consistent output (public opinion split with no aggregation rule; the judge itself drifting): there is no object to approximate, the problem is ill-posed, and no method applies. Note the boundary is drawn at "non-function," not at "taste": taste targets with a consistent judge are within range (Section 3);
- Input→output mappings the objective world does not permit ([[prism.en.md|prism.en]], Conjecture C). No dimensional transformation can build a perpetual motion machine — this is the hard boundary.

[^1]: More precisely: computability equivalence is trivial, but it is silent about cost. The premise on which logic-oriented AI stands is not "logic can express everything a neural network can express" (known true, and useless), but "coordinate-system compilation admits heuristics cheaper than brute-force fitting" — if compilation itself degenerates into brute-force trial and error, the cost difference between the two routes vanishes. This premise is exactly what Prism's empirical tests measure.

[^2]: Chain-of-thought (CoT) makes LLMs look capable of "reframing on the fly," but that reframing move is itself pattern completion inside frozen weights — it **imitates** per-problem reframing rather than **executing** it at the architectural level: no explicit representation of the coordinate system, no consistency maintenance, no traceable transformation sequence. This is precisely what Unigen supplies with an external logical skeleton.
