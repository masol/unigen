import { NodeEditor, type GetSchemes, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
    ConnectionPlugin,
    Presets as ConnectionPresets
} from "rete-connection-plugin";
import {
    SveltePlugin,
    Presets,
    type SvelteArea2D
} from "rete-svelte-plugin/5";
import { HistoryPlugin, type HistoryActions, HistoryExtensions, Presets as HistoryPresets } from "rete-history-plugin";
// import { ContextMenuPlugin } from "./contextmenu.js";
import { sockets } from "./sockets.js";
import type { EvtCallback, IRetEditor } from "./type.js";


type Schemes = GetSchemes<
    ClassicPreset.Node,
    ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
type AreaExtra = SvelteArea2D<Schemes>;


export class RetEditor implements IRetEditor {
    #editor: NodeEditor<Schemes>;
    #area: AreaPlugin<Schemes, AreaExtra>;
    #container: HTMLElement;
    #connection: ConnectionPlugin<Schemes, AreaExtra>;
    #render: SveltePlugin<Schemes, AreaExtra>;
    #history: HistoryPlugin<Schemes>;



    constructor(container: HTMLElement) {
        this.#container = container;
        this.#editor = new NodeEditor<Schemes>();
        this.#area = new AreaPlugin<Schemes, AreaExtra>(container);
        this.#connection = new ConnectionPlugin<Schemes, AreaExtra>();
        this.#render = new SveltePlugin<Schemes, AreaExtra>();
        this.#history = new HistoryPlugin<Schemes>();

        HistoryExtensions.keyboard(this.#history);

        this.#history.addPreset(HistoryPresets.classic.setup());

        AreaExtensions.selectableNodes(this.#area, AreaExtensions.selector(), {
            accumulating: AreaExtensions.accumulateOnCtrl()
        });

        this.#render.addPreset(Presets.classic.setup());

        this.#connection.addPreset(ConnectionPresets.classic.setup());

        // 使用bits-ui的context-menu，取代rete.js内部的，以保持风格统一．
        // const contextMenu = new ContextMenuPlugin<Schemes>(cmevt);

        this.#editor.use(this.#area);
        this.#area.use(this.#connection);
        this.#area.use(this.#render);
        this.#area.use(this.#history);
        // this.#area.use(contextMenu);

        AreaExtensions.simpleNodesOrder(this.#area);
    }



    async init() {
        const a = new ClassicPreset.Node("A");
        a.addControl("a", new ClassicPreset.InputControl("text", { initial: "a" }));
        a.addOutput("a", new ClassicPreset.Output(sockets().auto));
        a.addOutput("b", new ClassicPreset.Output(sockets().auto));
        await this.#editor.addNode(a);

        a.addInput("b", new ClassicPreset.Input(sockets().auto));

        const b = new ClassicPreset.Node("B");
        b.addControl("b", new ClassicPreset.InputControl("text", { initial: "b" }));
        b.addInput("b", new ClassicPreset.Input(sockets().auto));
        b.addInput("c", new ClassicPreset.Input(sockets().auto));
        b.addInput("d", new ClassicPreset.Input(sockets().auto, "中文测试22"));
        await this.#editor.addNode(b);

        await this.#editor.addConnection(new ClassicPreset.Connection(a, "a", b, "b"));

        await this.#area.translate(a.id, { x: 0, y: 0 });
        await this.#area.translate(b.id, { x: 270, y: 0 });

        setTimeout(() => {
            // wait until nodes rendered because they dont have predefined width and height
            AreaExtensions.zoomAt(this.#area, this.#editor.getNodes());
        }, 10);
    }

    destroy() {
        if (this.#area) {
            this.#area.destroy()
        }
    }
};

export async function createEditor(container: HTMLElement) {
    const socket = new ClassicPreset.Socket("中文信息");

    const editor = new NodeEditor<Schemes>();
    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    const connection = new ConnectionPlugin<Schemes, AreaExtra>();
    const render = new SveltePlugin<Schemes, AreaExtra>();

    const history = new HistoryPlugin<Schemes>();

    HistoryExtensions.keyboard(history);

    history.addPreset(HistoryPresets.classic.setup());

    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
        accumulating: AreaExtensions.accumulateOnCtrl()
    });

    render.addPreset(Presets.classic.setup());

    connection.addPreset(ConnectionPresets.classic.setup());

    editor.use(area);
    area.use(connection);
    area.use(render);
    area.use(history);

    AreaExtensions.simpleNodesOrder(area);


    return {
        destroy: () => area.destroy()
    };
}
