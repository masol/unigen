import { z } from "zod";
import { leftSidebarItemJSONSchema } from "./sidebar.js";


/**
 * 单个蓝图名称候选项 —— 提示不再是裸字符串，而是带描述的结构。
 *  - value：写入过滤输入框的实际文本（也是列表按名称过滤所用的值）。
 *  - desc：可选的一句话描述，既用于展示，也参与拼音模糊搜索。
 */
export const blueprintFilterOptionSchema = z.object({
    value: z.string(),
    desc: z.string().optional(),
});

export type BlueprintFilterOption = z.infer<typeof blueprintFilterOptionSchema>;

/**
 * 蓝图名称推荐列表 —— 用于术语表/元术语表/能力表输入框的辅助下拉。
 * 不设置或对应数组为空 = 不出现下拉（与现状一致，纯文本输入）。
 * 设置了非空数组 = 输入框升级为可搜索 Combobox：仍可自由输入任意文本（开放搜索），
 *                候选项仅作快捷入口，且支持名称 / 描述 / 拼音 / 首字母模糊匹配。
 */
export const blueprintFiltersSchema = z.object({
    /** 术语表候选项 */
    glossary: z.array(blueprintFilterOptionSchema).optional(),
    /** 元术语表候选项 */
    metag: z.array(blueprintFilterOptionSchema).optional(),
    /** 能力表候选项 */
    capa: z.array(blueprintFilterOptionSchema).optional(),
});

export type BlueprintFilters = z.infer<typeof blueprintFiltersSchema>;

/**
 * 媒体资源字段名列表 —— 用于在编辑器侧识别"素材"下拉。
 *
 * 业务语义：某些 JSON 字段名（以 `_path` 结尾是常见约定，但不是强制）
 * 表示相对于任务根的媒体资源路径。编辑器读取 JSON 后，会把这些字段聚合为一个
 * "素材"下拉菜单，便于用户一键在本地显示或用系统应用打开。
 *
 * 不设置 = 不出现素材下拉（与现状一致）。
 */
export const projectActivityDataSchema = z.object({
    /// 工作台header处的图标。
    icon: z.string(),
    /// 如果设置，为markdown内容，此时，打开/创建此类型的任务时，会以对话框方式通知用户。用于重要信息说明。
    status: z.string().optional(),
    /// 在状态栏右侧的简短显示--通常用于指示此项目类型--可以与entry中的name相同。
    statusText: z.string(),
    // 欢迎字符串。如果无内容，检查类型目录下welcome.md，如果存在，则返回其内容。否则退化为原始的固定字符串。
    welcome: z.string().optional(),
    // 面板定义，用于定义用户可设置的项--用户设置直接改变kv-store中变量，提示词中可以直接索引和使用这些变量，运行期会加载最新变量。
    activities: z.array(leftSidebarItemJSONSchema).optional(),
    // 工作台header处的文字及详情。过长会被裁剪。
    header: z.object({
        title: z.string(),
        detail: z.string(),
    }),
    /**
     * 三张蓝图表的名称候选列表。
     */
    blueprintFilters: blueprintFiltersSchema.optional(),
    /**
     * 媒体资源字段名列表（如 ["image_path", "audio_path"]）。
     * 读取 JSON 时，凡是 key 命中列表且 value 为非空字符串的，都会在编辑器
     * 顶部渲染为"素材"下拉。不设置或空数组 = 不渲染。
     */
    mediaFields: z.array(z.string()).optional(),
});

export type ProjectActivityData = z.infer<typeof projectActivityDataSchema>;