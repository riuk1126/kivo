// Puente seguro entre la app y el programa de escritorio
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kivo', {
  desktop: true,
  platform: process.platform,
  show: () => ipcRenderer.send('kivo:show'),
  attention: (n) => ipcRenderer.send('kivo:attention', n),
  dictate: () => ipcRenderer.invoke('kivo:dictate'),
  voiceStatus: (id) => ipcRenderer.invoke('kivo:voice-status', id),
  voiceDownload: (id) => ipcRenderer.invoke('kivo:voice-download', id),
  onVoiceProgress: (cb) => ipcRenderer.on('kivo:voice-progress', (e, p) => cb(p)),
  force: (on) => ipcRenderer.send('kivo:force', !!on),
  version: () => ipcRenderer.invoke('kivo:version'),
  updateState: () => ipcRenderer.invoke('kivo:update-state'),
  checkUpdate: () => ipcRenderer.invoke('kivo:check-update'),
  installUpdate: () => ipcRenderer.send('kivo:install-update'),
  onUpdate: (cb) => ipcRenderer.on('kivo:update', (e, s) => cb(s))
});
