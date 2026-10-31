// Puente seguro entre la app y el programa de escritorio
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kivo', {
  desktop: true,
  platform: process.platform,
  show: () => ipcRenderer.send('kivo:show'),
  attention: (n) => ipcRenderer.send('kivo:attention', n),
  force: (on) => ipcRenderer.send('kivo:force', !!on),
  version: () => ipcRenderer.invoke('kivo:version'),
  updateState: () => ipcRenderer.invoke('kivo:update-state'),
  checkUpdate: () => ipcRenderer.invoke('kivo:check-update'),
  installUpdate: () => ipcRenderer.send('kivo:install-update'),
  onUpdate: (cb) => ipcRenderer.on('kivo:update', (e, s) => cb(s))
});
