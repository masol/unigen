import type { Root, Html, Parent } from 'mdast';
import { visit, SKIP } from 'unist-util-visit';
import * as parse5 from 'parse5';
import type { HtmlWithChildren } from '../types'

/**
 * 使用 parse5 解析 HTML 标签的属性
 */
function parseAttributes(html: string): Record<string, string> {
    try {
        const fragment = parse5.parseFragment(html);
        if (fragment.childNodes.length > 0) {
            const firstNode = fragment.childNodes[0];
            // 检查是否是元素节点
            if ('attrs' in firstNode && Array.isArray(firstNode.attrs)) {
                const attrs: Record<string, string> = {};
                for (const attr of firstNode.attrs) {
                    attrs[attr.name] = attr.value;
                }
                return attrs;
            }
        }
    } catch (error) {
        console.warn('Failed to parse HTML attributes:', html, error);
    }
    return {};
}

/**
 * 解析HTML标签信息
 */
function parseHtmlTag(html: string): {
    isOpening: boolean;
    isClosing: boolean;
    isSelfClosing: boolean;
    tagName: string;
    attributes: Record<string, string>;
} {
    // 自闭合标签: <tag />
    const selfClosingMatch = html.match(/^<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)\/\s*>$/);
    if (selfClosingMatch) {
        return {
            isOpening: false,
            isClosing: false,
            isSelfClosing: true,
            tagName: selfClosingMatch[1],
            attributes: parseAttributes(html),
        };
    }

    // 结束标签: </tag>
    const closingMatch = html.match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>$/);
    if (closingMatch) {
        return {
            isOpening: false,
            isClosing: true,
            isSelfClosing: false,
            tagName: closingMatch[1],
            attributes: {},
        };
    }

    // 开始标签: <tag attr="value">
    const openingMatch = html.match(/^<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>$/);
    if (openingMatch) {
        return {
            isOpening: true,
            isClosing: false,
            isSelfClosing: false,
            tagName: openingMatch[1],
            attributes: parseAttributes(html),
        };
    }

    return {
        isOpening: false,
        isClosing: false,
        isSelfClosing: false,
        tagName: '',
        attributes: {},
    };
}

/**
 * 处理HTML标签配对
 * - 找到配对的开始和结束HTML标签
 * - 将它们之间的节点移除并作为 children 存储（符合 mdast 规范）
 * - 保留标签名和属性信息在 data 中
 */
export function htmlPairPass(tree: Root): Root {
    const stack: Array<{
        node: HtmlWithChildren;
        parent: Parent;
        index: number;
        tagName: string;
    }> = [];

    visit(tree, (node, index, parent) => {
        if (node.type !== 'html' || index === undefined || !parent || !('children' in parent)) {
            return;
        }

        const htmlNode = node as Html;
        const tagInfo = parseHtmlTag(htmlNode.value);

        // 自闭合标签，保存标签信息
        if (tagInfo.isSelfClosing) {
            const enhancedNode: HtmlWithChildren = {
                type: 'html',
                value: htmlNode.value,
                children: [],
                data: {
                    ...htmlNode.data,
                    htmlTagName: tagInfo.tagName,
                    htmlAttributes: tagInfo.attributes,
                },
            };
            parent.children[index] = enhancedNode;
            return;
        }

        // 开始标签，入栈
        if (tagInfo.isOpening) {
            const enhancedNode: HtmlWithChildren = {
                type: 'html',
                value: htmlNode.value,
                children: [],
                data: {
                    ...htmlNode.data,
                    htmlTagName: tagInfo.tagName,
                    htmlAttributes: tagInfo.attributes,
                },
            };
            parent.children[index] = enhancedNode;

            stack.push({
                node: enhancedNode,
                parent: parent as Parent,
                index,
                tagName: tagInfo.tagName,
            });
            return;
        }

        // 结束标签，出栈并配对
        if (tagInfo.isClosing) {
            // 从栈顶向下查找匹配的开始标签
            let matchIndex = -1;
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i].tagName === tagInfo.tagName) {
                    matchIndex = i;
                    break;
                }
            }

            if (matchIndex !== -1) {
                const opening = stack[matchIndex];
                const openingParent = opening.parent;

                const startIndex = opening.index;
                const endIndex = index;

                // 提取开始标签和结束标签之间的节点
                const capturedNodes = openingParent.children.slice(startIndex + 1, endIndex);

                // 将捕获的节点设置为 html 节点的 children
                opening.node.children = capturedNodes;

                // 从父节点中移除被捕获的节点和结束标签
                // 保留开始标签，移除 [startIndex+1, endIndex]
                openingParent.children.splice(startIndex + 1, endIndex - startIndex);

                // 移除栈中已配对的标签及其之后的所有标签
                stack.splice(matchIndex);

                // 跳过当前子树的遍历
                return SKIP;
            }
        }
    });

    return tree;
}