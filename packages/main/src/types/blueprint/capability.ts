// import { UUID } from "node:crypto";

// /**
//  * 少样本示例的子接口
//  */
// export interface FewShotExample {
//     /** 场景或该示例的简短说明（可选） */
//     scenario?: string;
//     /** 模拟的用户输入 */
//     input: string[];
//     /** 模拟 AI 在 Process 里的思考痕迹（思维链展示，可选） */
//     thoughtProcess?: string;
//     /** 完全符合验收标准的完美输出范例 */
//     output: string[];
//     kind?: "pass" | "fail"; // 默认是正确案例。
// }

// export interface Capability {
//     // ── 1. 基础元数据 ──────────────────────────────
//     id: UUID; // 唯一标识
//     /**
//      * Role (职责)
//      * @example "你是一位资深的人力资源专家"
//      */
//     role: string;

//     /**
//      * Goal (目标)
//      * @example "根据用户的身份和性别背景，精准分析其潜在的职业性格特质"
//      */
//     goal: string;
//     output: string[]; // 输出内容。
//     input: string[];  // 输入内容。
//     /**
//      * Process (处理过程 / SOP)
//      * 规范 AI 的标准作业流程
//      */
//     process: string[];
//     // # Negative Constraints / 负向提示词 严厉禁止 AI 出现的操作、用词或行为（边界线）。
//     /*
//         - 严禁使用任何带有性别歧视的词汇。
//         - 绝对不要生成含糊其辞、模棱两可的套话。
//     //*/
//     negative: string[];
//     // # Evaluation Criteria / 评分标准 规定输出质量的高低标准。
//     /*
//     ## Criteria (准则)
//         - 分析必须客观，避免刻板印象。
//         - 语言要专业且具有鼓励性。
//     //*/
//     criteria: string[];
//     // name如果以#inter::开头，后续为名称。如果是#workflow,则process中保存的内容为workflow定义。注意：#开头的名称为内部名称。
//     name: string; // "#inter::" | "#workflow";
//     fewshot: FewShotExample[];
//     created_at: string;
//     updated_at: string;
// }


export type { FewShotExample } from '$libs/utils/db/schema/capahelper.js'
export type { Capability, PartialCapa } from '$libs/utils/db/schema/capahelper2.js'