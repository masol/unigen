import { CommonContext } from "$libs/common/context.js";
import { TasksStorage } from "$libs/common/storage/tasks.js";
import { ExecInput, ExecOutput, TaskWithKey, TaskWithKeyList } from "$libs/common/storage/type/tast.js";
import { getSmartModel } from "$libs/model/index.js";
import { configService } from "$libs/store/index.js";
import { dataCenter } from "$libs/utils/sys/data.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import XMLBuilder from 'fast-xml-builder';
import { writeFile } from "node:fs/promises";
import pMap from "p-map";
import { ensureOntology } from "./ontology.js";
import { designTasktree } from "./split.js";


async function doWriter(leaf: TaskWithKey, cctx: CommonContext, taskStorage: TasksStorage, systemPrompt: string): Promise<string> {
    const builder = new XMLBuilder({
        format: true,        // 美化输出（缩进）
        indentBy: '  ',      // 缩进字符，默认是两个空格
    });
    const userPrompt = `<root>${builder.build(cctx.storage.goal.getCurgoal())}</root>
<task>${builder.build(leaf.task)}
</task>`
    Logger.debug("doWriter userPrompt:", userPrompt);
    const { text: writerResult } = await generateText({
        model: getSmartModel(undefined, cctx.ctx),
        instructions: systemPrompt,
        temperature: 0.5,
        messages: [{ role: "user", content: userPrompt }],
    });
    Logger.debug("doWriter writerResult:", writerResult);
    taskStorage.setResult(leaf.key, writerResult);
    return writerResult;
}

export async function doMarkdown(input: ExecInput, cctx: CommonContext): Promise<ExecOutput> {

    const ontology = await ensureOntology(cctx);

    Logger.debug("doMarkdown ontology:", JSON.stringify(ontology, null, 4));

    // 开始递归拆分为任务树。
    const taskLeafs: TaskWithKeyList = await designTasktree(cctx);

    const taskStorage = cctx.storage.ensureTasksStorage();
    if (!taskLeafs || taskLeafs.length === 0) {
        Logger.debug("No leaf tasks found for execution.");
        return {
            status: "fail",
            error: "No leaf tasks found for execution."
        };
    }

    // 按 key 排序，保证执行与结果顺序确定。
    const sortedLeafs = [...taskLeafs].sort((a, b) =>
        a.key.localeCompare(b.key, undefined, { numeric: true })
    );

    const systemPrompt = await dataCenter.ensurePrompt("deliverable", "md-plan", "writer");

    // 使用按索引写入的数组，天然保持与 sortedLeafs 相同的顺序。
    const leafResults: string[] = new Array(sortedLeafs.length);
    await pMap(sortedLeafs, async (taskLeaf, index) => {
        Logger.debug(`doMarkdown leaf task ${index} executing:`, JSON.stringify(taskLeaf, null, 4));
        const result = await doWriter(taskLeaf, cctx, taskStorage, systemPrompt);
        Logger.debug(`doMarkdown leaf task ${index} result:`, JSON.stringify(result, null, 4));
        leafResults[index] = result;
    }, { concurrency: configService().get("concurrency") });

    const finalResult = leafResults.join("\n\n");

    Logger.debug("doMarkdown finalResult:", finalResult);

    const filePath = cctx.ctx.prj.getPath("result.md", true);
    await writeFile(filePath, finalResult);

    return {
        status: "success",
        error: `已完成撰写。结果保存在文件${filePath}`
    };
}