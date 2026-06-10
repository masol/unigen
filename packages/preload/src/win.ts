import { ipcRenderer } from 'electron';

export function getWindowId(): Promise<number> {
  return ipcRenderer.invoke('get-window-id');
  // return new Promise((resolve) => {
  //   const { port1, port2 } = new MessageChannel();
  //   console.log("port=",port1,port2)
  //   console.log('aaa')
  //   ipcRenderer.postMessage('start-orpc-server', null, [port2]);
  //   resolve(port1);
  // });
}


export function onNotification(callback: (event: Electron.IpcRendererEvent, message: string) => void) {
  ipcRenderer.on('ug-notification', callback)
}