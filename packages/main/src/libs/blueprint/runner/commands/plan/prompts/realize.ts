/**
 * ============================================================================
 * 【P-12 · 提示词:实现路径判定(形态分流+链路规划版)】
 * ============================================================================
 * FORM    形态分类(极简,单次,哨兵输出)。判据:LLM 的原始输出能否直接就是该
 *         文件本身。文本芯二进制壳(doc/pdf/xlsx等)一律 binary。
 * COMPOSE 文本成分拆解(Prism 收敛,不变)。
 * CHAIN   二进制链路规划(Prism 收敛):一次规划从纯文本输入到目标二进制的完整
 *         程序调用图。外部输入只许文本(name-intent),以最短路径为中心;
 *         文本输入回到文本侧递归——两个世界经纯文本接口缝合。
 * 中间轮全部自然语言,仅 EXTRACT 出 JSON;链路图经代码确定性校验。
 */
import { z } from 'zod';
import { FORM_BINARY, FORM_OTHER, FORM_TEXT, NO_ISSUE_MARK } from '../config.js';

/* ==================== FORM:形态分类(极简,单次) ==================== */

export const FORM_SYSTEM = `判断给定交付物的形态,只回答一个标记,不做任何解释。

唯一判据:一个 LLM 逐字输出的内容,能否直接保存为这个交付物本身?

${FORM_TEXT} —— 能。纯字符文本:文章/脚本/大纲/JSON/代码/提示词/markdown/srt字幕/csv 等。
${FORM_BINARY} —— 不能,但它是数字文件。包括两类:
  · 天然二进制:视频/音频/图像/压缩包等;
  · 文本芯二进制壳:doc/docx/pdf/xlsx/pptx/epub 等——内容核心是文本,但文件本身是容器格式,LLM 无法直接输出,需要程序把文本转换/封装成该格式。
${FORM_OTHER} —— 不是数字文件:实体物品/真人行为/线下活动等。

注意:判据是"最终文件的存在形式",与内容难度无关;"要求交付 word 文档的文章"是 ${FORM_BINARY},"文章内容本身"才是 ${FORM_TEXT}。`;

export const formUser = (t: { name: string; intent: string }): string =>
    `- 名称: ${t.name} ｜ 说明: ${t.intent}\n\n它的形态是?`;

/* ==================== COMPOSE:文本成分拆解(不变) ==================== */

export const DIRECT_MARK = '[[direct]]';

export const COMPOSE_SYSTEM = `你是文本结构分析员。给定一个【文本类交付物】,回答:这个文本由哪些部分构成?

先做一个判断:
- 若它是单一、连贯的一体成文(一次写作即可完成,不存在性质不同的组成部分),则整份输出只写一行:${DIRECT_MARK}
- 否则,拆出它的构成部分。

拆分规则:
1. 部分是"构成整体的更小文本",每个部分自身也是一份可独立描述的文本交付物;
2. 每个部分必须比整体更小、更单纯——拆出与整体一样大或一样复合的部分等于没拆;
3. 只拆一层:不拆部分的部分(后续会对每个部分递归处理);
4. 最小充分:所有部分合起来,刚好覆盖整体的全部内容,不多列;
5. 部分是"信息",不是"动作":写"分集大纲"(一个东西),不写"进行分集"(一个动作)。

输出格式(自然语言,非 ${DIRECT_MARK} 时):
一、构成部分:每项一行,严格使用:
- 名称: <简短名称> ｜ 说明: <术语定义:它是什么、做什么用的;脱离本对话可独立理解;不写它怎么来的>
二、组装说明:一句话,说明各部分齐备后如何合成整体(拼接/依模板填充/汇总改写等)。`;

export const composeUser = (p: {
    target: { name: string; intent: string };
    goal: string;
    criteria: string[];
}): string =>
    `【总目标(背景参考)】${p.goal}
【验收标准】${p.criteria.length ? p.criteria.join('; ') : '(无)'}

【文本类交付物】
- 名称: ${p.target.name} ｜ 说明: ${p.target.intent}

请分析其构成。`;

export const COMPOSE_FACETS = [
    {
        name: '拆分判断正确性',
        checksWhat:
            `该拆没拆吗——整体明显由性质不同的部分复合而成(或体量大到无法一次写就),却被判了${DIRECT_MARK}?不该拆瞎拆吗——单一连贯的一体成文被强行分解?每个部分确实比整体更小更单纯吗(拆出与整体等大等复合的部分等于没拆)?`,
    },
    {
        name: '组装充分性',
        checksWhat:
            '所有部分合起来,按"组装说明"操作,能覆盖整体"说明"承诺的全部内容吗?对照整体定义与验收标准逐项想:有没有缺件?组装说明本身成立吗(部分之间衔接得上吗)?有没有多余的部分?',
    },
    {
        name: '术语精准性',
        checksWhat:
            '专查每个部分的"说明":脱离本对话单独拿出来,能让人明白它是什么、做什么用的吗?是信息而非动作吗?有没有写"怎么来的"?有没有"上文中的"等失效指涉?各部分之间有没有两项实为同一东西?',
    },
] as const;

/* ==================== CHAIN:二进制链路规划 ==================== */

export const IMPOSSIBLE_MARK = '[[impossible]]';

export const CHAIN_SYSTEM = `你是程序链路规划师。给定一个【二进制交付物】(LLM 无法直接输出),规划一条从纯文本输入到该交付物的完整程序调用链。

【铁律:外部输入只允许文本】
整条链从外部获取的所有输入,必须全部是纯文本(LLM 可直接产出的内容:提示词/脚本/参数说明/配置/清单等)。链中任何二进制数据(视频片段/音频/图像等),必须由链内更早的程序步骤产出,绝不允许作为外部输入出现。

规划规则:
1. 链是若干程序步骤的依次调用:每一步写清用什么程序、吃哪些输入、产出什么;后续步骤可以引用前面步骤的产出;最后一步的产出必须就是目标交付物;
2. 程序优先从【可用程序清单】中选;没有合适的,可提名业界成熟的通用工具(如 视频生成API、TTS语音合成、ffmpeg、图像生成API、pandoc格式转换),并在名称后标注(需确认);严禁发明不存在或不成熟的工具;
3. 最短路径优先:步骤越少越好。若【已有文本材料】中有能直接使用的信息,直接引用其名称以缩短链路;但不要为了迁就已有材料而绕路——你可以自由要求任何新的文本输入,只要整条链最短;
4. 每一步的输入,站在"真的要调用这个程序"的角度列全:漏一项程序就跑不起来;最小充分,不多列;
5. 文本输入只需名称与说明,说明是脱离本对话依然能看懂"这个输入是什么、做什么用的"的术语定义,不写它怎么来的;
6. 确无任何程序链能产出该交付物 → 整份输出只写一行:${IMPOSSIBLE_MARK} + 一句原因。

输出格式(自然语言):
一、调用序列:每步一行,严格使用:
- 第N步 ｜ 程序: <名称> ｜ 输入: <逗号分隔,引用文本输入或前面步骤的产出名称> ｜ 产出: <名称>: <一句话说明>
(最后一步的产出即目标交付物)
二、文本输入清单:链中所有外部文本输入,每项一行,严格使用:
- 名称: <简短名称> ｜ 说明: <术语定义,脱离本对话可独立理解>`;

export const chainUser = (p: {
    target: { name: string; intent: string };
    goal: string;
    criteria: string[];
    availablePrograms: string;
    availableTexts: string;   // 已有文本材料摘要(name｜intent 行),无则 '(无)'
}): string =>
    `【总目标(背景参考)】${p.goal}
【验收标准】${p.criteria.length ? p.criteria.join('; ') : '(无)'}

【二进制交付物】
- 名称: ${p.target.name} ｜ 说明: ${p.target.intent}

【可用程序清单】
${p.availablePrograms}

【已有文本材料(可直接引用以缩短链路,不强求使用)】
${p.availableTexts}

请规划调用链。`;

export const CHAIN_FACETS = [
    {
        name: '链路可行性',
        checksWhat:
            '每一步的程序真实存在且确实能完成该步的输入→产出转换吗?有没有发明不存在的工具?步骤之间衔接得上吗(每步引用的前置产出确实由更早步骤给出)?最后一步的产出真的就是目标交付物吗(格式/形态对得上验收标准吗)?可用清单里有合适的却没用吗?',
    },
    {
        name: '边界纯文本性',
        checksWhat:
            '铁律核查:文本输入清单中每一项都是 LLM 可直接产出的纯文本吗?有没有二进制素材(视频/音频/图像/文件)混进了外部输入?链中出现的每个二进制中间物,都由更早的步骤产出吗?',
    },
    {
        name: '最短路径',
        checksWhat:
            '有没有可以合并或删去的步骤(如两次转换可一步完成)?有没有为了用上已有材料而绕的路?反之,已有文本材料里能直接缩短链路的信息,用上了吗?每步输入有没有多余项?整条链还有更短的走法吗?',
    },
    {
        name: '输入完备与术语精准',
        checksWhat:
            '站在实际调用的角度逐步核对:每步输入够驱动该程序吗,漏了什么必填素材/参数?专查文本输入清单每项"说明":脱离本对话可懂吗?是信息而非动作吗?写"怎么来的"了吗?有失效指涉吗?有两项实为同一东西吗?',
    },
] as const;

/* ============ 通用:剖面批判 / 精炼(COMPOSE 与 CHAIN 共用) ============ */

export const realizeCritiqueSystem = (facet: { name: string; checksWhat: string }): string =>
    `你是「${facet.name}」视角的专职评审。
只检查:${facet.checksWhat}
只从本视角发言,不越界--只检查语义,不检查格式类问题。用自然语言写一段意见:有问题就具体指出在哪、怎么改;没有问题只回复:${NO_ISSUE_MARK}`;

export const realizeCritiqueUser = (p: {
    targetLine: string;
    extra: string;        // CHAIN:可用程序清单+已有文本材料;COMPOSE:'(无)'
    draft: string;
    facetName: string;
}): string =>
    `【目标交付物】
${p.targetLine}

【补充材料】
${p.extra}

【待审稿】
"""${p.draft}"""

请从「${p.facetName}」视角评审。`;

export const REALIZE_REFINE_SYSTEM = `你是判定稿的修订员。给定目标交付物、补充材料、当前稿、各剖面评审意见,输出修订后的完整稿。

【修订规则】
1. 只采纳确有道理的意见;意见冲突时,以"程序真实存在、链路可执行、外部输入纯文本"为最高标准;
2. 保持原稿的段落结构与行格式不变;各项仍须遵守:信息而非动作、说明脱离上下文可懂且不写来历;
3. 纯文本输出:仅输出修订稿本身,绝对禁止输出任何推理过程、补充解释或括号注释;与原稿一致的内容原样保留,不要做任何多余的说明。`;

export const realizeRefineUser = (p: {
    targetLine: string;
    extra: string;
    draft: string;
    critiques: { facet: string; text: string }[];
}): string =>
    `【目标交付物】
${p.targetLine}

【补充材料】
${p.extra}

【当前稿】
"""${p.draft}"""

【各剖面评审】
${p.critiques.map((c) => `【${c.facet}】${c.text}`).join('\n\n')}

请输出修订后的完整稿。`;

/* ==================== EXTRACT:唯一的 JSON 提取 ==================== */

const TermSchema = z.object({
    name: z.string().describe('该项「名称:」后的内容,原样搬运'),
    intent: z.string().describe('该项「说明:」后的内容,原样搬运'),
});

export const ComposeSchema = z.object({
    parts: z.array(TermSchema).describe('「构成部分」逐项:名称→name,说明→intent'),
    assembly: z.string().describe('「组装说明」一句话,原样提取'),
});
export type ComposeOut = z.infer<typeof ComposeSchema>;

export const ChainSchema = z.object({
    steps: z
        .array(
            z.object({
                program: z.string().describe('该步「程序:」后的名称,含(需确认)标注则一并保留'),
                inputs: z.array(z.string()).describe('该步「输入:」逗号分隔的名称列表,原样逐项搬运'),
                output_name: z.string().describe('该步「产出:」的名称部分'),
                output_intent: z.string().describe('该步「产出:」冒号后的一句话说明'),
            }),
        )
        .describe('「调用序列」逐步,保持原有顺序'),
    text_inputs: z.array(TermSchema).describe('「文本输入清单」逐项:名称→name,说明→intent'),
});
export type ChainOut = z.infer<typeof ChainSchema>;

// export const REALIZE_EXTRACT_SYSTEM = `你是结构提取器。把判定稿忠实转换为 JSON。只做格式转换:不增删信息、不改写措辞、不做任何再判断。`;

// export const realizeExtractUser = (draft: string): string =>
//     `判定稿:\n"""${draft}"""\n\n请转换为 JSON。`;