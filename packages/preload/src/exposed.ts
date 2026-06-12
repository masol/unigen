import { contextBridge, ipcRenderer } from 'electron';

// Window functions
function getWindowId() {
  return ipcRenderer.invoke('get-window-id');
}

function onNotification(callback: never) {
  ipcRenderer.on('ug-notification', callback);
}

// MessageChannel listener for ORPC
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.data === 'start-orpc-client') {
      const [serverPort] = event.ports;
      ipcRenderer.postMessage('start-orpc-server', null, [serverPort]);
    }
  });
}

// Expose all functions to renderer context
contextBridge.exposeInMainWorld('getWindowId', getWindowId);
contextBridge.exposeInMainWorld('onNotification', onNotification);
