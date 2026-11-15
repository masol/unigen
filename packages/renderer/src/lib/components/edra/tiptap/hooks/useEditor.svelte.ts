import type { EditorOptions } from '@tiptap/core';
// import { browser } from '$app/environment';

import { Editor } from '../Editor';

export const useEditor = (options: Partial<EditorOptions> = {}) => {
	let editor: Editor | undefined = undefined;

	const isBrowser = typeof window !== 'undefined';

	if (isBrowser) {
		editor = new Editor(options);
	}

	$effect(() => {
		return () => {
			if (editor) {
				const nodes = editor.view.dom?.parentNode;
				const newEl = nodes?.cloneNode(true) as HTMLElement;
				nodes?.parentNode?.replaceChild(newEl, nodes);
				editor.destroy();
			}
		};
	});

	return editor;
};
