import type {
    CodeRuntimeEntry,
    CodeRuntimeEvent,
    CodeRuntimeInfo,
    CodeRuntimeState,
    CodeRuntimeTestResult,
} from './types';

/**
 * 代码执行能力对外接口。
 *
 * 约定：
 *  1. 所有操作一律以环境 id 为入参，避免每加一种语言就多一个 procedure；
 *  2. service 只负责"抛"，UI/store 负责"显示"（toast 在 store）；
 *  3. enable 只触发安装，进度通过事件流推送给前端；立即返回不阻塞；
 *  4. 未接入真实主进程前，下面这一段是 fake：listCodeRuntimes / enable / disable /
 *     test 四个动作 + 一条事件通道，与真实 ipc 形状对齐。
 */

const FAKE_INFOS: CodeRuntimeInfo[] = [
    {
        id: 'python',
        name: 'Python',
        icon: 'IconBrandPython',
        kind: 'language',
        tagline: '用于数据分析、Excel/CSV 处理、图表、PDF',
        capability: '计算和分析数据、生成图表、处理表格与 PDF。',
        language: 'python',
        approximateDownloadMB: 120,
        testSnippet: 'print(1 + 1)',
    },
    {
        id: 'nodejs',
        name: 'Node.js',
        kind: 'language',
        icon: 'IconBrandNodejs',
        tagline: '用于网页抓取、文档转换、调用本地工具',
        capability: '运行 JS 脚本、处理文档与网页内容。',
        language: 'node',
        approximateDownloadMB: 60,
        testSnippet: 'console.log(1 + 1)',
    },
];

const FAKE_VERSIONS: Record<string, string> = {
    python: '3.12.8',
    nodejs: '20.11.1',
};

const STATES = new Map<string, CodeRuntimeState>();

function initStates() {
    for (const info of FAKE_INFOS) {
        if (STATES.has(info.id)) continue;
        STATES.set(info.id, { id: info.id, status: 'disabled' });
    }
}
initStates();

// ── 事件分发（fake：内建回调池；真实环境由主进程 evtBus → ipcRenderer 驱动） ──

type Listener = (event: CodeRuntimeEvent) => void;
const listeners = new Set<Listener>();

function emit(state: CodeRuntimeState): void {
    const snapshot: CodeRuntimeEvent = { id: state.id, state: { ...state } };
    for (const l of listeners) {
        try {
            l(snapshot);
        } catch (err) {
            // 单个监听器异常不能拖垮其它监听器
            console.error('[code-runtime] listener error', err);
        }
    }
}

function patch(
    id: string,
    patchObj: Partial<CodeRuntimeState>,
): CodeRuntimeState | null {
    const state = STATES.get(id);
    if (!state) return null;
    Object.assign(state, patchObj);
    emit(state);
    return state;
}

// ── 对外接口 ──

export async function listCodeRuntimes(): Promise<CodeRuntimeEntry[]> {
    await new Promise((r) => setTimeout(r, 2000));
    return FAKE_INFOS.map((info) => ({
        info,
        state: { ...STATES.get(info.id)! },
    }));
}

/** 触发安装流程；不等待安装完成，进度通过事件流推送。 */
export async function enableCodeRuntime(id: string): Promise<void> {
    const state = STATES.get(id);
    if (!state) throw new Error(`未知的代码环境: ${id}`);
    if (state.status === 'ready' || state.status === 'preparing') return;

    patch(id, {
        status: 'preparing',
        progress: 0,
        message: '准备安装…',
        error: undefined,
    });
    void simulateInstall(id);
}

export async function disableCodeRuntime(id: string): Promise<void> {
    const state = STATES.get(id);
    if (!state) return;
    patch(id, {
        status: 'disabled',
        progress: undefined,
        message: undefined,
        error: undefined,
    });
}

export async function testCodeRuntime(
    id: string,
    code: string,
): Promise<CodeRuntimeTestResult> {
    const state = STATES.get(id);
    if (!state || state.status !== 'ready') {
        throw new Error('环境尚未就绪');
    }
    // 保留参数签名，方便未来主进程侧直接转发
    void code;
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 300));
    return {
        ok: true,
        output: '2',
        elapsedMs: Date.now() - start,
    };
}

/** 订阅状态事件 —— 返回取消函数。 */
export function subscribeCodeRuntimeEvents(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

// ── Fake 安装进度 ──

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function simulateInstall(id: string): Promise<void> {
    const steps: Array<{
        delay: number;
        patch: Partial<CodeRuntimeState>;
    }> = [
            { delay: 600, patch: { progress: 25, message: '下载安装包…' } },
            { delay: 1200, patch: { progress: 60, message: '校验完整性…' } },
            { delay: 1200, patch: { progress: 85, message: '解压并配置…' } },
            {
                delay: 1200,
                patch: {
                    status: 'ready',
                    progress: 100,
                    message: undefined,
                    version: FAKE_VERSIONS[id] ?? '1.0.0',
                },
            },
        ];

    for (const step of steps) {
        await sleep(step.delay);
        const current = STATES.get(id);
        // 用户中途关闭 → 停止模拟
        if (!current || current.status !== 'preparing') return;
        patch(id, step.patch);
    }
}