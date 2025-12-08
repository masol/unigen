import { Eta } from "eta";

/**
 * 自定义标签常量
 */
export const TEMPLATE_TAGS = {
    // 转义插值标签（escaped interpolation）
    INTERPOLATE_START: "<<<[[[[[[[[OUTPUT_START_DO_NOT_TOUCH]]]]]]]]]>>>",
    INTERPOLATE_END: "<<<[[[[[[[[OUTPUT_END_DO_NOT_TOUCH]]]]]]]]]>>>",

    // 非转义插值标签（raw/unescaped interpolation）
    RAW_INTERPOLATE_START: "<<<[[[[[[[[OUTPUT_START_DO_NOT_TOUCH_RAW]]]]]]]]]>>>",
    RAW_INTERPOLATE_END: "<<<[[[[[[[[OUTPUT_END_DO_NOT_TOUCH_RAW]]]]]]]]]>>>",

    // 执行代码标签（execution）
    EXEC_START: "<<<[[[[[[[[EXEC_START_DO_NOT_TOUCH]]]]]]]]]>>>",
    EXEC_END: "<<<[[[[[[[[EXEC_END_DO_NOT_TOUCH]]]]]]]]]>>>"
} as const;

/**
 * 模板生成辅助函数
 */
export class TemplateBuilder {
    /**
     * 生成转义插值语句
     * @example interpolate('user.name') => '<<<[...]OUTPUT_START[...]>>>= user.name <<<[...]OUTPUT_END[...]>>>'
     */
    static interpolate(expression: string): string {
        return `${TEMPLATE_TAGS.INTERPOLATE_START}= ${expression} ${TEMPLATE_TAGS.INTERPOLATE_END}`;
    }

    /**
     * 生成非转义插值语句
     * @example raw('htmlContent') => '<<<[...]RAW_START[...]>>> htmlContent <<<[...]RAW_END[...]>>>'
     */
    static raw(expression: string): string {
        return `${TEMPLATE_TAGS.RAW_INTERPOLATE_START} ${expression} ${TEMPLATE_TAGS.RAW_INTERPOLATE_END}`;
    }

    /**
     * 生成执行代码块
     * @example exec('if (flag) { ... }') => '<<<[...]EXEC_START[...]>>>if (flag) { ... }<<<[...]EXEC_END[...]>>>'
     */
    static exec(code: string): string {
        return `${TEMPLATE_TAGS.EXEC_START}\n${code}\n${TEMPLATE_TAGS.EXEC_END}`;
    }

    /**
     * 生成 if 条件块
     */
    static if(condition: string, content: string): string {
        return this.exec(`if (${condition}) {`) + `\n${content}\n` + this.exec('}');
    }

    /**
     * 生成 for 循环块
     */
    static forEach(arrayExpr: string, itemName: string, content: string): string {
        return this.exec(`${arrayExpr}.forEach(${itemName} => {`) +
            `\n${content}\n` +
            this.exec('})');
    }

    /**
     * 生成完整的模板字符串
     */
    static template(parts: string[]): string {
        return parts.join('\n');
    }
}

/**
 * Custom Eta template engine with special delimiters
 */
class EtaTemplateEngine {
    private eta: Eta;

    // 定义自定义标签配置
    private static readonly CUSTOM_TAGS = {
        interpolate: [
            TEMPLATE_TAGS.INTERPOLATE_START,
            TEMPLATE_TAGS.INTERPOLATE_END
        ] as [string, string],
        rawInterpolate: [
            TEMPLATE_TAGS.RAW_INTERPOLATE_START,
            TEMPLATE_TAGS.RAW_INTERPOLATE_END
        ] as [string, string],
        exec: [
            TEMPLATE_TAGS.EXEC_START,
            TEMPLATE_TAGS.EXEC_END
        ] as [string, string]
    };

    constructor() {
        this.eta = new Eta({
            tags: EtaTemplateEngine.CUSTOM_TAGS.exec,
            autoTrim: false,
            parse: {
                interpolate: EtaTemplateEngine.CUSTOM_TAGS.interpolate,
                raw: EtaTemplateEngine.CUSTOM_TAGS.rawInterpolate,
                exec: EtaTemplateEngine.CUSTOM_TAGS.exec
            }
        } as never);
    }

    /**
     * 渲染模板字符串
     */
    renderString(template: string, data: Record<string, unknown>): string {
        return this.eta.renderString(template, data);
    }

    /**
     * 渲染模板文件
     */
    render(templateName: string, data: Record<string, unknown>): string {
        return this.eta.render(templateName, data);
    }

    /**
     * 获取原始 Eta 实例（如需要高级操作）
     */
    getEtaInstance(): Eta {
        return this.eta;
    }

    /**
     * 获取自定义标签配置
     */
    static getTags() {
        return EtaTemplateEngine.CUSTOM_TAGS;
    }
}

// 导出单例实例
export const eta = new EtaTemplateEngine();

// 也导出类本身，以便需要时创建新实例
export { EtaTemplateEngine };

// // 使用示例
// if (require.main === module) {
//     // 方式1: 手动拼接模板
//     const tpl1 = `
// Normal escaped:
// ${TEMPLATE_TAGS.INTERPOLATE_START}= html ${TEMPLATE_TAGS.INTERPOLATE_END}

// Raw unescaped:
// ${TEMPLATE_TAGS.RAW_INTERPOLATE_START} html ${TEMPLATE_TAGS.RAW_INTERPOLATE_END}

// ${TEMPLATE_TAGS.EXEC_START}
// if (flag) {
//   out += "\\nEXEC BLOCK WORKS";
// }
// ${TEMPLATE_TAGS.EXEC_END}
// `;

//     // 方式2: 使用 TemplateBuilder 生成模板
//     const tpl2 = TemplateBuilder.template([
//         'Normal escaped:',
//         TemplateBuilder.interpolate('html'),
//         '',
//         'Raw unescaped:',
//         TemplateBuilder.raw('html'),
//         '',
//         TemplateBuilder.exec(`
// if (flag) {
//   out += "\\nEXEC BLOCK WORKS";
// }
//         `)
//     ]);

//     // 方式3: 使用 TemplateBuilder 的高级方法
//     const tpl3 = TemplateBuilder.template([
//         'User List:',
//         TemplateBuilder.forEach('users', 'user',
//             TemplateBuilder.template([
//                 '  - Name: ' + TemplateBuilder.interpolate('user.name'),
//                 TemplateBuilder.if('user.isAdmin',
//                     '    (Administrator)'
//                 )
//             ])
//         )
//     ]);

//     console.log('=== Template 1 ===');
//     console.log(eta.renderString(tpl1, {
//         html: "<b>SAFE RAW</b>",
//         flag: true
//     }));

//     console.log('\n=== Template 2 ===');
//     console.log(eta.renderString(tpl2, {
//         html: "<b>SAFE RAW</b>",
//         flag: true
//     }));

//     console.log('\n=== Template 3 ===');
//     console.log(eta.renderString(tpl3, {
//         users: [
//             { name: 'Alice', isAdmin: true },
//             { name: 'Bob', isAdmin: false },
//             { name: 'Charlie', isAdmin: true }
//         ]
//     }));
// }