/**
 * 代码生成参考样本（非运行时 few-shot；纯粹教 LLM 输出何种风格的代码）。
 *
 * 核心事实：inputs[i] 是裸值（string 或 string[]），数组元素直接就是字符串。
 *   - 严禁 .item / .updatedAt / JSON.parse。
 *   - 判数组用 Array.isArray，判字符串用 util.isString。
 *   - save 传裸值，禁止 {item} 包装。
 *   - 多条产出用纯字符串切分（空行分隔），不自造对象数组。
 *   - 提示词键名固定为 '_' + cap.id + '_step<N>_system' / '..._user'，前导下划线不可省。
 *
 * 样本覆盖：mechanical、map（等量）、flatmap（每条 fan-out 切分扁平化）、
 *          reduce_concat（sequential 串行后 join，聚合无 LLM）。
 *
 * 样本仅示范正确的数据存取与常见范式，不暗示"必须严格按 dataFlow 生成"。
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

// inputs[0] 是标量字符串，直接使用（不要 .item）
const script = ioinfo.inputs[0];
if (!util.isString(script)) {
    err.throwPrecondition("[split] 剧本不是字符串。");
}

const output = [];
// 遍历全部行，逐段带序号
script.split('\\n').forEach((text) => {
    output.push(\`P\${String(output.length + 1).padStart(3, '0')} | \${estimateTokens(text)}t | \${text}\`);
});

// save 裸值：输出为数组 → string[]
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

// inputs[0] 是 string[]，元素直接是字符串（不要 .item）
const items = ioinfo.inputs[0];
if (!Array.isArray(items)) {
    err.throwPrecondition("[map] 输入应为字符串数组");
}

// 提示词键名带前导 '_'
const sys1 = glossary.get('_' + cap.id + '_step1_system');
const usr1 = glossary.get('_' + cap.id + '_step1_user');

// map：遍历数组每一条逐条处理（可并行），N→N 等量
const results = await util.pMap(items, async (sentence) => {
    if (!util.isString(sentence)) {
        err.throwPrecondition("[map] 句子不是字符串");
    }
    const ret = await llm.generate({
        instructions: sys1,
        prompt: usr1 + "\\n\\n待处理数据：\\n" + sentence,
    });
    return ret.text.trim();
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

// inputs[0] 是 string[]，元素直接是字符串
const docs = ioinfo.inputs[0];
if (!Array.isArray(docs)) {
    err.throwPrecondition("[flatmap] 输入应为字符串数组");
}

// 提示词键名带前导 '_'
const sys1 = glossary.get('_' + cap.id + '_step1_system');
const usr1 = glossary.get('_' + cap.id + '_step1_user');

// flatmap：每篇原文可炸出多条语录，逐篇处理后扁平化汇总
const perDoc = await util.pMap(docs, async (doc) => {
    if (!util.isString(doc)) {
        err.throwPrecondition("[flatmap] 原文不是字符串");
    }
    const ret = await llm.generate({
        instructions: sys1,
        prompt: usr1 + "\\n\\n待分析原文：\\n" + doc,
    });
    // 提示词约定：每条语录独立成段、空行分隔。纯字符串切分为多条。
    const pieces = ret.text.split(/\\n{2,}/).map((s) => s.trim()).filter(Boolean);
    if (pieces.length === 0) {
        ctx.warn("[flatmap] 未切分出语录，回退为整段文本");
        return [ret.text.trim()];
    }
    return pieces;
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

// inputs[0] 是 string[]，元素直接是字符串
const outlines = ioinfo.inputs[0];
if (!Array.isArray(outlines)) {
    err.throwPrecondition("[reduce] 输入应为字符串数组");
}

// 提示词键名带前导 '_'
const sys1 = glossary.get('_' + cap.id + '_step1_system');
const usr1 = glossary.get('_' + cap.id + '_step1_user');

// sequential：后一章依赖前一章，必须串行 for，传入前序结果作上下文
const chapters = [];
let prevContext = "";
for (const outline of outlines) {
    if (!util.isString(outline)) {
        err.throwPrecondition("[reduce] 大纲不是字符串");
    }
    const ret = await llm.generate({
        instructions: sys1,
        prompt: usr1
            + "\\n\\n已完成的前序内容（保持连贯）：\\n" + (prevContext || "（无，这是开篇）")
            + "\\n\\n本章大纲：\\n" + outline,
    });
    chapters.push(ret.text.trim());
    prevContext = ret.text.trim();
}

// concat：各章首尾相接即成品，纯代码 join，聚合步不调 LLM
const novel = chapters.join("\\n\\n");

// save 裸值：输出为标量 → string
glossary.save(cap.output[0], novel);`,
        },
    ];