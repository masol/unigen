import { NodeEditor, type GetSchemes, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
    ConnectionPlugin,
    Presets as ConnectionPresets,
} from "rete-connection-plugin";
import {
    AutoArrangePlugin,
    Presets as ArrangePresets,
    ArrangeAppliers
} from "rete-auto-arrange-plugin";
import {
    SveltePlugin,
    Presets,
    type SvelteArea2D
} from "rete-svelte-plugin/5";
import { ReadonlyPlugin } from "rete-readonly-plugin";
import { HistoryPlugin, HistoryExtensions, Presets as HistoryPresets } from "rete-history-plugin";
import { getSocket, loadInput, loadOutput } from "./sockets.js";
import { type EventHandleType, type IRetEditor, type onConnRm, type TraveContext, type TraveFunc, type TraversalOption } from "./type.js";
import { UniNode } from './llmNode.js'
import pMap from "p-map";
import type { PartialNode, PortConfig, Connection as SqlConnection } from "../appdb/rete.type.js";
import { logger } from "../logger.js";
import type { Connection } from "./type.js";
import type { SelectorEntity } from "rete-area-plugin/_types/extensions/selectable.js";
import { isNumber, difference } from "remeda";

type Schemes = GetSchemes<UniNode, Connection<UniNode>>;
type AreaExtra = SvelteArea2D<Schemes>;

function calcHeight(ioNum: number): number {
    return 60 + ioNum * 40;
}



export class RetEditor implements IRetEditor {
    #editor: NodeEditor<Schemes>;
    #area: AreaPlugin<Schemes, AreaExtra>;
    // #container: HTMLElement;
    #connection: ConnectionPlugin<Schemes, AreaExtra>;
    #render: SveltePlugin<Schemes, AreaExtra>;
    #history: HistoryPlugin<Schemes>;
    #arrange: AutoArrangePlugin<Schemes>;
    #readonly: ReadonlyPlugin<Schemes>;
    #selector: AreaExtensions.Selector<SelectorEntity>;
    #evtHandle: EventHandleType | undefined;
    #belongtoId: string; // 所属的word(流程图)id.(belongtoId)

    get belongtoId(): string {
        return this.#belongtoId;
    }

    set onEvent(eh: EventHandleType) {
        this.#evtHandle = eh;
    }

    get onEvent(): EventHandleType | undefined {
        return this.#evtHandle;
    }

    get readonly(): boolean {
        return this.#readonly.enabled;
    }

    async unselectAll() {
        this.#selector.unselectAll();
    }

    async selectNodes(nodes: string | string[], accu: boolean = true): Promise<number> {
        let number = 0;

        const selectNode = async (nid: string) => {
            const nodeView = this.#area.nodeViews.get(nid);
            // console.log("found nodeView=", nid, nodeView);
            if (nodeView) {
                const nodeElement = nodeView.element;

                // 模拟点击事件来触发选择
                const pointerEvent = new PointerEvent('pointerdown', {
                    bubbles: true,
                    cancelable: true,
                    ctrlKey: accu, // Ctrl 键用于累加选择
                    button: 0
                });

                nodeElement.dispatchEvent(pointerEvent);

                // 释放事件
                const pointerUpEvent = new PointerEvent('pointerup', {
                    bubbles: true,
                    cancelable: true
                });

                nodeElement.dispatchEvent(pointerUpEvent);
                // await this.#selector.add(nodeView, accu); // false 表示不累加，清除之前的选择
                number++;
            }
        }

        if (Array.isArray(nodes)) {
            await pMap(nodes, selectNode);
        } else {
            await selectNode(nodes);
        }

        return number;
    }

    async traversal(func: TraveFunc, opt?: TraversalOption): Promise<void> {
        const order = opt?.order ?? "any";
        const concurrency = opt?.concurrency ?? 1;
        if (order === 'any') {
            const nodes = this.#editor.getNodes();
            try {
                await pMap(nodes, async (n) => {
                    const ctx: TraveContext = {
                        node: n,
                        param: opt?.param
                    }
                    if (opt?.positon) {
                        const view = this.#area.nodeViews.get(n.id);
                        if (view) {
                            ctx.position = { ...view.position }
                        }
                    }
                    await func(ctx);
                }, {
                    concurrency
                })
            } catch (e) {
                logger.warn(`遍历被异常终止:${e}`)
            }
        } else {
            throw new Error(`尚未实现的遍历方式:${order}`);
        }
    }

    set readonly(value: boolean) {
        if (this.#readonly.enabled !== value) {

            if (value) {
                this.#readonly.enable();
            } else {

                this.#readonly.disable();
            }
        }
    }

    constructor(container: HTMLElement, refId: string) {
        this.#belongtoId = refId;
        // console.log("try to load from refId:", this.#refId);

        // this.#container = container;
        this.#editor = new NodeEditor<Schemes>();
        this.#area = new AreaPlugin<Schemes, AreaExtra>(container);
        this.#connection = new ConnectionPlugin<Schemes, AreaExtra>();
        this.#render = new SveltePlugin<Schemes, AreaExtra>();
        this.#history = new HistoryPlugin<Schemes>();

        HistoryExtensions.keyboard(this.#history);

        this.#history.addPreset(HistoryPresets.classic.setup());

        // 创建 selector 实例
        this.#selector = AreaExtensions.selector();
        // 允许选择．this.#selector =
        AreaExtensions.selectableNodes(this.#area, this.#selector, {
            accumulating: AreaExtensions.accumulateOnCtrl()
        });

        this.#render.addPreset(Presets.classic.setup());
        this.#arrange = new AutoArrangePlugin<Schemes>();
        this.#readonly = new ReadonlyPlugin<Schemes>();

        this.#connection.addPreset(ConnectionPresets.classic.setup());
        this.#arrange.addPreset(ArrangePresets.classic.setup());

        // 使用bits-ui的context-menu，取代rete.js内部的，以保持风格统一．
        // const contextMenu = new ContextMenuPlugin<Schemes>(cmevt);

        this.#editor.use(this.#readonly.root);
        this.#editor.use(this.#area);
        this.#area.use(this.#readonly.area);
        this.#area.use(this.#connection);
        this.#area.use(this.#render);
        this.#area.use(this.#history);
        this.#area.use(this.#arrange);
        // this.#area.use(contextMenu);

        this.#editor.addPipe((context) => {
            if (this.#evtHandle) {
                this.#evtHandle(context.type, ("data" in context) ? context.data : undefined);
            }
            return context;
        })

        this.#area.addPipe((context) => {
            if (this.#evtHandle) {
                // @todo: 为什么area会发出这两个事件？？
                if (["connectioncreate", "connectioncreated"].indexOf(context.type) < 0) {
                    this.#evtHandle(context.type, ("data" in context) ? context.data : undefined);
                }
            }
            return context;
        })

        AreaExtensions.simpleNodesOrder(this.#area);
    }

    nodeFromElement(element: HTMLElement): string | undefined {
        const nodeContainer = element.closest('[data-testid="node"]');
        if (!nodeContainer) return undefined;
        // 遍历所有节点视图找到匹配的元素
        for (const [nodeId, nodeView] of this.#area.nodeViews.entries()) {
            // console.log("nodeId,nodeView=", nodeId, nodeView.element, nodeContainer)
            if (nodeView.element === nodeContainer || nodeView.element.contains(nodeContainer)) {
                return nodeId;
            }
        }
        return undefined;
    }

    getNode(nodeId: string): UniNode | undefined {
        return this.#editor.getNode(nodeId);
    }

    async rmNode(id: string, func: onConnRm): Promise<boolean> {
        // console.log("rmNode.id=", id)
        const connections = this.#editor.getConnections()
        const incomingConnections = connections.filter(connection => connection.target === id)
        const outgoingConnections = connections.filter(connection => connection.source === id)

        // 移除关联的connection.
        await pMap([...incomingConnections, ...outgoingConnections], async (c) => {
            await this.#editor.removeConnection(c.id);
            if (func) {
                await func(c.id);
            }
        }, {
            concurrency: 20
        })
        // console.log(incomingConnections, outgoingConnections);
        // 移除
        // this.#editor.removeConnection()
        return await this.#editor.removeNode(id);
    }

    getNodes(): UniNode[] {
        return this.#editor.getNodes();
    }

    getConnections(): Connection<UniNode>[] {
        return this.#editor.getConnections();
    }

    // 查找索引了fid的
    getFuncNodes(fid: string): UniNode[] {
        const nodes = this.#editor.getNodes();
        // console.log("nodes=", nodes)
        // const retNodes: UniNode[] = [];
        // nodes.forEach(n => {
        //     if (n.fid === fid) {
        //         retNodes.push(n);
        //     }
        // })
        // return retNodes;
        // nodes.filter会改变nodes自身的值--是多个editor实例引发的错误!
        return nodes.filter(n => n.fid === fid);
    }


    async updNode(id: string, param: Record<string, unknown>) {
        const node = this.getNode(id);

        if (!node) return;

        let needUpdated = false;
        if (param.label && param.label !== node.label) {
            node.label = param.label as string;
            needUpdated = true;
        }

        if (param.fid && param.fid !== node.fid) {
            node.fid = param.fid as string;
        }

        if (isNumber(param.width) && param.width >= 100) {
            node.width = param.width as number;
            needUpdated = true;
        }

        if (isNumber(param.height) && param.height >= 100) {
            node.height = param.height as number;
            needUpdated = true;
        }

        if (needUpdated) {
            await this.#area.update("node", node.id);
        }
    }

    getSqlNode(id: string): PartialNode | undefined {
        const node = this.getNode(id);
        if (!node) {
            return;
        }

        const ret: PartialNode = {
            id: node.id
        }

        if (node.fid) {
            ret.ref_id = node.fid;
        }

        if (node.label) {
            ret.label = node.label;
        }

        ret.belong_id = this.belongtoId

        // 加载input.
        Object.entries(node.inputs).forEach(([key, value]) => {
            if (value) {
                ret.cached_input = ret.cached_input || [];
                ret.cached_input.push(getSocket(key, value));
            }
        });


        // 加载output.
        Object.entries(node.outputs).forEach(([key, value]) => {
            if (value) {
                ret.cached_output = ret.cached_output || [];
                ret.cached_output.push(getSocket(key, value));
            }
        });

        // 获取x,y位置.
        const view = this.#area.nodeViews.get(id);
        if (view) {
            ret.x = view.position.x
            ret.y = view.position.y
        }

        return ret;
    }

    async updNodeSocks(node: UniNode, input: PortConfig[] | undefined, output: PortConfig[] | undefined, updateHeight = true) {
        // 处理 inputs
        const currentInputKeys = Object.keys(node.inputs);
        const newInputKeys = input?.map(config => config.key) ?? [];
        const connections = this.#editor.getConnections()

        const allRmConns: Connection<UniNode>[] = [];

        const inputKeysToRemove = difference(currentInputKeys, newInputKeys);
        const inputKeysToAdd = difference(newInputKeys, currentInputKeys);

        inputKeysToRemove.forEach(key => {
            node.removeInput(key);
            const rmConnections = connections.filter(connection => connection.target === node.id && connection.targetInput === key);
            if (rmConnections.length > 0) {
                allRmConns.push(...rmConnections);
            }
        })

        inputKeysToAdd.forEach(key => {
            const inputConfig = input?.find((item) => item.key === key);
            if (inputConfig) {
                node.addInput(key, loadInput(inputConfig));
            }
        })

        // 处理 outputs
        const currentOutputKeys = Object.keys(node.outputs);
        const newOutputKeys = output?.map(config => config.key) ?? [];

        const outputKeysToRemove = difference(currentOutputKeys, newOutputKeys);
        const outputKeysToAdd = difference(newOutputKeys, currentOutputKeys);

        outputKeysToRemove.forEach(key => {
            node.removeOutput(key);
            const rmConnections = connections.filter(connection => connection.source === node.id && connection.sourceOutput === key);
            if (rmConnections.length > 0) {
                allRmConns.push(...rmConnections);
            }
        })

        outputKeysToAdd.forEach(key => {
            const outputConfig = output?.find((item) => item.key === key);
            if (outputConfig) {
                node.addOutput(key, loadOutput(outputConfig));
            }
        })

        // 移除关联的connection.
        await pMap(allRmConns, async (c) => {
            await this.#editor.removeConnection(c.id);
        }, {
            concurrency: 20
        })

        const totalIONum = Object.keys(node.inputs).length + Object.keys(node.outputs).length;
        const newHeight = calcHeight(totalIONum);
        if (newHeight !== node.height) {
            node.height = newHeight;
            if (updateHeight) {
                await this.#area.update("node", node.id);
            }
        }
    }

    async newNode(param: Record<string, unknown>) {
        // console.log("newNode param=", param)
        const a = new UniNode((param.label as string) || "未命名的", param);
        const input: PortConfig[] | undefined = param.cached_input as (PortConfig[] | undefined);
        const output: PortConfig[] | undefined = param.cached_output as (PortConfig[] | undefined);

        await this.updNodeSocks(a,input,output,false);
        await this.#editor.addNode(a);

        // console.log("nodes after add=", this.#editor.getNodes())

        // 获取当前视图的变换状态
        const transform = this.#area.area.transform;

        // 将屏幕坐标转换为画布坐标
        // 画布坐标 = (屏幕坐标 / 缩放) - (平移 / 缩放)
        const canvasX = ((param.x as number) || 0) / transform.k - transform.x / transform.k;
        const canvasY = ((param.y as number) || 0) / transform.k - transform.y / transform.k;

        await this.#area.translate(a.id, { x: canvasX, y: canvasY });
    }

    async addConnection(conn: SqlConnection): Promise<boolean> {
        // console.log("build conn=", conn);

        const a = this.#editor.getNode(conn.from_id);
        const b = this.#editor.getNode(conn.to_id);
        // console.log("a,b", a, b)
        if (a && b) {
            const c = new ClassicPreset.Connection(a, conn.from_output, b, conn.to_input);
            c.id = conn.id;
            return await this.#editor.addConnection(c);
        }
        return false;
    }


    async init() {
        // const a = new UniNode("A");
        // a.addControl("a", new ClassicPreset.InputControl("text", { initial: "a" }));
        // a.addOutput("a", new ClassicPreset.Output(sockets().auto));
        // a.addOutput("b", new ClassicPreset.Output(sockets().auto));
        // await this.#editor.addNode(a);

        // a.addInput("b", new ClassicPreset.Input(sockets().auto));

        // const b = new UniNode("B");
        // b.addControl("b", new ClassicPreset.InputControl("text", { initial: "b" }));
        // b.addInput("b", new ClassicPreset.Input(sockets().auto));
        // b.addInput("c", new ClassicPreset.Input(sockets().auto));
        // b.addInput("d", new ClassicPreset.Input(sockets().auto, "中文测试22"));

        // await this.#editor.addNode(b);
        // await this.#editor.addConnection(new ClassicPreset.Connection(a, "a", b, "b"));

        // await this.#area.translate(a.id, { x: 0, y: 0 });
        // await this.#area.translate(b.id, { x: 270, y: 0 });
    }

    async reset() {
        await AreaExtensions.zoomAt(this.#area, this.#editor.getNodes());
    }

    async layout(animate: boolean = true) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        const applier = new ArrangeAppliers.TransitionApplier<Schemes, never>({
            duration: 500,
            timingFunction: (t) => t,
            async onTick() {
                await AreaExtensions.zoomAt(that.#area, that.#editor.getNodes());
            }
        });
        await this.#arrange.layout({ applier: animate ? applier : undefined });
        AreaExtensions.zoomAt(this.#area, this.#editor.getNodes());
    }

    destroy() {
        if (this.#area) {
            this.#area.destroy()
        }
    }
};
