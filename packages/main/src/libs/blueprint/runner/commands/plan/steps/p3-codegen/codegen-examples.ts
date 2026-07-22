/**
 * 代码生成器的参考样本（非 few-shot runtime，纯粹教 LLM 输出什么风格的代码）。
 * 一个纯机械操作样本 + 一个含 LLM 调用的 reduce 样本。
 */

export const CODEGEN_EXAMPLES: Array<{
    flowKind: string;
    intent: string;
    inputs: string[];
    outputs: string[];
    promptPairs: Array<{ system: string; user: string }>;
    code: string;
}> = [
        {
            flowKind: "MECHANICAL",
            intent: "将一段剧本按行拆分为段落数组，每段带 id 与 token 估算",
            inputs: ["剧本"],
            outputs: ["段落清单"],
            promptPairs: [],
            code: `function formatId(n) {
    return \`P\${String(n).padStart(3, '0')}\`;
}

function isCJKRange(cp) {
    return (
        (cp >= 0x4e00 && cp <= 0x9fff) ||
        (cp >= 0x3400 && cp <= 0x4dbf) ||
        (cp >= 0x20000 && cp <= 0x2a6df) ||
        (cp >= 0x3040 && cp <= 0x30ff) ||
        (cp >= 0xac00 && cp <= 0xd7af) ||
        (cp >= 0x3000 && cp <= 0x303f) ||
        (cp >= 0xff00 && cp <= 0xffef) ||
        (cp >= 0x2e80 && cp <= 0x2eff)
    );
}

function estimateTokens(text) {
    let count = 0;
    for (const char of text) {
        const cp = char.codePointAt(0) ?? 0;
        if (isCJKRange(cp)) count += 1;
        else if (cp <= 0x7f) count += 0.25;
        else count += 2;
    }
    return Math.ceil(count);
}

const ioinfo = glossary.getIO(cap);
if (!ioinfo.expired) return;

const scripts = ioinfo.inputs[0];
let startId = 0;
const output = [];

scripts.forEach((s) => {
    if (!util.isString(s.item)) {
        err.throwPrecondition("[split] 传入了非字符串的剧本。");
    }
    const lines = s.item.split('\\n');
    const paragraphs = lines.map((text, i) => ({
        id: formatId(startId + i + 1),
        index: startId + i,
        text,
        ests: estimateTokens(text),
    }));
    output.push(...paragraphs);
    startId += paragraphs.length;
});

glossary.save(cap.output[0], output);`,
        },
        {
            flowKind: "ARRAY_TO_SCALAR",
            intent: "对每条访谈摘要调用 LLM 提炼共性，再聚合为一份洞察报告",
            inputs: ["访谈摘要清单"],
            outputs: ["洞察报告"],
            promptPairs: [
                {
                    system: "你是资深访谈分析师，善于从单场访谈中提炼可复用的洞察点。",
                    user: "你正在处理集合中的一条访谈摘要。请提炼其中最关键的一个客户痛点，以自然语言陈述，不超过 50 字。",
                },
                {
                    system: "你是市场洞察报告撰写者，善于把零散痛点归纳成结构化叙述。",
                    user: "你正在聚合多条痛点陈述。请归纳共性、按主题聚类，输出一份连贯的 markdown 洞察报告。",
                },
            ],
            code: `const ioinfo = glossary.getIO(cap);
if (!ioinfo.expired) return;

const items = ioinfo.inputs[0];

// 提示词从 kv 动态加载（落盘键：.<nodeId>_step1_system / _user）
const sys1 = glossary.get(cap.id + '_step1_system');
const usr1 = glossary.get(cap.id + '_step1_user');

const points = await util.pMap(items, async (it) => {
    if (!util.isString(it.item)) {
        err.throwPrecondition("[reduce] 摘要不是字符串");
    }
    const ret = await llm.generate({
        instructions: sys1,
        prompt: usr1 + "\\n\\n访谈摘要：\\n" + it.item,
    });
    return ret.text;
}, { concurrency: 4 });

const sys2 = glossary.get(cap.id + '_step2_system');
const usr2 = glossary.get(cap.id + '_step2_user');

const report = await llm.generate({
    instructions: sys2,
    prompt: usr2 + "\\n\\n痛点清单：\\n" + points.join("\\n---\\n"),
});

glossary.save(cap.output[0], report.text);`,
        },
    ];