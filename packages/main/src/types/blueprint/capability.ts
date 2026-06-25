import { UUID } from "node:crypto";

/**
 * 少样本示例的子接口
 */
export interface FewShotExample {
    /** 场景或该示例的简短说明（可选） */
    scenario?: string;
    /** 模拟的用户输入，类型受 TInput 约束 */
    input: string[];
    /** 模拟 AI 在 Process 里的思考痕迹（思维链展示，可选） */
    thoughtProcess?: string;
    /** 完全符合验收标准的完美输出范例，类型受 TOutput 约束 */
    output: string[];
    kind: "pass" | "fail";
}

export interface Capability {
    // ── 1. 基础元数据 ──────────────────────────────
    id: UUID; // 唯一标识
    /**
     * Role (职责)
     * @example "你是一位资深的人力资源专家"
     */
    role: string;

    /**
     * Goal (目标)
     * @example "根据用户的身份和性别背景，精准分析其潜在的职业性格特质"
     */
    goal: string;
    output: string[]; // output.输出结构。改为text是为了复用检索。
    input: string[];
    /**
     * Process (处理过程 / SOP)
     * 规范 AI 的标准作业流程
     */
    process: string[];
    negative: string[];
    criteria: string[];
    fewshot: FewShotExample[];
    created_at: string;
    updated_at: string;
}
