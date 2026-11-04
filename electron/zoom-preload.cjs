const { webFrame } = require('electron');
window.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) event.preventDefault(); }, { capture: true, passive: false });
window.addEventListener('DOMContentLoaded', () => { webFrame.setZoomFactor(1); void webFrame.setVisualZoomLevelLimits(1, 1); });
