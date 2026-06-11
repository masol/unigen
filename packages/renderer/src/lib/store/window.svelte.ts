// src/lib/store/window.svelte.ts
//═══════════════════════════════════════════════════════════════
//WindowStore — 当前窗口状态管理单例
//  职责：最小化 / 最大化 / 还原 / 关闭 / 焦点
//  前置条件：外部确保 wid 可用后才调用 init(wid)，后续方法方可使用
// ═══════════════════════════════════════════════════════════════

import { api } from '$lib/utils/api'
import evtbus from '$lib/utils/evtbus'
import Logger from 'electron-log/renderer'
import log from 'electron-log/renderer'

//─── 类型 ────────────────────────────────────────────────────

/** 窗口视觉状态（三态互斥） */
export type WindowVisualState = 'normal' | 'maximized' | 'minimized'


// ─── Store───────────────────────────────────────────────────

class WindowStore {
  // ──窗口标识（纯内部，不暴露给 UI） ──
  #wid = $state<number>(-1)
  #title = $state("ugvideo — workspace");

  // ── 核心状态（原始值→ $state，无Proxy 开销） ──
  #visualState = $state<WindowVisualState>('normal')
  #isFocused = $state(true)

  // ── 派生（UI 直接绑定） ──
  readonly isMaximized = $derived(this.#visualState === 'maximized')
  readonly isMinimized = $derived(this.#visualState === 'minimized')
  readonly isNormal = $derived(this.#visualState === 'normal')

  /** 最大化 / 还原按钮的tooltip */
  readonly maxRestoreTooltip = $derived(
    this.#visualState === 'maximized' ? '向下还原' : '最大化'
  )

  get title(): string { return this.#title };
  // ── 只读门面 ──
  get visualState(): WindowVisualState { return this.#visualState }
  get isFocused(): boolean { return this.#isFocused }

  // ── 构造：注册事件总线监听（只听不发） ──
  constructor() {
    //主进程 BrowserWindow 原生事件转发
    //覆盖 OS 级操作（双击标题栏、Win+方向键、任务栏点击等）

    evtbus.on('winstate', payload => {
      switch (payload.type) {
        case 'maximized':
        case 'minimized':
        case 'normal':
          if (this.#visualState !== payload.type) {
            this.#visualState = payload.type;
          }
          break;
        default:
          Logger.debug("未处理的窗口状态事件：", payload)
      }
    })

    // evtbus.on('win:maximized', (wid: number) => {
    //   if (wid !== this.#wid) return
    //   this.#visualState = 'maximized'
    //   log.debug('[WindowStore] win:maximized received')
    // })

    // evtbus.on('win:unmaximized', (wid: number) => {
    //   if (wid !== this.#wid) return
    //   this.#visualState = 'normal'
    //   log.debug('[WindowStore] win:unmaximized received')
    // })

    // evtbus.on('win:minimized', (wid: number) => {
    //   if (wid !== this.#wid) return
    //   this.#visualState = 'minimized'
    //   log.debug('[WindowStore] win:minimized received')
    // })

    // evtbus.on('win:restored', (wid: number) => {
    //   if (wid !== this.#wid) return
    //   if (this.#visualState === 'minimized') this.#visualState = 'normal'
    //   log.debug('[WindowStore] win:restored received')
    // })

    // evtbus.on('win:focus', (wid: number) => {
    //   if (wid !== this.#wid) return
    //   this.#isFocused = true
    //   log.debug('[WindowStore] win:focus received')
    // })

    // evtbus.on('win:blur', (wid: number) => {
    //   if (wid !== this.#wid) return
    //   this.#isFocused = false
    //   log.debug('[WindowStore] win:blur received')
    // })

    log.info('[WindowStore] initialized')
  }

  // ── 注入 wid（外部确保可用后调用一次） ──
  init(wid: number): void {
    this.#wid = wid
    log.info(`[WindowStore] bound wid=${wid}`)
  }

  // ═══════════════════════════════════════════════════════════
  //  Actions — 右上角控制按钮绑定
  // ═══════════════════════════════════════════════════════════

  async maximize(): Promise<void> {
    log.debug(`[WindowStore] maximize() called`)
    try {
      if (await api().window.max(this.#wid)) {
        this.#visualState = 'maximized'
        log.info('[WindowStore] maximize() succeeded')
      }
    } catch (err) {
      log.error('[WindowStore] maximize() failed', err)
    }
  }

  setTitle(title: string) {
    this.#title = title;
  }

  async minimize(): Promise<void> {
    log.debug('[WindowStore] minimize() called')
    try {
      // TODO: await api().window.minimize(this.#wid)
      if (await api().window.min(this.#wid)) {
        this.#visualState = 'minimized'
        log.info('[WindowStore] minimize() succeeded')
      }
    } catch (err) {
      log.error('[WindowStore] minimize() failed', err)
    }
  }

  async restore(): Promise<void> {
    log.debug('[WindowStore] restore() called')
    try {
      if (await api().window.restore(this.#wid)) {
        this.#visualState = 'normal'
        log.info('[WindowStore] restore() succeeded')
      }
    } catch (err) {
      log.error('[WindowStore] restore() failed', err)
    }
  }

  /** 最大化 ↔ 还原（右上角按钮直接绑定） */
  async toggleMaximize(): Promise<void> {
    if (this.#visualState === 'maximized') {
      await this.restore()
    } else {
      await this.maximize()
    }
  }

  async focus(): Promise<void> {
    log.debug('[WindowStore] focus() called')
    try {
      if (await api().window.focus(this.#wid)) {
        this.#isFocused = true
        log.info('[WindowStore] focus() succeeded')
      }
    } catch (err) {
      log.error('[WindowStore] focus() failed', err)
    }
  }

  async close(): Promise<void> {
    log.debug('[WindowStore] close() called')
    try {
      if (await api().window.close(this.#wid)) {
        log.info('[WindowStore] close() succeeded')
      }
    } catch (err) {
      log.error('[WindowStore] close() failed', err)
    }
  }
}

// ── 单例导出 ──
export const windowStore = new WindowStore()