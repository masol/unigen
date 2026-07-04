// Project的KvStore的有效keys.

export const ProjectDbKeys = {
    embedingModelName: 'vecModelName',
    embedingSize: 'embdingSize',
    embedingFrom: 'embeding_from',
    depplugins: "dep", //项目依赖的插件数组
    entry_capa: "entry_capa", // 入口的capability.(主任务默认执行的capability)

    /// 下面是video插件定义的keys，先写这里了，应该移入video plugin.
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
    ScriptbyId: (id: string) => `script_${id}`
} as const;