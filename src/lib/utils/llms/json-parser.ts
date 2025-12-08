import { decode } from 'html-entities';
import JSON5 from 'json5';
import { marked, type Tokens } from "marked";
import { isEmpty } from "remeda";

/**
 * JSON 解析工具类
 */
export class JSONParser {
    /**
     * 解析 JSON 字符串
     */
    static parseJSON(jsonString: string): unknown {
        const parsingAttempts = [
            () => JSON5.parse(jsonString),
            () => JSON5.parse(decode(jsonString))
        ];

        for (const attempt of parsingAttempts) {
            try {
                const result = attempt();
                if (!isEmpty(result)) {
                    return result;
                }
            } catch {
                continue;
            }
        }
        return null;
    }

    /**
     * 从 Markdown 中提取 JSON 代码块
     */
    static extractJsonBlock(markdown: string): unknown {
        const tokens = marked.lexer(markdown);

        const jsonBlocks = tokens
            .filter((t): t is Tokens.Code => t.type === "code")
            .filter(t => !t.lang || t.lang.toLowerCase() === "json")
            .map(t => {
                try {
                    return this.parseJSON(t.text.trim());
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        if (jsonBlocks.length > 0) {
            return jsonBlocks[0];
        }
        return null;
    }

    /**
     * 提取 JSON（尝试多种方式）
     */
    static async extractJSON(jsonString: string): Promise<unknown> {
        const parsingAttempts = [
            () => this.parseJSON(jsonString),
            () => this.extractJsonBlock(jsonString),
        ];

        for (const attempt of parsingAttempts) {
            try {
                const result = attempt();
                if (result && !isEmpty(result)) {
                    return result;
                }
            } catch {
                continue;
            }
        }

        return null;
    }

    /**
     * 创建 JSON 修复提示词
     */
    static createJSONFixPrompt(invalidResponse: string): string {
        return `
以下内容应该是JSON格式，但因为语法错误，解析失败了：

${invalidResponse}

请修复并返回正确的JSON格式。只返回修复后的JSON，不要添加任何解释或其他内容。
        `.trim();
    }
}