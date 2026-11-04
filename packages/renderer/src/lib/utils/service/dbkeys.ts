
export const DbKeys = {
    sessionId: "sessionId", // 指示当前打开的sessionId。可以为空，此时新建。

    // deprecated:
    // input-manangers.
    scripts: "script",
    synopsis: "synopsis",
    character_specifications: 'character_specifications',
    book_name: 'book_name',
    requirements: 'requirements',
    // spec settings.
    aspectRatio: "aspect-ratio",
    resolution: "resolution",
    frameRate: "frame-rate",
    duration: "duration",
    pace: "pace",
    language: "language",
    audience: "audience",
    style: "style",
    depplugins: "dep", //项目依赖的插件数组
    ScriptbyId: (id: string) => `script_${id}`
} as const;