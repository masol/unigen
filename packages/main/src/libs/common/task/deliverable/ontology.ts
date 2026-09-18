import { CommonContext } from "$libs/common/context.js";
import { DocumentSplitConstitution, DocumentSplitConstitutionSchema } from "$libs/common/storage/type/ontology.js";
import { getSmartModel } from "$libs/model/index.js";
import { safefmt } from "$libs/model/llm/outline.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { dataCenter } from "$libs/utils/sys/data.js";
import { generateText, Output } from "ai";
import XMLBuilder from 'fast-xml-builder';
import { getErrorMessage } from "radashi";


export async function ensureOntology(cctx: CommonContext): Promise<DocumentSplitConstitution> {
    const input = cctx.storage.goal.getCurgoal();
    // const maxSteps = cctx.storage.config.getMaxSteps();
    const builder = new XMLBuilder({
        format: true,        // 美化输出（缩进）
        indentBy: '  ',      // 缩进字符，默认是两个空格
    });
    const xml = builder.build(input);

    // Logger.debug("ontology input xml:", xml);
    const systemPrompt = await dataCenter.ensurePrompt("deliverable", "md-plan", "ontology");
    const { text: ontologyString } = await generateText({
        model: getSmartModel(undefined, cctx.ctx),
        instructions: systemPrompt,
        temperature: 0.5,
        messages: [{ role: "user", content: xml }],
    });


    // Logger.debug("ontology result:", JSON.stringify(ontologyString));
    cctx.storage.goal.setOntologyAnalysis(ontologyString);

    const nlresult = await safefmt(ontologyString, Output.object({ schema: DocumentSplitConstitutionSchema }), cctx.ctx);

    if (!nlresult.success || !nlresult.value?.output) {
        throwUnprcessable(getErrorMessage(nlresult.err ?? "未能成功解析文档拆分宪法，请检查输出格式。"));
    }

    // Logger.debug("ontology parsed:", JSON.stringify(nlresult.value.output, null, 2));
    cctx.storage.goal.setOntology(nlresult.value.output);
    return nlresult.value.output;
}
