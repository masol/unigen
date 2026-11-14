// Project的KvStore的有效keys.

export const ProjectDbKeys = {
    version: "create-version",
    embedingModelName: 'vecModelName',
    embedingSize: 'embdingSize',
    embedingFrom: 'embeding_from',
    depplugins: "dep", //任务依赖的插件数组
    entry_capa: "entry_capa", // 入口的capability.(主任务默认执行的capability)
    entry_common: "entry_common", // 执行命令时，如果未指定命令，这是默认入口，执行意图识别+命令路由。
    //entry_commandstr // 动态拼接的command_str
    imported: "imported", // 指示任务是否已导入了初始知识库。
    projectType: "project-type", // 指示任务类型。
    chat_settings: "chat_settings", // 保存客户端为此项目设置的agent setting,如果不为空，是一个Partial<ResolvedSettings>对象。
    sessionId: "sessionId", // 指示当前打开的sessionId。可以为空，此时新建。

    // extract_json_prompt: "_extract_json",

    /// 下面是video插件定义的keys，先写这里了，应该移入video plugin.
    // scripts: "script",
    // synopsis: "synopsis",
    // character_specifications: 'character_specifications',
    // book_name: 'book_name',
    // requirements: 'requirements',
    // spec settings.
    // aspectRatio: "aspect-ratio",
    // resolution: "resolution",
    // frameRate: "frame-rate",
    // duration: "duration",
    // pace: "pace",
    // language: "language",
    // audience: "audience",
    // style: "style",
    // ScriptbyId: (id: string) => `script_${id}`
} as const;