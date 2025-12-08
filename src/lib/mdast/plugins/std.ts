import type { Root, RootContent, Text, Paragraph, Parent } from 'mdast';
import { visit, SKIP } from 'unist-util-visit';

// 类型守卫
function isText(node: RootContent): node is Text {
    return node.type === 'text';
}

function isParagraph(node: RootContent): node is Paragraph {
    return node.type === 'paragraph';
}

function isParent(node: unknown): node is Parent {
    return (
        typeof node === 'object' &&
        node !== null &&
        'children' in node &&
        Array.isArray((node as Parent).children)
    );
}

/**
 * 第一遍：清理和标准化
 * - 移除空文本节点
 * - 标准化空白字符
 */
export function normalizePass(tree: Root): Root {
    visit(tree, (node, index, parent) => {
        if (!parent || parent.type !== 'root') {
            return;
        }

        const content = node as RootContent;

        // 移除空文本节点
        if (isText(content) && content.value.trim() === '') {
            if (isParent(parent) && typeof index === 'number') {
                parent.children.splice(index, 1);
                return [SKIP, index] as const;
            }
        }

        // 标准化文本中的空白字符
        if (isText(content)) {
            content.value = content.value.replace(/\s+/g, ' ');
        }
    });

    return tree;
}

/**
 * 第二遍：合并相邻节点
 * - 合并相邻的文本节点
 */
export function mergePass(tree: Root): Root {
    visit(tree, (node, index, parent) => {
        if (!parent || parent.type !== 'root') {
            return;
        }

        const content = node as RootContent;

        if (
            isParent(parent) &&
            typeof index === 'number' &&
            index > 0 &&
            parent.children.length > index
        ) {
            const prevNode = parent.children[index - 1] as RootContent;

            // 合并相邻的文本节点
            if (isText(content) && isText(prevNode)) {
                prevNode.value += content.value;
                parent.children.splice(index, 1);
                return [SKIP, index] as const;
            }
        }
    });

    return tree;
}

/**
 * 第三遍：优化和清理
 * - 移除空段落
 * - 移除空列表
 */
export function optimizePass(tree: Root): Root {
    visit(tree, (node, index, parent) => {
        if (!parent || parent.type !== 'root') {
            return;
        }

        const content = node as RootContent;

        // 移除空段落
        if (isParagraph(content) && (!content.children || content.children.length === 0)) {
            if (isParent(parent) && typeof index === 'number') {
                parent.children.splice(index, 1);
                return [SKIP, index] as const;
            }
        }

        // 移除空列表
        if (
            content.type === 'list' &&
            (!content.children || content.children.length === 0)
        ) {
            if (isParent(parent) && typeof index === 'number') {
                parent.children.splice(index, 1);
                return [SKIP, index] as const;
            }
        }
    });

    return tree;
}
