import { CommonContext } from "$libs/common/context.js";
import { SubOntology } from "$libs/common/storage/goal.js";
import { ExecInput, ExecOutput } from "$libs/common/storage/type/tast.js";
import { getSmartModel } from "$libs/model/index.js";
import { configService } from "$libs/store/index.js";
import { dataCenter } from "$libs/utils/sys/data.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import XMLBuilder from 'fast-xml-builder';
import pMap from "p-map";


export async function doMarkdown(input: ExecInput, cctx: CommonContext): Promise<ExecOutput> {

    // const maxSteps = cctx.storage.config.getMaxSteps();
    const builder = new XMLBuilder({
        format: true,        // 美化输出（缩进）
        indentBy: '  ',      // 缩进字符，默认是两个空格
    });
    const xml = builder.build(input);

    Logger.debug("ontology input xml:", xml);
    const systemPrompt = await dataCenter.ensurePrompt("deliverable", "md-plan", "ontology");
    const { text: classifyResult } = await generateText({
        model: getSmartModel(undefined, cctx.ctx),
        instructions: systemPrompt,
        temperature: 0.5,
        messages: [{ role: "user", content: xml }],
    });


    Logger.debug("ontology result:", JSON.stringify(classifyResult));
    cctx.storage.goal.setOntologyAnalysis(classifyResult);

    // 这里并行提取。

    const userContent = `${xml}\n\n<ontology_analysis>${classifyResult}</ontology_analysis>`;

    await pMap(["terminology", "reader_assumptions", "writing_style", "format_rules", "prohibitions", "logic_relations", "methodology", "method-unit"], async (item: SubOntology) => {
        // 这里针对不同的交付物类型，选择不同的工作流进行处理。
        const systemPrompt = await dataCenter.ensurePrompt("deliverable", "md-plan", item);
        const { text: result } = await generateText({
            model: getSmartModel(undefined, cctx.ctx),
            instructions: systemPrompt,
            temperature: 0.5,
            messages: [{ role: "user", content: userContent }],
        });
        Logger.debug("ontology result for ", item, JSON.stringify(result));

        cctx.storage.goal.setOntologySub(item, result);

    }, { concurrency: configService().get("concurrency") });


    return {
        status: "fail",
        error: "未实现"
    }
}