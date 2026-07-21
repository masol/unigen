/**
 * ============================================================================
 * 【physical · 主入口:编排 mapPhase + libraryPhase】
 * ============================================================================
 */
import Logger from "electron-log/main.js";
import { PlanContext } from "../../context.js";
import { libraryPhase } from "./libraryPhase.js";
import { mapPhase } from "./mapPhase.js";

export async function physicalPlan(pctx: PlanContext): Promise<void> {
    const mapActions = await mapPhase(pctx);
    const { indexed, retrieved, mismatches } = await libraryPhase(pctx);

    if (mismatches.length > 0) {
        for (const m of mismatches) pctx.notify("plan/physical/mismatch", m);
    }

    Logger.debug(`[physical] 完成:map ${mapActions}, index ${indexed}, retrieve ${retrieved}`);
}