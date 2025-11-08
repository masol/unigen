/// CogMind is not an RDF system.
/**
 * 本系统将自然语言经 spaCy 解析后，通过逻辑驱动的符号归一化转化为 Prolog 风格的嵌套三元组 AST，持久化于 SQLite；推理时动态加载至 Prolog 引擎，并支持分层逻辑编程以实现元推理。
 */

/**
 * 当前实现，未使用上述过程，而是使用LLM，但是力争保持接口不变，未来切换．
 */
class CogMind {
    // 符号对齐到内部id.
}

export const cogMind = new CogMind();

