import { ipcRenderer } from 'electron';

function getWindowId(): Promise<number> {
  return ipcRenderer.invoke('get-window-id');
}

function onNotification(callback: (event: Electron.IpcRendererEvent, message: unknown) => void) {
  ipcRenderer.on('ug-notification', callback);
}

module.exports = {
  getWindowId,
  onNotification,
};