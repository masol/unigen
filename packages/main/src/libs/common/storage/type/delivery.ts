import { z } from "zod";

/**
 * Working mode of a deliverable.
 */
export enum WorkMode {
    /** 独立文件 - A single, self-contained file */
    Standalone = "standalone",
    /** 工程项目 - A multi-file system requiring build/deployment */
    Project = "project",
    /** 轻量文档 - A lightweight, collaborative document */
    Lightweight = "lightweight",
}

/**
 * Schema for extracting classifier output from natural language text.
 * 
 * Expected input text format:
 * ```
 * 工作模式：独立文件
 * 载体格式：PDF
 * 交付物标题：Q3销售数据分析报告
 * 存疑：<optional conflict note>
 * ```
 * 
 * Extraction steps:
 * 1. Parse text into key-value pairs
 * 2. Map Chinese field names to English keys
 * 3. Validate against this schema
 */
export const DeliverableClassifierSchema = z.object({
    /**
     * Working mode (工作模式)
     * 
     * Maps from Chinese values:
     * - "独立文件" → WorkMode.Standalone
     * - "工程项目" → WorkMode.Project
     * - "轻量文档" → WorkMode.Lightweight
     * 
     * Extraction pattern: /工作模式[：:]\s*(.+)/
     */
    workMode: z.enum(WorkMode).describe(
        "Working mode extracted from '工作模式：' line. Must be one of: standalone (独立文件), project (工程项目), lightweight (轻量文档)"
    ),

    /**
     * Carrier format (载体格式)
     * 
     * Free-text description, 1-50 characters.
     * Examples: "PDF", "SQL脚本", "REST API", "网站", "Markdown文档"
     * 
     * Extraction pattern: /载体格式[：:]\s*(.+)/
     */
    carrierFormat: z
        .string()
        .min(1, "Carrier format cannot be empty")
        .max(50, "Carrier format must be ≤50 characters")
        .describe(
            "Carrier format extracted from '载体格式：' line. Free text, 1-50 chars, e.g., 'PDF', 'SQL脚本', 'REST API', '网站', 'Markdown文档'"
        ),

    /**
     * Deliverable title (交付物标题)
     * 
     * Concise subject name, 2-30 characters, original language preserved.
     * Examples: "Q3销售数据分析报告", "database migration script", "服务健康度监控看板"
     * 
     * Extraction pattern: /交付物标题[：:]\s*(.+)/
     */
    deliverableTitle: z
        .string()
        .min(2, "Deliverable title must be at least 2 characters")
        .max(30, "Deliverable title must be ≤30 characters")
        .describe(
            "Deliverable title extracted from '交付物标题：' line. 2-30 chars, original language, e.g., 'Q3销售数据分析报告', 'database migration script'"
        ),

    /**
     * Ambiguity note (存疑)
     * 
     * Optional. Present only when conflicting signals detected.
     * ≤40 characters.
     * 
     * Extraction pattern: /存疑[：:]\s*(.+)/
     * If line not present, this field should be undefined (not null, not empty string).
     */
    doubt: z
        .string()
        .max(40, "Doubt note must be ≤40 characters")
        .optional()
        .describe(
            "Optional conflict note extracted from '存疑：' line. Present only when ambiguous, ≤40 chars, e.g., 'Excel偏文件，部署偏工程'"
        ),
});

export type DeliverableClassifierOutput = z.infer<typeof DeliverableClassifierSchema>;
