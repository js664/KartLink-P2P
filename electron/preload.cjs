const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kartlink', {
  state: () => ipcRenderer.invoke('state'),
  connect: () => ipcRenderer.invoke('connect'),
  managePlayit: () => ipcRenderer.invoke('manage-playit'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  start: password => ipcRenderer.invoke('start', password),
  stop: () => ipcRenderer.invoke('stop'),
  copy: text => ipcRenderer.invoke('copy', text),
  onState: callback => { const fn = (_event, state) => callback(state); ipcRenderer.on('state', fn); return () => ipcRenderer.removeListener('state', fn); },
});
