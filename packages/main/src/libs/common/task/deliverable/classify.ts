import { CommonContext } from "$libs/common/context.js";
import { DeliverableClassifierSchema } from "$libs/common/storage/type/delivery.js";
import { ExecInput, ExecOutput } from "$libs/common/storage/type/tast.js";
import { getSmartModel } from "$libs/model/index.js";
import { NL2Format } from "$libs/model/llm/outline.js";
import { throwNotimplement, throwUnprcessable } from "$libs/utils/err.js";
import { dataCenter } from "$libs/utils/sys/data.js";
import { Output } from "ai";
import Logger from "electron-log/main.js";
import XMLBuilder from 'fast-xml-builder';
import { doMarkdown } from "./markdown.js";


export async function doClassify(input: ExecInput, cctx: CommonContext): Promise<ExecOutput> {

    // const maxSteps = cctx.storage.config.getMaxSteps();
    const builder = new XMLBuilder({
        format: true,        // 美化输出（缩进）
        indentBy: '  ',      // 缩进字符，默认是两个空格
    });
    const xml = builder.build(input);

    Logger.debug("doClassify input xml:", xml);
    const systemPrompt = await dataCenter.readPrompt("deliverable", "classify");
    if (!systemPrompt) {
        throwUnprcessable("未找到交付物分类的系统提示,请检查是否存在 deliverable/classify.md 文件。");
    }

    const classifyResult = await NL2Format({
        model: getSmartModel(undefined, cctx.ctx),
        instructions: systemPrompt,
        temperature: 0,
        output: Output.object({ schema: DeliverableClassifierSchema }),

        messages: [{ role: "user", content: xml }],
    });


    Logger.debug("doClassify dlclassify:", JSON.stringify(classifyResult.output));


    // 这里针对不同的交付物类型，选择不同的工作流进行处理。

    if (classifyResult.output.workMode === "standalone") {
        // 处理文档类型的交付物
        cctx.ctx.info("处理文档类型的交付物:", JSON.stringify(classifyResult.output, null, 2));
        throwNotimplement("文档类型的交付物处理尚未实现");
    } else if (classifyResult.output.workMode === "project") {
        // 处理代码类型的交付物
        cctx.ctx.info("处理代码类型的交付物:", JSON.stringify(classifyResult.output, null, 2));
        throwNotimplement("代码类型的交付物处理尚未实现");
    } else {
        // 处理markdown类型的交付物
        cctx.ctx.info("处理markdown类型的交付物:", JSON.stringify(classifyResult.output, null, 2));
        return await doMarkdown(input, cctx);
    }
}