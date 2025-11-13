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
import { HistoryPlugin, type HistoryActions, HistoryExtensions, Presets as HistoryPresets } from "rete-history-plugin";
import { sockets } from "./sockets.js";
import type { EventHandleType, IRetEditor } from "./type.js";
import { UniNode } from './llmNode.js'
import pMap from "p-map";



export class Connection<N extends UniNode = UniNode> extends ClassicPreset.Connection<N, N> { }
type Schemes = GetSchemes<UniNode, Connection<UniNode>>;
type AreaExtra = SvelteArea2D<Schemes>;

export class RetEditor implements IRetEditor {
    #editor: NodeEditor<Schemes>;
    #area: AreaPlugin<Schemes, AreaExtra>;
    #container: HTMLElement;
    #connection: ConnectionPlugin<Schemes, AreaExtra>;
    #render: SveltePlugin<Schemes, AreaExtra>;
    #history: HistoryPlugin<Schemes>;
    #arrange: AutoArrangePlugin<Schemes>;
    #readonly: ReadonlyPlugin<Schemes>;
    #selector;
    #evtHandle: EventHandleType | undefined;

    set onEvent(eh: EventHandleType) {
        this.#evtHandle = eh;
    }

    get onEvent(): EventHandleType | undefined {
        return this.#evtHandle;
    }

    get readonly(): boolean {
        return this.#readonly.enabled;
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

    constructor(container: HTMLElement) {

        this.#container = container;
        this.#editor = new NodeEditor<Schemes>();
        this.#area = new AreaPlugin<Schemes, AreaExtra>(container);
        this.#connection = new ConnectionPlugin<Schemes, AreaExtra>();
        this.#render = new SveltePlugin<Schemes, AreaExtra>();
        this.#history = new HistoryPlugin<Schemes>();

        HistoryExtensions.keyboard(this.#history);

        this.#history.addPreset(HistoryPresets.classic.setup());

        // 创建 selector 实例
        const selectorInstance = AreaExtensions.selector();
        // 允许选择．
        this.#selector = AreaExtensions.selectableNodes(this.#area, selectorInstance, {
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
            console.log("nodeId,nodeView=", nodeId, nodeView.element, nodeContainer)
            if (nodeView.element === nodeContainer || nodeView.element.contains(nodeContainer)) {
                return nodeId;
            }
        }
        return undefined;
    }

    getNode(nodeId: string): UniNode | undefined {
        return this.#editor.getNode(nodeId);
    }

    async rmNode(id: string): Promise<boolean> {
        const connections = this.#editor.getConnections()
        const incomingConnections = connections.filter(connection => connection.target === id)
        const outgoingConnections = connections.filter(connection => connection.source === id)

        // 移除关联的connection.
        await pMap([...incomingConnections, ...outgoingConnections], async (c) => {
            this.#editor.removeConnection(c.id);
        }, {
            concurrency: 20
        })
        // console.log(incomingConnections, outgoingConnections);
        // 移除
        // this.#editor.removeConnection()
        return this.#editor.removeNode(id);
    }

    async newNode(param: Record<string, any>) {
        const a = new UniNode(param.label || "未命名的");
        a.addOutput("output", new ClassicPreset.Output(sockets().auto));
        a.addInput("input", new ClassicPreset.Input(sockets().auto));

        await this.#editor.addNode(a);

        // 获取当前视图的变换状态
        const transform = this.#area.area.transform;

        // 将屏幕坐标转换为画布坐标
        // 画布坐标 = (屏幕坐标 / 缩放) - (平移 / 缩放)
        const canvasX = (param.x || 0) / transform.k - transform.x / transform.k;
        const canvasY = (param.y || 0) / transform.k - transform.y / transform.k;

        await this.#area.translate(a.id, { x: canvasX, y: canvasY });
    }


    async init() {
        const a = new UniNode("A");
        a.addControl("a", new ClassicPreset.InputControl("text", { initial: "a" }));
        a.addOutput("a", new ClassicPreset.Output(sockets().auto));
        a.addOutput("b", new ClassicPreset.Output(sockets().auto));
        await this.#editor.addNode(a);

        a.addInput("b", new ClassicPreset.Input(sockets().auto));

        const b = new UniNode("B");
        b.addControl("b", new ClassicPreset.InputControl("text", { initial: "b" }));
        b.addInput("b", new ClassicPreset.Input(sockets().auto));
        b.addInput("c", new ClassicPreset.Input(sockets().auto));
        b.addInput("d", new ClassicPreset.Input(sockets().auto, "中文测试22"));

        await this.#editor.addNode(b);
        await this.#editor.addConnection(new ClassicPreset.Connection(a, "a", b, "b"));

        await this.#area.translate(a.id, { x: 0, y: 0 });
        await this.#area.translate(b.id, { x: 270, y: 0 });

    }

    reset() {
        AreaExtensions.zoomAt(this.#area, this.#editor.getNodes());
    }

    async layout(animate: boolean = true) {
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
