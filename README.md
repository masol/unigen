**English** | [中文](./docs/README_CN.md)

# UniGen: An Exploratory Natural Language Flow-Based Programming Compiler

**This is a personal experimental project** that attempts to parse users' natural language intentions into functional structures and organize them into executable dataflow graphs. The project is still in its early exploratory stage, and many ideas remain unvalidated.

---

## Motivation

While working with LLMs, I noticed a pattern: regardless of what users input, it can essentially be viewed as an implicit "function call"—there's input, an expected output, and some processing in between.

This led me to wonder: if we explicitly parse user intentions into **Input/Process/Output triplets**, might there be some benefits?

- Structured representations are easier to compose and reuse
- They could potentially interface with symbolic reasoning systems for long-chain planning
- They might be easier to verify and debug than pure Chain-of-Thought approaches

This project is an exploratory implementation of that idea.

---

## Core Ideas

### Functional Intent Parsing

Parse arbitrary natural language input into a standard triplet:

```yaml
function: translate_to_chinese
input:
  explicit: [english_text]
  implicit: {style: formal}
  type: string
process:
  - understand source semantics
  - select formal vocabulary
  - generate translation
output:
  expected: chinese_translation
  type: string
```

The design of this structure is inspired by two classical theories:

**Lambda Calculus**: The triplet can correspond to `λ input. process(input) → output`, and node composition corresponds to function composition. This isn't a rigorous formal correspondence, but it provides a useful thinking framework.

**Prolog**: Parsed triplets could be stored as fact-like structures, theoretically supporting backward chaining to automatically search for function chains. This part is still just a concept and hasn't been implemented yet.

### Dataflow Graphs

Multiple nodes connect through I/O type matching to form graphs, borrowing ideas from Flow-Based Programming. The difference from traditional FBP:

- Nodes are described in natural language rather than predefined code
- LLMs act as "universal function simulators," attempting to execute the tasks described by nodes

It should be noted that the reliability of LLM function simulation heavily depends on task clarity. Complex or ambiguous tasks are prone to errors, which is why large tasks need to be decomposed into small, well-defined nodes.

### Output-Driven Structure Optimization (Concept)

An idea not yet implemented: users provide expected outputs or output constraints, and the system uses these as an evaluation function to search for suitable node combinations. This is somewhat similar to fitness functions in genetic programming, but I'm not yet sure how far this path can go.

---

## Architecture Sketch

```
Natural Language Input
         │
         ▼
┌─────────────────────┐
│  Functional Parser  │  Parse input into I/P/O triplets
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Graph Organizer    │  Organize node connections via type matching
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌────────┐  ┌────────┐
│  LLM   │  │Compiled│  Hybrid execution (latter is a long-term goal)
│Execute │  │  Code  │
└────────┘  └────────┘
```

---

## A Simple Example

**User intent**: "Read this paper, extract key points, write a Chinese introduction"

**Possible decomposition**:

```
[Paper File] → [Extract Key Points] → [Write Chinese Intro] → [Chinese Article]
```

Each node independently defines I/P/O and can be tested separately. Whether this decomposition is optimal, and whether AI can automatically perform such decomposition, are questions that remain to be validated.

---

## Relationship to Related Work

This project is inspired by the following work:

| Approach | My Understanding |
|----------|------------------|
| Chain-of-Thought | Focuses on intermediate steps within a single reasoning pass; UniGen attempts structured composition across multiple calls |
| Flow-Based Programming | A mature dataflow programming paradigm; UniGen borrows its graph structure but differs in how nodes are defined |
| Lambda Calculus / Prolog | Provides theoretical perspectives, but UniGen's "correspondence" is still rough, not a rigorous formal mapping |

---

## Current Status and Limitations

**Status**: Conceptual exploration + early prototype

**Known limitations**:

- Accuracy of functional parsing depends on LLM capabilities; complex intentions are easily parsed incorrectly
- Automatic graph structure organization hasn't been implemented yet; currently requires manual specification
- Prolog integration is just a concept; work hasn't started
- Lacks systematic evaluation; uncertain whether this approach is actually better than existing methods

---

## Roadmap (Tentative)

- [x] Organize core ideas
- [ ] Implement basic triplet parsing
- [ ] Simple dataflow graph execution
- [ ] Explore feasibility of Prolog integration
- [ ] Conduct preliminary evaluation on some concrete tasks

---

## Why Make This Early Project Public

Mainly to document the exploration process, and hopefully to receive feedback and suggestions. If you have experience in the following areas, I'd very much welcome a conversation:

- Type systems / practical applications of lambda calculus
- Prolog / logic programming
- Flow-Based Programming in practice
- Reliability engineering for LLMs

---

## References

These are some materials that have influenced my thinking; they do not imply any formal affiliation with this project:

- Church, A. (1936). An Unsolvable Problem of Elementary Number Theory.
- Morrison, J.P. (2010). Flow-Based Programming, 2nd Edition.
- Kowalski, R. (1974). Predicate Logic as a Programming Language.
- Wei, J. et al. (2022). Chain-of-Thought Prompting Elicits Reasoning in Large Language Models.

---

## License

MIT License © 2025

---

**UniGen**: A personal experiment attempting to make natural language intentions structured and composable.
