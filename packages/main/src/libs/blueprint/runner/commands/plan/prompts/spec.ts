/**
 * 【P-13 · 提示词:交付物字段级 spec(Pass1)】
 * 交付物为中心:先把最终交付物设计清楚到全部细节字段,才允许反推。
 * 工具清单由代码注入,字段形态必须与工具真实 I/O 对得上。
 */
import { z } from 'zod';
import { NAMING_SPEC } from './realize.js'; // realize.ts 已导出

export const SPEC_SYSTEM = `你是数据结构设计师。给定一个交付物(名称+说明)、需求文档、将参与产出它的真实工具清单,把该交付物固化为字段级数据结构。

规则:
1. 只设计"它是什么"的结构:每字段给出 名称/类型/是否必填/一句话定义;类型限 string/number/boolean/enum/array/object/binary-ref;
2. 二进制交付物同样固化其外壳属性字段(容器格式/时长/分辨率等)与内容寻址字段(binary-ref 指向链内产出的二进制);
3. 字段形态必须与工具清单中工具的真实输入输出兼容:工具吃不进/吐不出的形态不许设计;工具清单为空时按业界主流工具的常见 I/O 设计;
4. 验收标准中的每条正向要求,必须能落到至少一个字段上被检验;

${NAMING_SPEC}

输出格式:每字段一行,严格使用:
- 字段: <名称> ｜ 类型: <类型> ｜ 必填: 是/否 ｜ 定义: <把名称当术语定义,脱离上下文可懂,写"是什么"不写"怎么来的">`;

export const specUser = (p: {
    target: { name: string; intent: string };
    form: string;
    requirement: unknown;
    toolLines: string;
}): string =>
    `【需求文档】\n${JSON.stringify(p.requirement ?? '(缺失,以下列目标为准)', null, 2)}

【交付物(形态:${p.form})】
- 名称: ${p.target.name} ｜ 说明: ${p.target.intent}

【工具清单(真实 I/O 约束,不得设计工具无法承载的字段)】
${p.toolLines}

请固化字段级数据结构。`;

export const SPEC_FACETS = [
    { name: '验收可落地', checksWhat: '需求文档的每条验收标准都能落到某个字段上被程序检验吗?有无验收项无字段承载?有无字段不对应任何需求(多设计)?' },
    { name: '工具可行性', checksWhat: '每个字段的形态,清单中(或业界主流)工具真的吃得进/吐得出吗?binary-ref 指向的二进制确实能由工具产出吗?' },
    { name: '命名具体性', checksWhat: '逐字段查名称:是否泛化(数据/内容/结果等)?能否锚定到唯一具体语义(必要时自造词)?彼此正交无重复?' },
    { name: '定义自足性', checksWhat: '专查每字段"定义":脱离本对话可独立理解吗?是信息非动作吗?写了"怎么来的"吗?有失效指涉吗?' },
] as const;

const FieldSchema = z.object({
    name: z.string().describe('「字段:」后的名称,原样搬运'),
    type: z.enum(['string', 'number', 'boolean', 'enum', 'array', 'object', 'binary-ref'])
        .describe('「类型:」后的类型'),
    required: z.boolean().describe('「必填:」是→true,否→false'),
    intent: z.string().describe('「定义:」后的术语定义,原样搬运'),
});

export const SpecSchema = z.object({
    fields: z.array(FieldSchema).describe('逐字段,保持原有顺序'),
});
export type SpecOut = z.infer<typeof SpecSchema>;