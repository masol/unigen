import type { PanelNode } from '$lib/components/dyn/ast';
import DynEntry from '$lib/components/dyn/Entry.svelte';
import type { ValueService } from "$lib/components/dyn/value-service";
import { layoutStore } from "../ui/layout.svelte";


class RValueService implements ValueService {
    /** 读值；无效/不存在返回 undefined */
    get<T = unknown>(_key: string): T | undefined {
        return undefined;
    }
    /** 写值；异步（可能落 DB / 走 IPC） */
    async set(_key: string, _value: unknown): Promise<void> {

    }

    /** 列表类操作（增删改）；返回更新后的最新值可选 */
    async listAppend(_key: string, _value: unknown): Promise<void> {

    }
    async listUpdate(_key: string, _itemId: string, _value: unknown): Promise<void> {

    }

    async listRemove(_key: string, _itemId: string): Promise<void> {

    }

    /** 单条内容按 itemId 读取（编辑列表项时取原文） */
    async getItemContent(_key: string, _itemId: string): Promise<string> {
        return "asdf"
    }

    /** 全局忙碌 / 错误（供节点显示 loading、error 条） */
    readonly isLoading: boolean = false;
    readonly error: string | null = null;
}

const serviceValue = new RValueService();

// const panel: PanelNode = {
//     type: "panel",
//     id: "root",
//     children: [
//         {
//             type: "accordion-section",
//             id: "scripts",
//             title: "剧本集",
//             icon: "IconScript",
//             defaultOpen: true,
//             badge: "count",
//             children: [
//                 {
//                     type: "text-list",
//                     id: "scripts-list",
//                     binding: { readKey: "scripts" },
//                     addLabel: "添加剧本",
//                     emptyTitle: "还没有剧本",
//                     addDialogTitle: "添加剧本",
//                     editDialogTitle: "编辑剧本",
//                     editDialogDescription: "剧本变动需要重新计算，非必要不改动。",
//                     editAlert: true,
//                 },
//             ],
//         },
//         {
//             type: "accordion-section",
//             id: "global",
//             title: "全局要求",
//             icon: "IconFileText",
//             children: [
//                 {
//                     type: "field",
//                     id: "book-name",
//                     binding: { readKey: "book_name" },
//                     label: "项目名称",
//                     editor: "inline",
//                     emptyHint: "未命名项目",
//                 },
//                 {
//                     type: "field",
//                     id: "synopsis",
//                     binding: { readKey: "synopsis" },
//                     label: "简介",
//                     editor: "dialog",
//                     dialogDescription: "简要描述项目的核心内容、主题或风格定位。",
//                 },
//                 {
//                     type: "field",
//                     id: "requirements",
//                     binding: { readKey: "requirements" },
//                     label: "其它要求",
//                     editor: "dialog",
//                     readonly: true,
//                 },
//             ],
//         },
//         {
//             type: "accordion-section",
//             id: "reference",
//             title: "风格参考",
//             icon: "IconPalette",
//             badge: "count",
//             children: [
//                 {
//                     type: "image-grid",
//                     id: "visual-style",
//                     binding: { readKey: "visualStyle" },
//                     addLabel: "选择参考图",
//                     emptyTitle: "还没有参考图",
//                     emptyHint: "这里只设置整体风格。",
//                 },
//             ],
//         },
//         {
//             type: "accordion-section",
//             id: "spec",
//             title: "视频规格",
//             icon: "IconSettings",
//             children: [
//                 {
//                     type: "select",
//                     id: "aspect",
//                     binding: { readKey: "aspectRatio" },
//                     label: "横纵比",
//                     icon: "IconAspectRatio",
//                     fallback: "9:16",
//                     options: [
//                         { value: "9:16", label: "手机竖屏", sub: "9:16" },
//                         { value: "16:9", label: "横屏", sub: "16:9" },
//                     ],
//                 },
//                 {
//                     type: "button-group",
//                     id: "pace",
//                     binding: { readKey: "pace" },
//                     label: "叙事节奏",
//                     icon: "IconGauge",
//                     fallback: "normal",
//                     columns: 3,
//                     options: [
//                         { value: "slow", label: "慢节奏", sub: "强调氛围", dot: "bg-blue-500" },
//                         { value: "normal", label: "正常", sub: "标准", dot: "bg-emerald-500" },
//                         { value: "fast", label: "快节奏", sub: "高密度", dot: "bg-amber-500" },
//                     ],
//                 },
//             ],
//         },
//     ],
// };

// const panel: PanelNode = {
//     "type": "panel",
//     "children": [
//         {
//             "type": "markdown",
//             "binding": { "readKey": "assistantOutput" },
//             "streaming": true
//         },
//         {
//             "type": "accordion-section",
//             "title": "系统提示",
//             "icon": "IconTerminal2",
//             "defaultOpen": true,
//             "children": [
//                 {
//                     "type": "field",
//                     "binding": { "readKey": "systemPrompt" },
//                     "label": "System Prompt",
//                     "editor": "dialog",
//                     "dialogDescription": "定义助手的角色、语气与约束。",
//                     "emptyHint": "点击设置系统提示"
//                 }
//             ]
//         },
//         {
//             "type": "accordion-section",
//             "title": "参考图片",
//             "icon": "IconPhoto",
//             "badge": "count",
//             "children": [
//                 {
//                     "type": "image-grid",
//                     "binding": { "readKey": "references" },
//                     "addLabel": "添加图片",
//                     "emptyTitle": "还没有参考图",
//                     "emptyHint": "上传图片作为多模态输入的上下文。",
//                     "confirmTitle": "移除图片",
//                     "confirmMessage": "确定移除这张图片？"
//                 }
//             ]
//         },
//         {
//             "type": "accordion-section",
//             "title": "模型参数",
//             "icon": "IconAdjustments",
//             "children": [
//                 {
//                     "type": "select",
//                     "binding": { "readKey": "model" },
//                     "label": "模型",
//                     "icon": "IconCpu",
//                     "fallback": "claude-opus-4-8",
//                     "options": [
//                         { "value": "claude-opus-4-8", "label": "Opus 4.8", "sub": "最强能力", "badge": { "text": "OPUS", "className": "bg-gradient-to-br from-amber-500 to-orange-600 text-white" } },
//                         { "value": "claude-sonnet-4-6", "label": "Sonnet 4.6", "sub": "均衡", "badge": { "text": "SON", "className": "bg-gradient-to-br from-sky-500 to-indigo-600 text-white" } },
//                         { "value": "claude-haiku-4-5", "label": "Haiku 4.5", "sub": "快速", "badge": { "text": "HAI", "className": "bg-gradient-to-br from-emerald-400 to-teal-600 text-white" } }
//                     ]
//                 },
//                 {
//                     "type": "button-group",
//                     "binding": { "readKey": "temperature" },
//                     "label": "创造性",
//                     "icon": "IconTemperature",
//                     "fallback": "balanced",
//                     "columns": 3,
//                     "options": [
//                         { "value": "precise", "label": "精确", "sub": "低温", "dot": "bg-blue-500" },
//                         { "value": "balanced", "label": "均衡", "sub": "中温", "dot": "bg-emerald-500" },
//                         { "value": "creative", "label": "创意", "sub": "高温", "dot": "bg-amber-500" }
//                     ]
//                 }
//             ]
//         }
//     ]
// }

const panel: PanelNode = {
    "type": "panel",
    "children": [
        {
            "type": "accordion-section",
            "title": "剧本集",
            "icon": "IconScript",
            "defaultOpen": true,
            "badge": "count",
            "children": [
                {
                    "type": "text-list",
                    "binding": { "readKey": "scripts" },
                    "addLabel": "添加剧本",
                    "emptyTitle": "还没有剧本",
                    "emptyIcon": "IconBook2",
                    "addDialogTitle": "添加剧本",
                    "editDialogTitle": "编辑剧本",
                    "editDialogDescription": "剧本变动，需要重新计算，相当于新建项目，非必要不改动剧本。",
                    "editAlert": true,
                    "confirmTitle": "删除剧本",
                    "confirmMessage": "确定要删除这段剧本吗？此操作无法撤销。"
                }
            ]
        },
        {
            "type": "accordion-section",
            "title": "全局要求",
            "icon": "IconFileText",
            "children": [
                {
                    "type": "field",
                    "binding": { "readKey": "book_name" },
                    "label": "项目名称",
                    "editor": "inline",
                    "placeholder": "输入项目名称",
                    "emptyHint": "未命名项目"
                },
                {
                    "type": "field",
                    "binding": { "readKey": "synopsis" },
                    "label": "简介",
                    "editor": "dialog",
                    "dialogTitle": "编辑简介",
                    "dialogDescription": "简要描述项目的核心内容、主题或风格定位。",
                    "emptyHint": "点击添加简介"
                },
                {
                    "type": "field",
                    "binding": { "readKey": "character_specifications" },
                    "label": "人物要求",
                    "editor": "dialog",
                    "dialogTitle": "编辑人物要求",
                    "dialogDescription": "定义主要角色的性格、背景、关系等设定。",
                    "placeholder": "依次写出要求角色的人设要求。除了主角，其它建议在素材表中填写。",
                    "emptyHint": "点击添加人物要求"
                },
                {
                    "type": "field",
                    "binding": { "readKey": "requirements" },
                    "label": "其它要求",
                    "editor": "dialog",
                    "dialogTitle": "编辑其它要求",
                    "dialogDescription": "补充任何特殊的叙事手法、情节约束或创作偏好。",
                    "placeholder": "当前版本尚未支持。仅提供了保存。",
                    "emptyHint": "点击添加其它要求",
                    "readonly": true
                }
            ]
        },
        {
            "type": "accordion-section",
            "title": "风格参考",
            "icon": "IconPalette",
            "badge": "count",
            "children": [
                {
                    "type": "image-grid",
                    "binding": { "readKey": "visualStyle" },
                    "addLabel": "选择参考图",
                    "emptyTitle": "还没有参考图",
                    "emptyIcon": "IconPhoto",
                    "emptyHint": "这里只设置整体风格。单独的环境 / 人物参考图，请在素材库生成之后，在素材库中设置。",
                    "confirmTitle": "确认删除",
                    "confirmMessage": "确定要删除这张参考图吗？"
                }
            ]
        }
    ]
}


// const panel2: PanelNode = {
//     "type": "panel",
//     "children": [
//         {
//             "type": "accordion-section",
//             "title": "论文段落",
//             "icon": "IconFileDescription",
//             "defaultOpen": true,
//             "badge": "count",
//             "children": [
//                 {
//                     "type": "text-list",
//                     "binding": { "readKey": "sections" },
//                     "addLabel": "新增段落",
//                     "emptyTitle": "还没有段落",
//                     "emptyIcon": "IconInbox",
//                     "addDialogTitle": "撰写段落",
//                     "editDialogTitle": "编辑段落",
//                     "confirmTitle": "删除段落",
//                     "confirmMessage": "确定删除此段落？"
//                 }
//             ]
//         },
//         {
//             "type": "accordion-section",
//             "title": "元信息",
//             "icon": "IconInfoCircle",
//             "children": [
//                 {
//                     "type": "field",
//                     "binding": { "readKey": "title" },
//                     "label": "论文标题",
//                     "editor": "inline",
//                     "emptyHint": "未命名论文"
//                 },
//                 {
//                     "type": "field",
//                     "binding": { "readKey": "abstract" },
//                     "label": "摘要",
//                     "editor": "dialog",
//                     "dialogDescription": "用一段话概括研究问题、方法与结论。"
//                 },
//                 {
//                     "type": "field",
//                     "binding": { "readKey": "keywords" },
//                     "label": "关键词",
//                     "editor": "inline",
//                     "placeholder": "以逗号分隔"
//                 }
//             ]
//         },
//         {
//             "type": "accordion-section",
//             "title": "格式规范",
//             "icon": "IconSettings",
//             "children": [
//                 {
//                     "type": "select",
//                     "binding": { "readKey": "citationStyle" },
//                     "label": "引用格式",
//                     "icon": "IconQuote",
//                     "fallback": "apa",
//                     "options": [
//                         { "value": "apa", "label": "APA", "sub": "第 7 版", "badge": { "text": "APA" } },
//                         { "value": "mla", "label": "MLA", "sub": "第 9 版", "badge": { "text": "MLA" } },
//                         { "value": "ieee", "label": "IEEE", "sub": "工程学科", "badge": { "text": "IEEE" } }
//                     ]
//                 },
//                 {
//                     "type": "button-group",
//                     "binding": { "readKey": "language" },
//                     "label": "写作语言",
//                     "icon": "IconLanguage",
//                     "fallback": "zh",
//                     "columns": 2,
//                     "options": [
//                         { "value": "zh", "label": "中文", "sub": "简体", "dot": "bg-rose-500" },
//                         { "value": "en", "label": "English", "sub": "学术英语", "dot": "bg-sky-500" }
//                     ]
//                 }
//             ]
//         }
//     ]
// }

const panel2: PanelNode = {
    "type": "panel",
    "children": [
        {
            "type": "accordion-section",
            "title": "视频规格",
            "icon": "IconSettings",
            "defaultOpen": true,
            "children": [
                {
                    "type": "select",
                    "binding": { "readKey": "aspectRatio" },
                    "label": "目标视频横纵比",
                    "icon": "IconAspectRatio",
                    "fallback": "9:16",
                    "options": [
                        { "value": "9:16", "label": "手机竖屏 / 抖音 / 快手", "sub": "9:16", "badge": { "text": "9:16" } },
                        { "value": "16:9", "label": "电脑 / 电视 / 哔哩哔哩", "sub": "16:9", "badge": { "text": "16:9" } },
                        { "value": "1:1", "label": "小红书 / 微信头像", "sub": "1:1", "badge": { "text": "1:1" } },
                        { "value": "4:3", "label": "传统电视 / iPad 横屏", "sub": "4:3", "badge": { "text": "4:3" } },
                        { "value": "3:4", "label": "iPad 竖屏 / 书页", "sub": "3:4", "badge": { "text": "3:4" } },
                        { "value": "21:9", "label": "电影院宽银幕 / 超宽屏", "sub": "21:9", "badge": { "text": "21:9" } },
                        { "value": "4:5", "label": "小红书竖版 / 杂志封面", "sub": "4:5", "badge": { "text": "4:5" } },
                        { "value": "2:1", "label": "微博 / 网页横幅", "sub": "2:1", "badge": { "text": "2:1" } }
                    ]
                },
                {
                    "type": "select",
                    "binding": { "readKey": "resolution" },
                    "label": "分辨率",
                    "icon": "IconDeviceTv",
                    "fallback": "480p",
                    "options": [
                        { "value": "480p", "label": "480p", "sub": "标清 / 草稿评审", "badge": { "text": "SD+", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "720p", "label": "720p", "sub": "高清 / 通用首选", "badge": { "text": "HD", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "1080p", "label": "1080p", "sub": "全高清 / 主流平台", "badge": { "text": "FHD", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "4K", "label": "4K (2160p)", "sub": "UHD / 高端制作", "badge": { "text": "UHD", "className": "bg-foreground/10 text-foreground" } }
                    ]
                },
                {
                    "type": "select",
                    "binding": { "readKey": "frameRate" },
                    "label": "帧率",
                    "icon": "IconGauge",
                    "fallback": "24",
                    "options": [
                        { "value": "24", "label": "24 fps", "sub": "电影 / 标准影视", "badge": { "text": "FPS", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "25", "label": "25 fps", "sub": "PAL 电视制式", "badge": { "text": "FPS", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "30", "label": "30 fps", "sub": "通用网络视频", "badge": { "text": "FPS", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "50", "label": "50 fps", "sub": "PAL 高帧率", "badge": { "text": "FPS", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "60", "label": "60 fps", "sub": "流畅 / 游戏 / 体育", "badge": { "text": "FPS", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "120", "label": "120 fps", "sub": "慢动作 / 高速摄影", "badge": { "text": "FPS", "className": "bg-foreground/10 text-foreground" } }
                    ]
                },
                {
                    "type": "select",
                    "binding": { "readKey": "duration" },
                    "label": "单集长度",
                    "icon": "IconClock",
                    "fallback": "3min",
                    "options": [
                        { "value": "unlimited", "label": "不分集", "sub": "由剧情自动切分", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "30s", "label": "30 秒", "sub": "快速短片", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "60s", "label": "60 秒", "sub": "标准短视频", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "3min", "label": "3 分钟", "sub": "中等篇幅", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "5min", "label": "5 分钟", "sub": "完整短剧", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "10min", "label": "10 分钟", "sub": "迷你剧", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "20min", "label": "20 分钟", "sub": "网络短剧", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "40min", "label": "40 分钟", "sub": "标准电视剧单集", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } },
                        { "value": "60min", "label": "60 分钟", "sub": "长篇剧集", "badge": { "text": "DUR", "className": "bg-foreground/10 text-foreground" } }
                    ]
                },
                {
                    "type": "button-group",
                    "binding": { "readKey": "pace" },
                    "label": "叙事节奏",
                    "icon": "IconGauge",
                    "fallback": "normal",
                    "columns": 3,
                    "options": [
                        { "value": "slow", "label": "慢节奏", "sub": "强调氛围与留白", "dot": "bg-blue-500" },
                        { "value": "normal", "label": "正常", "sub": "标准叙事节奏", "dot": "bg-emerald-500" },
                        { "value": "fast", "label": "快节奏", "sub": "高密度情节推进", "dot": "bg-amber-500" }
                    ]
                },
                {
                    "type": "select",
                    "binding": { "readKey": "language" },
                    "label": "语言",
                    "icon": "IconLanguage",
                    "fallback": "zh",
                    "options": [
                        { "value": "zh", "label": "中文", "sub": "普通话 / 简体", "badge": { "text": "ZH", "className": "bg-linear-to-br from-rose-500 to-amber-500 text-white shadow-sm" } },
                        { "value": "en", "label": "English", "sub": "美式英语", "badge": { "text": "EN", "className": "bg-linear-to-br from-sky-500 to-indigo-500 text-white shadow-sm" } },
                        { "value": "ja", "label": "日本語", "sub": "标准日语", "badge": { "text": "JA", "className": "bg-linear-to-br from-pink-500 to-fuchsia-500 text-white shadow-sm" } },
                        { "value": "ko", "label": "한국어", "sub": "标准韩语", "badge": { "text": "KO", "className": "bg-linear-to-br from-emerald-500 to-teal-500 text-white shadow-sm" } },
                        { "value": "es", "label": "Español", "sub": "西班牙语", "badge": { "text": "ES", "className": "bg-linear-to-br from-orange-500 to-red-500 text-white shadow-sm" } },
                        { "value": "fr", "label": "Français", "sub": "法语", "badge": { "text": "FR", "className": "bg-linear-to-br from-blue-500 to-cyan-500 text-white shadow-sm" } }
                    ]
                },
                {
                    "type": "select",
                    "binding": { "readKey": "audience" },
                    "label": "受众分级",
                    "icon": "IconUsersGroup",
                    "fallback": "pg",
                    "options": [
                        { "value": "g", "label": "全年龄", "sub": "适合所有人", "badge": { "text": "G", "className": "bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-sm" } },
                        { "value": "pg", "label": "辅导级", "sub": "建议家长陪同", "badge": { "text": "PG", "className": "bg-linear-to-br from-lime-400 to-green-600 text-white shadow-sm" } },
                        { "value": "pg13", "label": "13+", "sub": "13 岁以上", "badge": { "text": "PG13", "className": "bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm" } },
                        { "value": "r", "label": "限制级", "sub": "17 岁以下需陪同", "badge": { "text": "R", "className": "bg-linear-to-br from-orange-500 to-red-600 text-white shadow-sm" } },
                        { "value": "nc17", "label": "成人级", "sub": "仅限成人观看", "badge": { "text": "NC17", "className": "bg-linear-to-br from-red-500 to-rose-700 text-white shadow-sm" } }
                    ]
                },
                {
                    "type": "select",
                    "binding": { "readKey": "style" },
                    "label": "画面风格",
                    "icon": "IconPalette",
                    "fallback": "cinematic",
                    "options": [
                        { "value": "cinematic", "label": "电影", "sub": "浅景深 / 宽银幕构图", "badge": { "className": "size-7 rounded-lg border border-border/50 bg-linear-to-br from-amber-700/40 via-stone-800/30 to-neutral-900/50" } },
                        { "value": "anime", "label": "动漫", "sub": "赛璐璐 / 高饱和 / 描边", "badge": { "className": "size-7 rounded-lg border border-border/50 bg-linear-to-br from-pink-400/50 via-fuchsia-500/40 to-indigo-500/50" } },
                        { "value": "cg", "label": "CG / 3D", "sub": "PBR / 全局光照", "badge": { "className": "size-7 rounded-lg border border-border/50 bg-linear-to-br from-cyan-400/40 via-blue-600/40 to-slate-900/50" } },
                        { "value": "live", "label": "真人写实", "sub": "实拍 / 自然光 / 真实纹理", "badge": { "className": "size-7 rounded-lg border border-border/50 bg-linear-to-br from-emerald-400/30 via-teal-500/30 to-slate-800/50" } },
                        { "value": "watercolor", "label": "水墨 / 国风", "sub": "晕染 / 留白 / 东方意境", "badge": { "className": "size-7 rounded-lg border border-border/50 bg-linear-to-br from-stone-300/50 via-zinc-400/30 to-stone-700/50" } },
                        { "value": "comic", "label": "美式漫画", "sub": "硬朗线条 / 网点 / 高对比", "badge": { "className": "size-7 rounded-lg border border-border/50 bg-linear-to-br from-yellow-400/50 via-orange-500/40 to-red-600/50" } },
                        { "value": "pixel", "label": "像素 / 复古游戏", "sub": "8-bit / 16-bit 像素艺术", "badge": { "className": "size-7 rounded-lg border border-border/50 bg-linear-to-br from-lime-400/50 via-green-500/40 to-emerald-700/50" } },
                        { "value": "noir", "label": "黑色电影", "sub": "高反差 / 单色光影", "badge": { "className": "size-7 rounded-lg border border-border/50 bg-linear-to-br from-zinc-300/40 via-zinc-700/50 to-black/60" } }
                    ]
                }
            ]
        }
    ]
}

export class ActivityStore {
    clearTop() {
        const ids = layoutStore.topActivities.map((item) => item.id);
        ids.forEach((id) => {
            layoutStore.removeActivity(id)
        })
    }


    setupActivities() {
        this.clearTop();

        console.log("enter setupActivities")
        layoutStore.addActivity({
            id: "test1",
            icon: "IconAspectRatio",
            label: "test1",
            component: DynEntry,
            props: {
                ast: panel,
                service: serviceValue
            }
        })

        layoutStore.addActivity({
            id: "test2",
            icon: "IconAspectRatio",
            label: "test2",
            component: DynEntry,
            props: {
                ast: panel2,
                service: serviceValue
            }
        })

        // data.forEach((d) => {
        //     const item = {
        //         ...d,
        //         component: Entry
        //     }
        //     layoutStore.addActivity(item)
        // })
    }
}



// 左侧栏上方，项目专用store--根据项目数据动态创建全部
export const activityStore = new ActivityStore();