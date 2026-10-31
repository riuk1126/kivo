// Puente seguro entre la app y el programa de escritorio
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kivo', {
  desktop: true,
  platform: process.platform,
  show: () => ipcRenderer.send('kivo:show'),
  attention: (n) => ipcRenderer.send('kivo:attention', n),
  version: () => ipcRenderer.invoke('kivo:version')
});
