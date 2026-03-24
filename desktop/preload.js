// desktop/preload.js
// Bridge seguro entre renderer e main process

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveExcel: (data) => ipcRenderer.invoke('save-excel', data),
  saveDebug: (data) => ipcRenderer.invoke('save-debug', data),
});
