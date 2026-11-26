// src/lib/store/router.svelte.ts

import log from "electron-log/renderer";
import type { Component } from "svelte";
// 改动1：wrap 的导入路径更新为新包
import {
    wrap,
    type WrapOptions, // 懒加载 loader 标准类型
} from "@keenmate/svelte-spa-router/wrap";
import EmojiGallery from '../../../route/page/dev/emoji-gallery.svelte';
import IconGallery from '../../../route/page/dev/icon-gallery.svelte';
import IconPlayground from "../../../route/page/dev/icon-playground.svelte";
import EditorPage from '../../../route/page/editor/EditorPage.svelte';
import FallbackComponent from "../../../route/page/fallback/Main.svelte";
import FlowPage from "../../../route/page/flow/FlowPage.svelte";
import PacEditor from '../../../route/page/pac/editor.svelte';
import CodeRuntimePanel from '../../../route/page/settings/code-runtime/CodeRuntimePanel.svelte';
import DevSetting from "../../../route/page/settings/develops/DevSettingsPanel.svelte";
import EnvironmentDetail from '../../../route/page/settings/environments/EnvironmentDetail.svelte';
import EnvironmentsPanel from '../../../route/page/settings/environments/EnvironmentsPanel.svelte';
import GeneralSetting from "../../../route/page/settings/general/general.svelte";
import KbSetting from '../../../route/page/settings/kb/kb.svelte';
import Keybindings from '../../../route/page/settings/Keybindings.svelte';
import LLMSetting from "../../../route/page/settings/llm/llm.svelte";
import MCPSetting from '../../../route/page/settings/mcp/mcp.svelte';
import ProjectTypeManager from '../../../route/page/settings/project-type/ProjectTypeManager.svelte';
import SandboxPanel from '../../../route/page/settings/sandbox/SandboxPanel.svelte';
import MCPSearchSetting from '../../../route/page/settings/search/search.svelte';
import SkillSetting from '../../../route/page/settings/skill/skill.svelte';

// ── 类型 ──
type LazyLoader = NonNullable<WrapOptions['asyncComponent']>;

/** 路由值：普通组件 或 wrap() 返回的包装对象 */
type RouteDefinitionValue = Component | ReturnType<typeof wrap>;

/** 路由表：路径 → 组件 */
type RouteMap = Record<string, RouteDefinitionValue>;

/** 批量注册条目 */
interface RouteEntry {
    path: string;
    component: RouteDefinitionValue;
}

// ── Store ──

class RouterStore {
    /**
     * 路由表 — 整体替换触发重渲染 → $state.raw
     * 初始即包含 fallback '*'
     */
    #routes: RouteMap = $state.raw({
        "/settings/models/llm": LLMSetting,
        "/settings/api/mcp": MCPSetting,
        "/settings/api/search": MCPSearchSetting,
        "/settings/api/kb": KbSetting,
        "/settings/api/skill": SkillSetting,
        "/settings/general": GeneralSetting,
        "/settings/code-runtime": CodeRuntimePanel,
        "/settings/sandbox": SandboxPanel,
        "/settings/environments": EnvironmentsPanel,
        "/settings/environments/:id": EnvironmentDetail,
        "/settings/develops": DevSetting,
        "/settings/keybindings": Keybindings,
        "/settings/projectype": ProjectTypeManager,
        '/flow/view/:id': FlowPage,
        '/paceditor': PacEditor,
        // content 为可选查询/路径参数
        '/editor/:kind/:id/:content?': EditorPage,
        '/dev/icons': IconGallery,
        '/dev/emojis': EmojiGallery,
        '/dev/icon-playground': IconPlayground,
        "*": FallbackComponent,
    });

    get routes() {
        return this.#routes;
    }

    readonly registeredPaths = $derived(Object.keys(this.#routes));
    readonly routeCount = $derived(Object.keys(this.#routes).length);
    readonly hasRoutes = $derived(Object.keys(this.#routes).length > 0);

    constructor() {
        log.info("[RouterStore] initialized");
    }

    addRoute(path: string, component: RouteDefinitionValue): boolean {
        log.debug(`[RouterStore] addRoute(), path=${path}`);

        if (this.#routes[path]) {
            log.debug(`[RouterStore] addRoute() skipped, already exists: ${path}`);
            return false;
        }

        this.#routes = { ...this.#routes, [path]: component };
        log.info(
            `[RouterStore] route added: ${path}, total ${Object.keys(this.#routes).length}`,
        );
        return true;
    }

    addLazyRoute(path: string, loader: LazyLoader): boolean {
        log.debug(`[RouterStore] addLazyRoute(), path=${path}`);

        if (this.#routes[path]) {
            log.debug(
                `[RouterStore] addLazyRoute() skipped, already exists: ${path}`,
            );
            return false;
        }

        const wrapped = wrap({ asyncComponent: loader });
        this.#routes = { ...this.#routes, [path]: wrapped };
        log.info(
            `[RouterStore] lazy route added: ${path}, total ${Object.keys(this.#routes).length}`,
        );
        return true;
    }

    addBatchRoutes(entries: RouteEntry[]): number {
        log.debug(`[RouterStore] addBatchRoutes(), count=${entries.length}`);

        const merged = { ...this.#routes };
        let added = 0;

        for (const { path, component } of entries) {
            if (merged[path]) {
                log.debug(`[RouterStore] batch skipping existing: ${path}`);
                continue;
            }
            merged[path] = component;
            added++;
        }

        if (added > 0) {
            this.#routes = merged;
            log.info(
                `[RouterStore] batch added ${added} route(s), total ${Object.keys(merged).length}`,
            );
        }

        return added;
    }

    removeRoute(path: string): boolean {
        log.debug(`[RouterStore] removeRoute(), path=${path}`);

        if (path === "*") {
            log.debug("[RouterStore] removeRoute() rejected: cannot remove fallback");
            return false;
        }

        if (!this.#routes[path]) {
            log.debug(`[RouterStore] removeRoute() skipped, not found: ${path}`);
            return false;
        }

        const updated = { ...this.#routes };
        delete updated[path];
        this.#routes = updated;
        log.info(
            `[RouterStore] route removed: ${path}, total ${Object.keys(updated).length}`,
        );
        return true;
    }

    updateRoute(path: string, component: RouteDefinitionValue): boolean {
        log.debug(`[RouterStore] updateRoute(), path=${path}`);

        if (!this.#routes[path]) {
            log.debug(`[RouterStore] updateRoute() skipped, not found: ${path}`);
            return false;
        }

        this.#routes = { ...this.#routes, [path]: component };
        log.info(`[RouterStore] route updated: ${path}`);
        return true;
    }

    hasRoute(path: string): boolean {
        return path in this.#routes;
    }

    reset(): void {
        log.debug("[RouterStore] reset() called");

        const fallback = this.#routes["*"];
        this.#routes = fallback ? { "*": fallback } : {};
        log.info("[RouterStore] routes reset to fallback only");
    }
}

const KEY = Symbol.for('unigen.renderer.routerStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const routerStore: RouterStore = ((globalThis as any)[KEY] ??= new RouterStore());