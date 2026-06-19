export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
    id: string;
    level: LogLevel;
    time: string;
    component: string | null;
    message: string;
};

export type LogLevelMeta = {
    label: string;
    tone: string;
    bar: string;
    chip: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
};