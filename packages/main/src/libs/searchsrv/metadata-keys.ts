/**
 * searchsrv 内部写入 metadata 的保留 key。
 * 外部消费者应从这里导入，避免跨层硬编码。
 */
export const SKILL_BODY_META_KEY = "__skillBody";
export const SKILL_DIR_META_KEY = "skillDir";
export const ZERO_VECTOR_META_KEY = "__zeroVector";