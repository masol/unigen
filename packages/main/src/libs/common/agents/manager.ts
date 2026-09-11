// agents.manager.ts
import { CommonContext } from '$libs/common/context.js';
import { configService } from '$libs/store/index.js';
import { throwNotfound, throwUnprcessable } from '$libs/utils/err.js';
import pMap from 'p-map';
import { BaseAgent } from './base.js';
import { DeliverableClassify } from './deliverable.js';
import { TargetLoop } from './targetloop.js';

export class AgentsManager {
    private agents = new Map<string, BaseAgent>();
    private prompts = new Map<string, string>();

    register(name: string, agent: BaseAgent): void {
        if (this.agents.has(name)) {
            throwUnprcessable(`Agent with name "${name}" is already registered.`);
        }
        this.agents.set(name, agent);
    }

    clear(): void {
        this.agents.clear();
    }

    get(name: string): BaseAgent {
        const agent = this.agents.get(name);
        if (!agent) {
            throwNotfound(`Agent with name "${name}" not found.`);
        }
        return agent;
    }

    async runAgent(name: string, cctx: CommonContext): Promise<string> {
        const agent = this.get(name);
        return await agent.run(cctx);
    }


    async registerAll(): Promise<void> {
        const names = [{
            name: ["target"],
            Cls: TargetLoop
        },
        {
            name: ["deliverable", "classify"],
            Cls: DeliverableClassify
        }]
        if (this.agents.size === 0) {
            await pMap(names, async (item) => {
                // Logger.debug("register item=", item.name)
                const agent = new item.Cls();
                await agent.init(item.name);
                this.register(item.name.join('/'), agent);
            }, {
                concurrency: configService().get("concurrency")
            })
        }
    }
}


const KEY = Symbol.for('unigen.singleton.TargetLoop');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const agentsManager: AgentsManager = ((globalThis as any)[KEY] ??= new AgentsManager());