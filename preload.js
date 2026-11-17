const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('store', {
  load: () => ipcRenderer.invoke('taches:load'),
  save: (data) => ipcRenderer.invoke('taches:save', data),
});
