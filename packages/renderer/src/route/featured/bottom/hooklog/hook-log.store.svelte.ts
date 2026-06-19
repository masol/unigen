import type { LogLevel, LogEntry } from './types';

const MOCK_COMPONENTS: (string | null)[] = [
    "LayoutStore",
    "AppLoader",
    "RpcClient",
    "AuthService",
    "FileExplorer",
    "TerminalView",
    "NotificationHub",
    "WindowManager",
    null,
    "SocketBridge",
    "ThemeEngine",
    "PluginHost",
];

const MOCK_MESSAGES: Record<LogLevel, string[]> = {
    info: [
        "activity registered, id=file-explorer, total=1",
        "connection established to ws://localhost:9000",
        "user session restored from cache (uid=42)",
        "plugin loaded: media-preview v2.3.1",
        "workspace synced successfully (124 files)",
        'theme switched to "Graphite Dark"',
        "hook registered: onWindowFocus → LayoutStore.refresh",
    ],
    debug: [
        "state transition: idle → loading",
        "cache hit: /api/system/config (12ms)",
        "event dispatched: layout.resize { w: 1280, h: 720 }",
        "rendering 47 items in viewport",
        "rpc frame size=2.4kb, channel=system",
        "reactive deps recomputed in 0.8ms",
    ],
    warn: [
        "slow query detected: 1245ms on /system/manifest",
        "deprecated API usage: legacy.openWindow()",
        "reconnection attempt 2/5 in 3s",
        "frame budget exceeded: 22ms (target 16ms)",
    ],
    error: [
        "failed to fetch manifest: NetworkError",
        "unhandled rejection in worker thread #3",
        "permission denied: /sys/devices/cpu",
        "rpc timeout: system.hooklog after 5000ms",
    ],
};

function pad(n: number, w = 2) {
    return String(n).padStart(w, "0");
}

function nowTime() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function randomLog(): LogEntry {
    const weights: LogLevel[] = [
        "info",
        "info",
        "info",
        "info",
        "debug",
        "debug",
        "warn",
        "error",
    ];
    const level = weights[Math.floor(Math.random() * weights.length)];
    const component =
        MOCK_COMPONENTS[Math.floor(Math.random() * MOCK_COMPONENTS.length)];
    const pool = MOCK_MESSAGES[level];
    const message = pool[Math.floor(Math.random() * pool.length)];
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        level,
        time: nowTime(),
        component,
        message,
    };
}

async function* mockHookLog(): AsyncGenerator<LogEntry> {
    while (true) {
        await new Promise((r) => setTimeout(r, 220 + Math.random() * 1100));
        yield randomLog();
    }
}

function createHookLogStore(maxBuffer = 800) {
    let logs = $state<LogEntry[]>([]);
    let connected = $state(false);
    let paused = $state(false);
    let cancelled = false;

    async function consumeStream() {
        const stream = mockHookLog();
        connected = true;
        try {
            for await (const entry of stream) {
                if (cancelled) break;
                if (paused) continue;
                logs.unshift(entry);
                if (logs.length > maxBuffer) {
                    logs.pop();
                }
            }
        } finally {
            connected = false;
        }
    }

    function start() {
        if (cancelled) {
            cancelled = false;
        }
        if (!connected && !paused) {
            consumeStream();
        }
    }

    function stop() {
        cancelled = true;
        connected = false;
    }

    function togglePause() {
        paused = !paused;
        if (!paused && !connected && !cancelled) {
            consumeStream();
        }
    }

    function clear() {
        logs = [];
    }

    function seedHistory() {
        const seed: LogEntry[] = [];
        const baseTime = Date.now() - 60 * 1000;
        for (let i = 0; i < 24; i++) {
            const e = randomLog();
            const d = new Date(baseTime + i * 1800);
            e.time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
            seed.push(e);
        }
        logs = seed.reverse();
    }

    return {
        get logs() {
            return logs;
        },
        get connected() {
            return connected;
        },
        get paused() {
            return paused;
        },
        start,
        stop,
        togglePause,
        clear,
        seedHistory,
    };
}

export const hookLogStore = createHookLogStore();