// packages/main/src/libs/mcp/stable.ts

/**
 * 稳定序列化：对象 key 递归排序，用于配置变更检测。
 *
 * 同一份语义配置、不同 key 顺序 → 相同字符串，
 * 避免误判“配置变化”导致连接被无谓重建。
 */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        const s = JSON.stringify(value);
        return s === undefined ? "undefined" : s;
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
        .join(",")}}`;
}