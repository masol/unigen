import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, Node } from 'mdast';
import type { CompileResult, CompileOptions } from './types';
import { multiPass } from './plugins/index';
import { genFunctor } from './plugins/genfunctor';
import { complete } from './plugins/complete/index'

/**
 * 将 Markdown 编译为 MDAST，并进行多遍处理
 * 支持 HTML 内容的宽松解析，保留为 html 节点
 * 包含完整的位置信息（行、列、偏移量）
 */
export async function compile(
    markdown: string,
    options: CompileOptions = {}
): Promise<CompileResult> {
    const {
        gfm = true,
        // commonmark = false,
    } = options;

    // 创建处理器 - 宽松模式，保留 HTML
    const processor = unified()
        .use(remarkParse);

    // 可选：添加 GFM 支持
    if (gfm) {
        processor.use(remarkGfm);
    }

    // 解析 Markdown（HTML 会自动保留为 html 节点）
    // parse() 方法默认会保留位置信息
    const tree = processor.parse(markdown) as Root;

    // 手动运行转换器（如果有的话），同时保留位置信息
    const transformedTree = (await processor.run(tree)) as Root;

    // console.log("compiled mdast=");
    // console.dir(transformedTree, {
    //     depth: 10
    // });

    // 多遍处理
    const processedTree = multiPass(transformedTree);

    // console.log("multiPass mdast=");
    // console.dir(processedTree, {
    //     depth: 10
    // });
    return { tree: processedTree };
}

/**
 * 更宽松的编译模式 - 使用自定义插件确保所有 HTML 都被保留
 * 同时保留完整的位置信息
 */
export async function compileLoose(
    markdown: string,
    options: CompileOptions = {}
): Promise<CompileResult> {
    void (options);

    const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        // 添加自定义插件：确保 HTML 被保留为 html 节点
        .use(() => (tree: Root) => {
            // remark-parse 默认已经将 HTML 保留为 html 节点
            // 这里可以添加额外的处理逻辑
            // 确保不修改 position 属性
            return tree;
        });

    const tree = processor.parse(markdown) as Root;
    const transformedTree = (await processor.run(tree)) as Root;

    console.dir(transformedTree, {
        depth: 10
    });

    // 多遍处理
    // const processedTree = multiPass(transformedTree);

    return { tree: transformedTree };
}

/**
 * 辅助函数：验证节点是否包含位置信息
 */
export function hasPosition(node: Node): boolean {
    return (
        node.position !== undefined &&
        node.position !== null &&
        node.position.start !== undefined &&
        node.position.end !== undefined &&
        typeof node.position.start.line === 'number' &&
        typeof node.position.start.column === 'number' &&
        typeof node.position.end.line === 'number' &&
        typeof node.position.end.column === 'number'
    );
}

/**
 * 辅助函数：获取节点的位置信息摘要
 */
export function getPositionSummary(node: Node): string | null {
    if (!hasPosition(node) || !node.position) {
        return null;
    }

    const { start, end } = node.position;
    return `[${start.line}:${start.column}-${end.line}:${end.column}]`;
}

/**
 * 辅助函数：获取节点的完整位置信息
 */
export function getPosition(node: Node) {
    return node.position;
}

/**
 * 辅助函数：遍历 AST 并打印位置信息
 */
export function printPositions(tree: Root, indent = 0): void {
    // const spaces = ' '.repeat(indent);

    const visit = (node: Node, level: number) => {
        const pos = getPositionSummary(node);
        console.log(`${' '.repeat(level * 2)}${node.type} ${pos || '(no position)'}`);

        if ('children' in node && Array.isArray(node.children)) {
            (node.children as Node[]).forEach(child => visit(child, level + 1));
        }
    };

    visit(tree, indent);
}

// 默认导出
export default compile;

export { genFunctor, complete };

// 导出类型
export type { CompileResult, CompileOptions, Root };
