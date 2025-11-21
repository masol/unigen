import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { foldNodeProp, foldInside } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

export function createLanguageExtension(): Extension {
    return markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: [
            {
                props: [
                    foldNodeProp.add({
                        // 折叠 HTML 块
                        HTMLBlock(tree) {
                            return foldInside(tree);
                        },
                        // 折叠代码块
                        FencedCode(tree) {
                            return foldInside(tree);
                        },
                        CodeBlock(tree) {
                            return foldInside(tree);
                        },
                        // 折叠引用块
                        Blockquote(tree) {
                            return foldInside(tree);
                        },
                        // 折叠列表
                        ListItem(tree) {
                            return foldInside(tree);
                        }
                    })
                ]
            }
        ]
    });
}