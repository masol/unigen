import { functorStore } from "$lib/stores/project/functor.svelte";
import { viewStore } from "$lib/stores/project/view.svelte";
import { projectBase } from "$lib/utils/appdb/project";
import { eventBus } from "$lib/utils/evt";
import { logger } from "$lib/utils/logger";
import type { IRetEditor, TraveContext } from "$lib/utils/rete/type";
import type { FunctorData } from "$lib/utils/vocab/type";
import pMap from 'p-map';
import { validate as uuidValidate } from 'uuid';


const debounceTimers = new Map<string, NodeJS.Timeout>();
function updPosition(id: string, x: number, y: number) {
    const existingTimer = debounceTimers.get(id);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        projectBase.retedb.upsertNode({
            id,
            x,
            y
        });
        // console.log('nodetranslated', id, x, y);

        debounceTimers.delete(id);
    }, 1000);

    debounceTimers.set(id, timer);
}

export class ReteAdapter {
    #loading: boolean = true;
    private removeConnectionTimeouts = new Map<string, NodeJS.Timeout>();

    readonly editor: IRetEditor;
    private unsub!: (() => void);
    private unsub2!: (() => void);

    constructor(editor: IRetEditor) {
        this.editor = editor;
        this.editor.onEvent = this.onEvent.bind(this);
    }

    destroy() {
        this.unsub();
        this.unsub2();
        this.editor.destroy();
    }

    nodeFromEle(e: MouseEvent): string | undefined {
        const targetElement = e.target as HTMLElement;
        return this.editor.nodeFromElement(targetElement);
    }

    async init() {
        await this.editor.init();
        // 开始加载节点．
        const reteInfo = await projectBase.retedb.getReteData(this.editor.belongtoId);
        await pMap(reteInfo.nodes, async (node) => {
            return this.editor.newNode(node as unknown as Record<string, unknown>);
        })
        await pMap(reteInfo.connections, async (conn) => {
            // console.log("load persist Connection=", conn);
            return this.editor.addConnection(conn);
        })

        setTimeout(() => {
            this.editor.reset();
        }, 0);

        this.unsub = await eventBus.listen('functor.updated', async (event) => {
            // console.log("recieved functor.updated!!!!")
            const item = event as FunctorData;
            const nodes = this.editor.getFuncNodes(item.id);
            // console.log("item=",item);
            // console.log("found nodes for updated=",JSON.stringify(nodes));
            if (!nodes || nodes.length === 0) {
                return;
            }
            await pMap(
                nodes,
                async (n) => {
                    await this.editor.updNode(n.id, {
                        label: item.word,
                        fid: item.id
                    });
                    await this.onNodeUpdated(n.id);
                },
                { concurrency: 30 }
            );
            // console.log('item changed=', item);
        });

        this.unsub2 = await eventBus.listen('functor.remove', async (event) => {
            // console.log("on functor removed:",event);
            const fid = (event as Record<string, string>).id;
            const nodes = this.editor.getFuncNodes(fid);
            // console.log('found nodes=', nodes);
            if (!nodes || nodes.length === 0) {
                return;
            }
            await pMap(
                nodes,
                async (n) => {
                    await this.editor.rmNode(n.id, async (connId: string) => {
                        await this.onConnRemoved(connId);
                    });
                    await this.onNodeRemoved(n.id);
                },
                { concurrency: 30 }
            );
        });

        this.#loading = false;
    }


    private async onNodeUpdated(id: string) {
        if (!this.#loading) {
            // 未在加载状态．保存节点．
            const sqlNode = this.editor.getSqlNode(id);
            // console.log("updNode sqlNode=", sqlNode);
            if (sqlNode) {
                await projectBase.retedb.upsertNode(sqlNode);
            }
        }
    }

    private async onConnCreated(param: Record<string, string>) {
        if (!this.#loading) {
            // console.log("onConnCreated = ", param);
            await projectBase.retedb.upsertConn({
                id: param.id,
                belong_id: this.editor.belongtoId,
                from_id: param.source,
                from_output: param.sourceOutput,
                to_id: param.target,
                to_input: param.targetInput
            })
        }
    }

    private async onConnRemoved(id: string) {
        if (!this.#loading) {
            // 清除该连接之前的定时器
            if (this.removeConnectionTimeouts.has(id)) {
                clearTimeout(this.removeConnectionTimeouts.get(id)!);
            }

            // 设置新的300ms延迟
            const timeoutId = setTimeout(async () => {
                // console.log("remove connection=", id);
                const removed = await projectBase.retedb.rmConn(id);
                if (!removed) {
                    logger.warn(`未能删除连接${id}`);
                }
                this.removeConnectionTimeouts.delete(id);
            }, 300);

            this.removeConnectionTimeouts.set(id, timeoutId);
        }
    }

    private async onLayout() { // 全部重新布局，保存全部节点的位置．
        // console.log("enter onLayout")
        // await new Promise((resolve) => {
        //     setTimeout(() => {
        //         resolve(true);
        //     }, 100);
        // })
        await this.editor.traversal(async (ctx: TraveContext) => {
            // console.log("enter traveral.", ctx)
            if (ctx.position) {
                return updPosition(ctx.node.id, ctx.position.x, ctx.position.y);
            }
        }, {
            concurrency: 20,
            positon: true
        });
    }

    private async onNodeRemoved(id: string) {
        if (!this.#loading && id) {
            await projectBase.retedb.rmNode(id);
        }
    }

    async newNode(param: Record<string, unknown>): Promise<void> {
        const id = crypto.randomUUID();
        await this.editor.newNode({
            label: param.label,
            id,
            ref_id: param.ref_id,
            x: param?.x || 0,
            y: param?.y || 0
        });
        await this.onNodeUpdated(id);
    }


    async onEvent(cmd: string, data?: unknown) {
        const param: Record<string, unknown> = data as Record<string, unknown>;
        switch (cmd) {
            case 'reset':
                await this.editor.reset();
                await this.onLayout();
                break;
            case 'detail':
                if (param?.id) {
                    // const node = editor?.getNO
                    const node = this.editor.getNode(param.id as string);
                    if (node && node.fid) {
                        functorStore.openView(node.fid);
                    }
                }
                break;
            case 'newnode':
                {
                    // console.log("event newNode=",param);
                    // 首先创建新行为.
                    const word = await functorStore.newItem();
                    const id = crypto.randomUUID();
                    await this.newNode({
                        label: word.word,
                        id,
                        ref_id: word.id,
                        x: param?.clientX || 0,
                        y: param?.clientY || 0
                    })
                }
                break;
            case 'layout':
                await this.editor.layout();
                await this.onLayout();
                break;
            case 'rmNode':
                if (param && param.id) {
                    await this.editor.rmNode(param.id as string, async (connId: string) => {
                        return this.onConnRemoved(connId);
                    });
                    await this.onNodeRemoved(param.id as string);
                }
                break;
            case 'nodepicked':
                if (param?.id) {
                    viewStore.selectedItem = param.id as string;
                    console.log('节点被选中:', param.id);
                }
                break;
            case 'pointerdown':
                if (!param?.id) {
                    viewStore.selectedItem = '';
                    // console.log('节点别移除选择！！！');
                }
                break;
            case 'connectioncreate': // 加载期依然会抛出此事件．
                if (!uuidValidate(param?.id)) {
                    console.log('connectioncreate', param.id, this.#loading);
                    param.id = crypto.randomUUID();
                    // param.id = crypto.randomUUID();
                }
                break;
            case 'connectioncreated': // 加载期依然会抛出此事件．
                // console.log('event connectioncreated', param);
                await this.onConnCreated(param as Record<string, string>)
                break;
            case 'connectionremoved':
                // console.log('connectionremoved', param);
                await this.onConnRemoved(param.id as string);
                break;
            case 'nodetranslated':
                if (!this.#loading && param.id && param.position) {
                    // @ts-expect-error 不写类型了．
                    updPosition(param.id as string, param.position.x as number, param.position.y as number)
                }
                break;
        }
    }

}