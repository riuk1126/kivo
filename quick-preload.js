// Ventanita de "Agregar rápido": solo puede mandar el texto a Kivo o cerrarse
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kq', {
  add: (t) => ipcRenderer.send('kq:add', String(t || '')),
  close: () => ipcRenderer.send('kq:close'),
  onOpen: (cb) => ipcRenderer.on('kq:open', () => cb())
});
