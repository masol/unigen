// Project的KvStore的有效keys.

export const ProjectDbKeys = {
    embedingModelName: 'vecModelName',
    embedingSize: 'embdingSize',
    embedingFrom: 'embeding_from',
    depplugins: "dep", //项目依赖的插件数组
    entry_capa: "entry_capa", // 入口的capability.(主任务默认执行的capability)
    entry_common: "entry_common", // 执行命令时，如果未指定命令，这是默认入口，执行意图识别+命令路由。
    //entry_commandstr // 动态拼接的command_str
    imported: "imported", // 指示项目是否已导入了初始知识库。

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