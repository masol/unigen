import {ipcRenderer} from 'electron';

export function orpc_connect(): Promise<MessagePort> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    console.log("port=",port1,port2)
    console.log('aaa')
    ipcRenderer.postMessage('start-orpc-server', null, [port2]);
    resolve(port1);
  });
}
