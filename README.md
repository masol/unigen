**English** | [中文](docs/README.cn.md)

# UniGen: Universal Generator - An AI-Augmented Flow-Based Programming Compiler

**Summary:** Exploring the combination of Flow-Based Programming (FBP), Lambda Calculus concepts, and AI to enhance the efficiency and expressiveness of graphical programming.

## Core Ideas

UniGen is an experimental project that leverages the network structure of Flow-Based Programming (FBP) and the function composition ideas of Lambda Calculus, combined with AI capabilities, to augment the expressiveness of graphical programming:

1.  **LLM as Universal Function Simulator & Data Processor:** View Large Language Models (LLMs) as a **Universal Function Simulator**. Each FBP node encapsulates an LLM call, whose behavior is defined by a natural language **template** (Prompt). This template not only defines the node's processing logic but can also implicitly or explicitly specify how to **unpack** the output from upstream nodes to extract the data required by this node, enabling flexible data passing. (**Note: The simpler and more clearly defined the function being simulated (with explicit I/O), the higher the accuracy and reliability typically are.**)
2.  **FBP Network = Function Composition & Dataflow:** The connections between FBP nodes define dataflow, which semantically corresponds to function application and composition in Lambda Calculus (`f(g(x))`). The entire network itself is a visual representation of a complex function. The connections between nodes carry data and control flow.
3.  **Process Template = Callable Function:** The node's prompt describes its processing logic (which may include I/O examples or steps -- triggering side effects in a Monad-like manner via MCP). Placeholders (e.g., `[INPUT]`) inject upstream data, making the template a callable "function". Templates can also define unpacking rules.
4.  **Function (Behavior) Passing:** A node can output a task description (process), which can be directly used as the template for another node, achieving the passing of a "function" (behavioral instruction) like data (drawing from the first-class function concept in Lambda Calculus).
5.  **Consistent State Management via Prolog/CLP (Future):** The current version focuses on explicit, one-time data passing between nodes. Future versions will explore introducing **global state(State Monad)** management. By drawing inspiration from **Prolog** (and its extension **Constraint Logic Programming - CLP**), it will allow defining variables and their required **logical constraints** using **natural language** at the workflow level (e.g., via special nodes or global configuration). Internally, a fact database akin to Prolog will be maintained, and its reasoning engine used to automatically ensure these constraints remain **consistent** throughout workflow execution. This effectively unifies the traditionally separate "database" and "model maintenance code" under a Prolog engine. (**Note: While logically sound, this approach can be performance-intensive; long-term goals include compiler optimizations to address this. Global variables and such consistency constraints are not supported in the current version.**)
6.  **Compilation Optimization & Hybrid Execution (Future):** The project plans to explore compiling certain nodes (especially those with clear, formalizable logic, i.e., "Terminals") into efficient Python/C++ code in the future, creating a hybrid execution model combining AI calls and compiled code. The data unpacking logic might also be compiled to improve efficiency.  

## Key Benefits

*   **Intuitive Design:** Define node behavior declaratively using natural language templates derived from examples.
*   **Flexible Composition:** Easily build complex workflows by connecting nodes.
*   **AI-Native:** Leverages the general problem-understanding capabilities of LLMs.
*   **Function Reuse & Passing:** Nodes can dynamically generate or pass behavioral instructions to other nodes.
*   **Hybrid Efficiency (Planned):** Potential to compile performance-critical parts to native code.

## Vision

Enable users to capture and automate structured human thought processes (e.g., writing papers, coding, novel writing) by:
1.  Visually designing the workflow (data flow graph).
2.  Defining node functions via templated natural language descriptions (potentially auto-generated/suggested by AI).
3.  Letting UniGen compile and execute the workflow, combining LLM inference with compiled components.

## Limitations / Scope

*   **Captures Static Knowledge:** UniGen excels at固化 (solidifying/capturing) existing, well-defined human workflows and methodologies.
*   **No Autonomous Evolution (Currently):** It does **not** inherently possess the capability to self-improve or discover better methods beyond its initial programming/specification. If the underlying human methodology evolves, the UniGen workflow typically needs manual updating.

## Status

**Conceptual / Early Development**

This is a conceptual exploration and early-stage implementation. Contributions and feedback are welcome!

---

## 📄 License

MIT License © 2025 lizhutang contributors

---

**UniGen**: Visually compose AI workflows by combining FBP and Lambda Calculus with LLM-powered nodes.