/**
 * 代码生成参考样本（非运行时 few-shot；纯粹教 LLM 输出何种风格的代码）。
 * 覆盖：mechanical、map（等量）、flatmap（每条 fan-out 扁平化）、
 *       reduce_concat（逐条后 join，聚合无 LLM）。
 * 用于纠正两大错误：① 数组只处理第一条；② 并非所有 reduce 都需 LLM；
 *                 ③ 提取类任务每条 fan-out 出多条，不该塌缩。
 */

export const CODEGEN_EXAMPLES: Array<{
    dataFlow: string;
    intent: string;
    inputs: string[];
    outputs: string[];
    llmStepCount: number;
    code: string;
}> = [
        {
            dataFlow: "mechanical",
            intent: "将一段剧本按行拆分为段落数组，每段带序号与 token 估算",
            inputs: ["剧本"],
            outputs: ["段落清单"],
            llmStepCount: 0,
            code: `function estimateTokens(text) {
    let count = 0;
    for (const char of text) {
        const cp = char.codePointAt(0) ?? 0;
        if (cp >= 0x4e00 && cp <= 0x9fff) count += 1;
        else if (cp <= 0x7f) count += 0.25;
        else count += 2;
    }
    return Math.ceil(count);
}

const ioinfo = glossary.getIO(cap);
if (!ioinfo.expired) return;

const scripts = ioinfo.inputs[0];
const output = [];

// 遍历全部输入条目，不只处理第一条
scripts.forEach((s) => {
    if (!util.isString(s.item)) {
        err.throwPrecondition("[split] 传入了非字符串的剧本。");
    }
    s.item.split('\\n').forEach((text) => {
        output.push(\`P\${String(output.length + 1).padStart(3, '0')} | \${estimateTokens(text)}t | \${text}\`);
    });
});

// save 裸值：输出 isArray=true → string[]
glossary.save(cap.output[0], output);`,
        },
        {
            dataFlow: "map",
            intent: "把一批英文句子逐条翻译为中文，产出等量译文",
            inputs: ["英文句子清单"],
            outputs: ["中文译文清单"],
            llmStepCount: 1,
            code: `const ioinfo = glossary.getIO(cap);
if (!ioinfo.expired) return;

const items = ioinfo.inputs[0];

const sys1 = glossary.get(cap.id + '_step1_system');
const usr1 = glossary.get(cap.id + '_step1_user');

// map：遍历数组每一条逐条处理（可并行），N→N 等量
const results = await util.pMap(items, async (it) => {
    if (!util.isString(it.item)) {
        err.throwPrecondition("[map] 句子不是字符串");
    }
    const ret = await llm.generate({
        instructions: sys1,
        prompt: usr1 + "\\n\\n待处理数据：\\n" + it.item,
    });
    return ret.text;
}, { concurrency: 4 });

glossary.save(cap.output[0], results);`,
        },
        {
            dataFlow: "flatmap",
            intent: "从每篇访谈原文中提取多条带标签的反馈语句，汇总为一个大清单",
            inputs: ["访谈原文集"],
            outputs: ["反馈语录集"],
            llmStepCount: 1,
            code: `const ioinfo = glossary.getIO(cap);
if (!ioinfo.expired) return;

const docs = ioinfo.inputs[0];

const sys1 = glossary.get(cap.id + '_step1_system');
const usr1 = glossary.get(cap.id + '_step1_user');

// flatmap：每篇原文可炸出多条语录，逐篇处理后扁平化汇总
const perDoc = await util.pMap(docs, async (it) => {
    if (!util.isString(it.item)) {
        err.throwPrecondition("[flatmap] 原文不是字符串");
    }
    const ret = await llm.generate({
        instructions: sys1,
        prompt: usr1 + "\\n\\n待分析原文：\\n" + it.item,
    });
    // 一条输入 → 多条结果：safefmt 固定用 z.array(z.string()) 提取
    const fmt = await llm.safefmt(
        ret.text,
        llm.Output.object({ schema: z.array(z.string()).describe("从原文提取的每一条反馈语句") }),
    );
    if (fmt.success && fmt.value?.output) return fmt.value.output;
    // 兜底：提取失败不丢数据，保留原文本为单条
    ctx.warn("[flatmap] 语录提取失败，回退为单条原文");
    return [ret.text];
}, { concurrency: 4 });

// 扁平化：把各篇的多条语录合并为一个数组
const results = perDoc.flat();

glossary.save(cap.output[0], results);`,
        },
        {
            dataFlow: "reduce_concat",
            intent: "逐章续写小说后，把各章正文按顺序拼接为整本",
            inputs: ["章节大纲清单"],
            outputs: ["小说全文"],
            llmStepCount: 1,
            code: `const ioinfo = glossary.getIO(cap);
if (!ioinfo.expired) return;

const outlines = ioinfo.inputs[0];

const sys1 = glossary.get(cap.id + '_step1_system');
const usr1 = glossary.get(cap.id + '_step1_user');

// sequential：后一章依赖前一章，必须串行 for，传入前序结果作上下文
const chapters = [];
let prevContext = "";
for (const it of outlines) {
    if (!util.isString(it.item)) {
        err.throwPrecondition("[reduce] 大纲不是字符串");
    }
    const ret = await llm.generate({
        instructions: sys1,
        prompt: usr1
            + "\\n\\n已完成的前序内容（保持连贯）：\\n" + (prevContext || "（无，这是开篇）")
            + "\\n\\n本章大纲：\\n" + it.item,
    });
    chapters.push(ret.text);
    prevContext = ret.text;
}

// concat：各章首尾相接即成品，纯代码 join，聚合步不调 LLM
const novel = chapters.join("\\n\\n");

glossary.save(cap.output[0], novel);`,
        },
    ];