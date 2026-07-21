/**
 * ============================================================================
 * 【P-graph · ArtifactRegistry:产物注册表(Fuse 快筛 + LLM 归一)】
 * ============================================================================
 * 全局唯一真相源。新名字先 Fuse 找疑似,命中交 LLM 裁决归一,别名留痕。
 * 整体串行(promise 链):并行展开下查重/候选名单在写入前会过期。
 */
import { getSmartModel } from "$libs/model/index.js";
import type { IRunnerContext } from '$types/blueprint/context.js';
import { RegArtifact, SizeEstimateT } from "$types/shared/plan/nodes.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import Fuse from "fuse.js";
import { ARTIFACT_FUZZY_THRESHOLD } from "../config.js";

export interface ArtifactCand {
    name: string;
    intent: string;
    qualityCriteria?: string[];
    sizeEstimate?: SizeEstimateT;
}

export class ArtifactRegistry {
    #map = new Map<string, RegArtifact>();
    #fuse: Fuse<RegArtifact> | null = null;
    #chain: Promise<unknown> = Promise.resolve();

    #rebuildFuse(): void {
        this.#fuse = new Fuse([...this.#map.values()], {
            keys: [
                { name: "name", weight: 0.6 },
                { name: "intent", weight: 0.3 },
                { name: "aliases", weight: 0.1 },
            ],
            includeScore: true,
            threshold: 0.6,
        });
    }

    /** 解析到正式名(含别名命中);不存在返回 null */
    resolveName(name: string): string | null {
        if (this.#map.has(name)) return name;
        for (const a of this.#map.values())
            if (a.aliases.includes(name)) return a.name;
        return null;
    }

    /** 登记产物,返回归一后正式名。整体串行,失败不断链 */
    register(cand: ArtifactCand, ctx: IRunnerContext): Promise<string> {
        const run = this.#chain.then(() => this.#registerImpl(cand, ctx));
        this.#chain = run.then(() => undefined, () => undefined);
        return run;
    }

    #mergeInto(target: RegArtifact, cand: ArtifactCand): void {
        if (cand.name !== target.name && !target.aliases.includes(cand.name))
            target.aliases.push(cand.name);
        for (const q of cand.qualityCriteria ?? [])
            if (!target.qualityCriteria.includes(q)) target.qualityCriteria.push(q);
    }

    async #registerImpl(cand: ArtifactCand, ctx: IRunnerContext): Promise<string> {
        const exact = this.resolveName(cand.name);
        if (exact) {
            this.#mergeInto(this.#map.get(exact)!, cand);
            return exact;
        }

        if (!this.#fuse) this.#rebuildFuse();
        const suspects = this.#fuse!
            .search(`${cand.name} ${cand.intent}`)
            .filter(h => (h.score ?? 1) <= ARTIFACT_FUZZY_THRESHOLD)
            .map(h => h.item);

        if (suspects.length > 0) {
            const same = await this.#judgeSame(cand, suspects, ctx);
            if (same) {
                this.#mergeInto(same, cand);
                Logger.debug(`[registry] 产物归一:「${cand.name}」→「${same.name}」`);
                this.#rebuildFuse();
                return same.name;
            }
        }

        this.#map.set(cand.name, {
            name: cand.name,
            intent: cand.intent,
            aliases: [],
            qualityCriteria: cand.qualityCriteria ?? [],
            sizeEstimate: cand.sizeEstimate ?? 'small',
            dataSchema: null,
        });
        this.#rebuildFuse();
        return cand.name;
    }

    async #judgeSame(
        cand: ArtifactCand, suspects: RegArtifact[], ctx: IRunnerContext,
    ): Promise<RegArtifact | null> {
        const list = suspects
            .map((s, i) => `${i + 1}. name=「${s.name}」 intent=「${s.intent}」`)
            .join("\n");
        const { text } = await generateText({
            model: getSmartModel(undefined, ctx),
            instructions:
                `你是数据产物归一裁判。判断"新产物"与候选中的某一项是否指同一份数据。` +
                `判据是数据内容本质相同、仅命名/措辞不同。用途/粒度/加工阶段不同的一律视为不同。` +
                `若与第 k 项相同只输出数字 k;都不同只输出 0。不要输出其他内容。`,
            prompt: `新产物:name=「${cand.name}」 intent=「${cand.intent}」\n候选:\n${list}`,
        });
        const k = parseInt(text.trim(), 10);
        if (Number.isInteger(k) && k >= 1 && k <= suspects.length) return suspects[k - 1];
        return null;
    }

    get(name: string): RegArtifact | null {
        const formal = this.resolveName(name);
        return formal ? this.#map.get(formal)! : null;
    }
    all(): RegArtifact[] { return [...this.#map.values()]; }

    /** 持久化载入 */
    load(list: RegArtifact[]): void {
        this.#map.clear();
        for (const a of list) this.#map.set(a.name, a);
        this.#fuse = null;
    }
}