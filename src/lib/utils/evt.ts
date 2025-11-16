import { listen, emit } from '@tauri-apps/api/event';
import mitt from 'mitt';
// import { type EventType } from 'mitt';
// type Events = Record<EventType, unknown>;

// 当前支持的消息类型.
type Events = {
	'llms.removed': { id: string | null };
	'llms.upsert': Record<string, unknown> | undefined; //LLMConfig 或 整体reset.
	'repo.removed': { id: string | null };
	'repo.reset': { length: number };
	'functor.updated': Record<string, unknown>; // Functor类型，这里不引入了.
	'functor.remove': { id: string }; // Functor类型，这里不引入了.
	'cfgchanged:*': { key: string };
};

const TauriEvtPrefix = "tauri//";

class EventBus {
	private static instance: EventBus;
	private emitter = mitt<Events>();

	private constructor() { }

	static get inst(): EventBus {
		if (!EventBus.instance) {
			EventBus.instance = new EventBus();
		}
		return EventBus.instance;
	}

	tauriEvt(name: string): string {
		return `${TauriEvtPrefix}${name}`
	}

	/**
	 * 订阅事件
	 * @param type 事件名(以tauri//开头的由Tauri发出的事件，并会)
	 * @param handler 事件处理器
	 * @returns 调用返回的函数即可取消订阅
	 */
	async listen<K extends keyof Events>(type: string, handler: (event: unknown) => void): Promise<() => void> {
		if (type.startsWith(TauriEvtPrefix)) {
			return listen(type, handler);
		}

		this.emitter.on(type as K, handler);
		// 返回一个 unlisten 函数
		return () => {
			this.emitter.off(type as K, handler);
		};
	}

	emit<K extends keyof Events>(type: string, event: Events[K]) {
		if (type.startsWith(TauriEvtPrefix)) {
			emit(type, event)
		} else {
			this.emitter.emit(type as keyof Events, event);
		}
	}
}

export const eventBus = EventBus.inst;