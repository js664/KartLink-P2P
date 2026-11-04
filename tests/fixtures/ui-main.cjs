// Isolated Electron UI harness. Never uses the user's Playit profile or network.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kartlink-ui-test-'));
app.setPath('userData', dir);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 860, height: 620, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: path.join(__dirname, 'ui-preload.cjs') } });
  await window.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
