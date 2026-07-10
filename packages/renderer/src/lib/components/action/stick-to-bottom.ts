// stick-to-bottom.ts
/**
 * stickToBottom —— 智能「贴底自动滚动」 Svelte action
 *
 * 行为：
 *  - 容器处于（或接近）底部时，内容新增会自动平滑滚动到最底。
 *  - 用户手动上滚离开底部时，暂停自动滚动。
 *  - 用户滚回底部后恢复跟随。
 *  - 针对 autoAnimate 等入场动画导致 scrollHeight 渐变的场景，
 *    使用「跟随窗口」在一小段时间内持续贴底，解决「差一行半滚不到底」。
 *  - 高频追加时自动从 smooth 降级为瞬移，避免 smooth 动画排队卡顿。
 */

type StickOptions = {
    /** 距离底部多少 px 以内视为「在底部」，默认 48 */
    threshold?: number;
    /** 是否启用（如 paused 时可传 false 暂停跟随） */
    enabled?: boolean;
    /** 是否使用平滑滚动，默认 true */
    smooth?: boolean;
    /**
     * 跟随窗口时长（ms）：内容变化后在此时间内持续尝试贴底，
     * 用于覆盖 autoAnimate 的入场动画周期。默认 320（略大于 autoAnimate 默认 250ms）
     */
    followWindow?: number;
};

export function stickToBottom(node: HTMLElement, options: StickOptions = {}) {
    let threshold = options.threshold ?? 48;
    let enabled = options.enabled ?? true;
    let smooth = options.smooth ?? true;
    let followWindow = options.followWindow ?? 320;

    /** 是否「粘」在底部 */
    let stuck = true;
    /** 标记：正在由程序发起滚动（避免把自身滚动误判为用户滚动） */
    let programmatic = false;
    /** 跟随窗口的截止时间戳 */
    let followUntil = 0;
    /** 跟随循环的 rAF id */
    let followRaf = 0;
    /** 高频检测：记录上次内容变化时间 */
    let lastMutation = 0;

    const distanceToBottom = () =>
        node.scrollHeight - node.scrollTop - node.clientHeight;

    const isAtBottom = () => distanceToBottom() <= threshold;

    const doScroll = (useSmooth: boolean) => {
        programmatic = true;
        node.scrollTo({
            top: node.scrollHeight,
            behavior: useSmooth ? "smooth" : "auto",
        });
        // smooth 滚动会持续几帧，用微任务在其后清除标记
        // 这里用一个短延时兜底清除 programmatic
        setTimeout(() => {
            programmatic = false;
        }, useSmooth ? 260 : 0);
    };

    /**
     * 跟随循环：在 followWindow 时间内，每帧检查是否到底，
     * 没到底就继续贴。用于覆盖 autoAnimate 入场动画期间 scrollHeight 的渐变增长。
     */
    const followLoop = () => {
        followRaf = 0;
        if (!enabled || !stuck) return;

        // 判断是否高频追加：距上次内容变化 < 120ms 视为高频 → 瞬移
        const highFrequency = performance.now() - lastMutation < 120 &&
            lastMutation !== 0;

        // 若尚未到底，则继续滚
        if (distanceToBottom() > 1) {
            doScroll(smooth && !highFrequency);
        }

        // 在跟随窗口内持续循环，直到时间到 & 已贴底
        if (performance.now() < followUntil || distanceToBottom() > 1) {
            followRaf = requestAnimationFrame(followLoop);
        }
    };

    /** 内容/尺寸变化时启动一轮跟随窗口 */
    const startFollow = () => {
        if (!enabled || !stuck) return;
        lastMutation = performance.now();
        followUntil = performance.now() + followWindow;
        if (!followRaf) {
            // 双重 rAF：等浏览器完成本次布局 + autoAnimate 起始帧后再测量
            requestAnimationFrame(() => {
                followRaf = requestAnimationFrame(followLoop);
            });
        }
    };

    /** 用户滚动：非程序触发时更新 stuck 状态 */
    const onScroll = () => {
        if (programmatic) return;
        stuck = isAtBottom();
        // 用户主动滚离底部：立即中止当前跟随窗口
        if (!stuck) {
            followUntil = 0;
        }
    };

    node.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(startFollow);
    ro.observe(node);

    const mo = new MutationObserver(() => {
        lastMutation = performance.now();
        startFollow();
    });
    mo.observe(node, { childList: true, subtree: true, characterData: true });

    // 首次挂载滚到底（瞬移，避免初始一大段 smooth 卡顿）
    requestAnimationFrame(() => {
        node.scrollTo({ top: node.scrollHeight, behavior: "auto" });
    });

    return {
        update(newOptions: StickOptions = {}) {
            threshold = newOptions.threshold ?? threshold;
            smooth = newOptions.smooth ?? smooth;
            followWindow = newOptions.followWindow ?? followWindow;
            const nextEnabled = newOptions.enabled ?? enabled;
            if (!enabled && nextEnabled && stuck) {
                startFollow();
            }
            enabled = nextEnabled;
        },
        destroy() {
            node.removeEventListener("scroll", onScroll);
            if (followRaf) cancelAnimationFrame(followRaf);
            ro.disconnect();
            mo.disconnect();
        },
    };
}