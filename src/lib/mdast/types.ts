import type { Root, RootContent, Parent } from 'mdast';


export interface HtmlWithChildren extends Parent {
    type: 'html';
    value: string;
    children: RootContent[];
    data?: {
        htmlTagName?: string;
        htmlAttributes?: Record<string, string>;
        [key: string]: unknown;
    };
}


export interface CompileOptions {
    /** 是否启用 GFM（GitHub Flavored Markdown）扩展（默认：true） */
    gfm?: boolean;

    /** 是否使用严格的 CommonMark 模式（默认：false） */
    commonmark?: boolean;

    /** 其他自定义选项 */
    [key: string]: unknown;
}

export interface CompileResult {
    /** 解析后的 MDAST 树，HTML 内容会保留为 html 节点 */
    tree: Root;
}