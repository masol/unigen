/**
 * 编译验证：用 vm.Script 包 with(runtime) 模板，parse 即合格。
 * 只验证语法合法，不执行、不注入 runtime。
 */

import vm from "node:vm";

export interface CompileResult {
    ok: boolean;
    error?: string;
}

export function compileCode(code: string): CompileResult {
    const wrapped = `(async function (__ioc__) {
  with (__ioc__) {

${code}

  }
})`;
    try {
        new vm.Script(wrapped, { filename: "<codegen>" });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}