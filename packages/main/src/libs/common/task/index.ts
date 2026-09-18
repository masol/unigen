import type { CommonContext } from "../context.js";
import type { ExecInput, ExecOutput } from "../storage/type/tast.js";
import { doClassify } from "./deliverable/classify.js";

export async function doTask(input: ExecInput, cctx: CommonContext): Promise<ExecOutput> {
    cctx.ctx.info("进入doTask:", JSON.stringify(input, null, 2));
    cctx.storage.goal.setCurgoal(input);

    // 这里读取知识库，检查是否有已有工作流适配--如果有，转入矫正阶段。
    const deliverable = await doClassify(input, cctx);

    if (deliverable.status === "fail") {
        return deliverable;
    }

    return deliverable;
}