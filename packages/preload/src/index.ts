import { sha256sum } from './nodeCrypto.js';
import { versions } from './versions.js';
import { ipcRenderer } from 'electron';

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}


window.addEventListener('message', (event) => {
  console.log("enter preload")
  if (event.data === 'start-orpc-client') {
    const [serverPort] = event.ports
  console.log("enter preload 2")

    ipcRenderer.postMessage('start-orpc-server', null, [serverPort])
  }
})


export { sha256sum, versions, send };
