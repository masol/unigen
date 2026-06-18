import Logger from 'electron-log/main';
import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../types/ModuleContext.js';
// src/main/protocol.ts
import { protocol, net, app } from 'electron'
import { pathToFileURL } from 'url'

const PROTOCAL_NAME = "appfile"
/**
 * 注册自定义协议 appfile://
 *
 * 渲染进程使用示例：
 *   <video src="appfile:///Users/xxx/movie.mp4" controls />
 *   <img   src="appfile:///Users/xxx/photo.png" />
 *   <audio src="appfile:///Users/xxx/song.mp3" controls />
 *
 * Chromium 会自动发送 Range 请求，视频可拖动进度条，无需全部加载到内存。
 *
 * 在 app.whenReady() 之前调用 protocol.registerSchemesAsPrivileged
 * 在 app.whenReady() 之后调用 registerFileProtocol
 */
/** 第一步：在 app ready 之前调用 */
export function registerSchemes(): void {
    if (app.isReady()) {
        Logger.error(`试图注册协议${PROTOCAL_NAME},但是已经就绪。`)
    }
    //   console.log('顶层同步：app.isReady() =', app.isReady()) // false

    protocol.registerSchemesAsPrivileged([
        {
            scheme: PROTOCAL_NAME,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                stream: true,          // ← 关键：允许流式读取（视频拖动进度条）
                bypassCSP: true,
                corsEnabled: true,
            },
        },
    ])
}

function registerFileProtocol(): void {
    protocol.handle(PROTOCAL_NAME, (request) => {
        // app-file:///absolute/path/to/file  →  file:///absolute/path/to/file
        const url = request.url.replace(`${PROTOCAL_NAME}://`, 'file://')
        // net.fetch 天然支持 Range header，可实现视频 seek
        return net.fetch(pathToFileURL(decodeURIComponent(new URL(url).pathname)).href, {
            headers: request.headers,
        })
    })
}

class ProtocalModule implements AppModule {

    enable({ app }: ModuleContext): Promise<void> | void {
        app.whenReady().then(() => {
            registerFileProtocol();
        })
    }
}

export function protocalModule(...args: ConstructorParameters<typeof ProtocalModule>) {
    return new ProtocalModule(...args);
}
