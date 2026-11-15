/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Component } from 'svelte';
import { Tiptap } from '../tiptap/index';
import UseAI from './components/menu/AI.svelte';
import BubbleMenu from './components/menu/BubbleMenu.svelte';
import Toolbar from './components/Toolbar.svelte';
import DragHandle from './drag-handle.svelte';
import Editor from './editor.svelte';
import ToC from './toc.svelte';
export * from '@tiptap/core';
export { createEditor } from './editor';
export { Edra };

const Edra = Object.assign(Tiptap, {
	Content: Editor as Component<any>,
	Toolbar: Toolbar as Component<any>,
	BubbleMenu: BubbleMenu as Component<any>,
	DragHandle: DragHandle as Component<any>,
	UseAI,
	ToC
});

