const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kartlink', {
  state: () => ipcRenderer.invoke('state'),
  connect: () => ipcRenderer.invoke('connect'),
  managePlayit: () => ipcRenderer.invoke('manage-playit'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  start: password => ipcRenderer.invoke('start', password),
  stop: () => ipcRenderer.invoke('stop'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  openReleases: () => ipcRenderer.invoke('open-releases'),
  copy: text => ipcRenderer.invoke('copy', text),
  onState: callback => { const fn = (_event, state) => callback(state); ipcRenderer.on('state', fn); return () => ipcRenderer.removeListener('state', fn); },
});
const { webFrame } = require('electron');
window.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) event.preventDefault(); }, { capture: true, passive: false });
window.addEventListener('DOMContentLoaded', () => { webFrame.setZoomFactor(1); void webFrame.setVisualZoomLevelLimits(1, 1); });
