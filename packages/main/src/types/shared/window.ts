
//─── 事件类型定义 ───────────────────────────────────────────────

export type WindowEventType = 'maximized' | 'minimized' | 'normal' | 'focus' | 'blur';

export interface WindowEventPayload {
  type: WindowEventType;
  windowId: number;
  timestamp: number;
}