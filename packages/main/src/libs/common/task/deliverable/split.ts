import { CommonContext } from "$libs/common/context.js";
import { TasksStorage } from "$libs/common/storage/tasks.js";
import { DocumentSplitConstitution } from "$libs/common/storage/type/ontology.js";
import { ExecInput, execInputListSchema, TaskWithKeyList } from "$libs/common/storage/type/tast.js";
import { getSmartModel } from "$libs/model/index.js";
import { safefmt } from "$libs/model/llm/outline.js";
import { configService } from "$libs/store/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { dataCenter } from "$libs/utils/sys/data.js";
import { generateText, Output } from "ai";
import Logger from "electron-log/main.js";
import XMLBuilder from 'fast-xml-builder';
import pMap from "p-map";
import { getErrorMessage } from "radashi";


type DecompositionTaskContext = {
    cctx: CommonContext;
    systemPrompt: string;
    ontology: DocumentSplitConstitution;
    storage: TasksStorage;
    goal: ExecInput;
    leafs: TaskWithKeyList;
}

/**
 * 
 * @param idxStack 层数代表宪法中的layerIndex.数值代表到达本次递归时的路径。
 * @param goalStack 
 * @param mtctx 
 */
async function taskDecomposition(idxStack: number[], goalStack: ExecInput[], mtctx: DecompositionTaskContext): Promise<void> {
    try {

        Logger.debug(`split task ${idxStack.join('.')} start:`, "goalStack:", goalStack.map((g) => g.goal).join(' -> '));
        const total = mtctx.ontology.layers.length;
        const builder = new XMLBuilder({
            format: true,        // 美化输出（缩进）
            indentBy: '  ',      // 缩进字符，默认是两个空格
        });

        const layerIndex = idxStack.length;

        const curLayer = builder.build(mtctx.ontology.layers[layerIndex]);
        const nextLayer = layerIndex + 1 < total ? `<layer_index>${layerIndex + 2}</layer_index>${builder.build(mtctx.ontology.layers[layerIndex + 1])}` : "";
        const goal_stack: string[] = [];
        if (goalStack.length > 0) {
            goal_stack.push(mtctx.goal.goal);
            goalStack.forEach((goal) => {
                goal_stack.push(goal.goal);
            });
        }
        const constitution = `<constitution>
  <layer_index>${layerIndex + 1}</layer_index>
  <layer_count>${total}</layer_count>
  <is_leaf>${layerIndex === total - 1 ? "true" : "false"}</is_leaf>
${curLayer}
<next_layer>
${nextLayer}
</next_layer>
</constitution>`

        const ancestor_goals = `<ancestor_goals>
${goal_stack.map((goal) => `<goal>${goal}</goal>`).join('\n')}
</ancestor_goals>`

        let curTask = ""
        if (goalStack.length > 0) {
            const xml = builder.build(goalStack.at(-1));
            curTask = `<current_task>${xml}</current_task>`
        } else {
            const xml = builder.build(mtctx.goal);
            curTask = `<current_task>${xml}</current_task>`
        }

        const userPrompt = `${ancestor_goals}
    ${curTask}
    ${constitution}
    `
        Logger.debug(`split task ${idxStack.join('.')} input xml:`, userPrompt);
        const { text: ontologyString } = await generateText({
            model: getSmartModel(undefined, mtctx.cctx.ctx),
            instructions: mtctx.systemPrompt,
            temperature: 0.5,
            messages: [{ role: "user", content: userPrompt }],
        });
        Logger.debug(`split task ${idxStack.join('.')} output:`, ontologyString);


        const subTaskResult = await safefmt(ontologyString, Output.object({ schema: execInputListSchema }), mtctx.cctx.ctx);
        if (!subTaskResult.success || !subTaskResult.value?.output) {
            throwUnprcessable(getErrorMessage(subTaskResult.err ?? "未能成功解析文档拆分宪法，请检查输出格式。"));
        }

        const subTasks: ExecInput[] = subTaskResult.value.output;

        const taskId = (layerIndex > 0 ? `.${idxStack.join('.')}` : '');
        mtctx.storage.setTasks(subTasks, taskId);


        Logger.debug(`split task ${idxStack.join('.')} parsed:`, JSON.stringify(subTasks, null, 4));
        // 如果还有下一层。为每个拆分出来的子任务继续递归调用。
        Logger.debug(`split task ${idxStack.join('.')} layerIndex:`, layerIndex, "total:", total, "subTasks.length:", subTasks.length);
        if (layerIndex + 1 < total) {
            await pMap(subTasks, async (subTask, subIndex) => {
                const newIdxStack = [...idxStack, subIndex];
                const newGoalStack: ExecInput[] = [...goalStack, subTask];
                Logger.debug(`split task ${idxStack.join('.')} 递归:`, subIndex, "newIdxStack:", newIdxStack.join('.'), "newGoalStack:", newGoalStack.map((g) => g.goal).join(' -> '));
                await taskDecomposition(newIdxStack, newGoalStack, mtctx);
            }, { concurrency: configService().get("concurrency") });
        } else {
            subTasks.forEach((value, index) => {
                mtctx.leafs.push({
                    key: `${idxStack.join('.')}.${index}`,
                    task: value
                });
            })
        }
    } catch (e) {
        Logger.error(`split task ${idxStack.join('.')} error:`, e);
    }
}

export async function designTasktree(cctx: CommonContext): Promise<TaskWithKeyList> {
    const input = cctx.storage.goal.getCurgoal();
    // const maxSteps = cctx.storage.config.getMaxSteps();

    const ontology = cctx.storage.goal.getOntology();

    if (!ontology) {
        throwUnprcessable("未能获取到文档拆分宪法，请先执行ensureOntology函数。");
    }

    const systemPrompt = await dataCenter.ensurePrompt("deliverable", "md-plan", "split");

    const taskTree = cctx.storage.ensureTasksStorage();
    const leafResults: TaskWithKeyList = [];

    const mtctx: DecompositionTaskContext = {
        cctx,
        systemPrompt,
        ontology,
        storage: taskTree,
        goal: input,
        leafs: leafResults,
    };

    await taskDecomposition([], [], mtctx);

    return leafResults;

}
