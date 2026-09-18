import { z } from "zod";

/**
 * Working mode of a deliverable.
 */
export enum WorkMode {
    /** 二进制文件 - Binary files requiring specific software (PDF, Word, Excel, PPT, video, audio, images) */
    Binary = "binary",
    /** 多文件项目 - Multi-file engineering projects (websites, APIs, applications, systems, plugins) */
    Project = "project",
    /** 纯文档 - Pure text documents saved as Markdown */
    Document = "document",
}

/**
 * Schema for extracting classifier output from natural language text.
 * 
 * Expected input text format:
 * ```
 * 工作模式：二进制文件
 * 载体格式：PDF
 * 交付物标题：Q3销售数据分析报告
 * 存疑：<optional conflict note>
 * ```
 * 
 * Extraction steps:
 * 1. Parse text into key-value pairs
 * 2. Map Chinese field names to English keys
 * 3. Map Chinese working mode values to enum values
 * 4. Validate against this schema
 */
export const DeliverableClassifierSchema = z.object({
    /**
     * Working mode (工作模式)
     * 
     * Maps from Chinese values:
     * - "二进制文件" → WorkMode.Binary
     * - "多文件项目" → WorkMode.Project
     * - "纯文档" → WorkMode.Document
     * 
     * Classification logic:
     * - Binary: PDF, Word, Excel, PPT, videos, audio, images, rich media requiring specific software
     * - Project: Websites, APIs, services, applications, systems, plugins requiring multiple files
     * - Document: Text-based content saved as Markdown (scripts, configs, simple docs)
     * 
     * Extraction pattern: /工作模式[：:]\s*(.+)/
     */
    workMode: z.nativeEnum(WorkMode).describe(
        "Working mode extracted from '工作模式：' line. Must be one of: binary (二进制文件), project (多文件项目), document (纯文档)"
    ),

    /**
     * Carrier format (载体格式)
     * 
     * Free-text description, 1-50 characters.
     * 
     * For binary files: "PDF", "Word", "Excel", "PPT", "视频", "音频", "图片", "海报"
     * For projects: "网站", "REST API", "API服务", "浏览器插件", "系统", "平台"
     * For documents: "Markdown文档", "Python脚本", "SQL脚本", "YAML配置", "JSON配置"
     * 
     * Note: All documents are saved as Markdown; this field indicates the final presentation form.
     * 
     * Extraction pattern: /载体格式[：:]\s*(.+)/
     */
    carrierFormat: z
        .string()
        .min(1, "Carrier format cannot be empty")
        .max(50, "Carrier format must be ≤50 characters")
        .describe(
            "Carrier format extracted from '载体格式：' line. Free text, 1-50 chars. Examples: 'PDF', 'Word', 'SQL脚本', 'REST API', '网站', 'Markdown文档'"
        ),

    /**
     * Deliverable title (交付物标题)
     * 
     * Concise subject name, 2-30 characters, original language preserved.
     * 
     * Extraction rules:
     * - Remove verbs (生成, 创建, 编写, 实现, 搭建, 开发)
     * - Remove quantifiers (一个, 一套, 一份)
     * - Keep business-relevant temporal identifiers (Q3, 2024, 年度, 季度)
     * - Remove generic modifiers (完整的, 详细的, 高质量的)
     * 
     * Examples: "Q3销售数据分析报告", "database migration script", "服务健康度监控看板"
     * 
     * Extraction pattern: /交付物标题[：:]\s*(.+)/
     */
    deliverableTitle: z
        .string()
        .min(2, "Deliverable title must be at least 2 characters")
        .max(30, "Deliverable title must be ≤30 characters")
        .describe(
            "Deliverable title extracted from '交付物标题：' line. 2-30 chars, original language preserved. Examples: 'Q3销售数据分析报告', 'database migration script', '服务监控看板'"
        ),

    /**
     * Ambiguity note (存疑)
     * 
     * Optional. Present only when conflicting signals detected.
     * ≤40 characters.
     * 
     * Common conflict scenarios:
     * - Binary format keywords + deployment behavior (e.g., "PDF系统", "Excel服务")
     * - Multiple parallel deliverables (e.g., "报告和工具", "文档及PPT")
     * - Carrier format contradicts scenario behavior
     * 
     * Extraction pattern: /存疑[：:]\s*(.+)/
     * If line not present, this field should be undefined (not null, not empty string).
     */
    doubt: z
        .string()
        .max(40, "Doubt note must be ≤40 characters")
        .optional()
        .describe(
            "Optional conflict note extracted from '存疑：' line. Present only when ambiguous, ≤40 chars. Examples: 'Excel偏二进制，部署偏工程', '包含多个交付物'"
        ),
});

export type DeliverableClassifierOutput = z.infer<typeof DeliverableClassifierSchema>;