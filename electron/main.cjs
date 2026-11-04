const { app, BrowserWindow, ipcMain, clipboard, safeStorage, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { request, claimCode, ensureTunnel, prepareRoom } = require('./playit.cjs');

app.setName('KartLink P2P');
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
const resources = app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, '..', 'resources');
const dataDir = () => app.getPath('userData');
const configPath = () => path.join(dataDir(), 'config.json');
const encryptedPath = () => path.join(dataDir(), 'playit-secret.enc');
const runtimeSecret = () => path.join(dataDir(), 'playit-runtime-secret');
let main, authWindow, room, agent, operation = false, cancelClaim = false, shuttingDown = false;
app.on('second-instance', () => {
  if (main && !main.isDestroyed()) { if (main.isMinimized()) main.restore(); main.focus(); }
});
let view = { connected: false, needsReset: false, phase: 'idle', progress: null, address: null, error: null };
const update = change => { view = { ...view, ...change }; if (main && !main.isDestroyed()) main.webContents.send('state', view); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function openPlayitWindow(url, title) {
  const window = new BrowserWindow({ parent: main, width: 920, height: 740, title, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'persist:kartlink-playit-auth' } });
  window.webContents.setWindowOpenHandler(({ url: target }) => { if (target.startsWith('https://') && !window.isDestroyed()) void window.loadURL(target); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, target) => { if (!target.startsWith('https://')) event.preventDefault(); });
  void window.loadURL(url).catch(() => { if (!window.isDestroyed()) update({ error: 'Could not open Playit. Check your internet connection and try again.' }); });
  return window;
}
async function readConfig() { try { return JSON.parse(await fs.readFile(configPath(), 'utf8')); } catch { return {}; } }
async function saveConfig(config) { await fs.mkdir(dataDir(), { recursive: true }); await fs.writeFile(configPath(), JSON.stringify(config, null, 2)); }
async function readSecret() { const raw = await fs.readFile(encryptedPath()); return safeStorage.decryptString(raw); }
async function savedConnection() {
  try { await fs.access(encryptedPath()); } catch (error) { if (error.code === 'ENOENT') return 'missing'; throw error; }
  try { await readSecret(); return 'ready'; } catch { return 'unreadable'; }
}
async function stopChildren() {
  for (const child of [room, agent]) {
    if (child && child.exitCode === null && !child.killed) { child.stdin?.write('q\n'); child.kill(); }
  }
  room = null; agent = null;
  await fs.rm(runtimeSecret(), { force: true }).catch(() => {});
  update({ phase: 'idle', progress: null, address: null });
}
function supervise(child, name) {
  child.once('error', error => { if (!shuttingDown) { void stopChildren(); update({ error: `${name}: ${error.message}` }); } });
  child.once('exit', (code) => { if (!shuttingDown && (child === room || child === agent)) { void stopChildren(); update({ error: `${name} stopped unexpectedly (code ${code ?? 'unknown'}).` }); } });
}
function startRoom(password) {
  return new Promise((resolve, reject) => {
    const args = ['-n', 'KartLink P2P', '-g', 'Mario Kart World', '-s', '127.0.0.1', '-p', '6009', '-m', '16'];
    if (password) args.push('-w', password);
    const child = spawn(path.join(resources, 'eden-room.exe'), args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    room = child; supervise(child, 'Room server');
    let output = '', finished = false;
    const finish = error => { if (finished) return; finished = true; clearTimeout(timer); error ? reject(error) : resolve(); };
    const read = chunk => { output += chunk.toString(); if (output.includes('Room is open')) finish(); if (output.includes('Failed to create room')) finish(new Error('Could not open local UDP port 6009. Close another room using that port and try again.')); };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', error => finish(error)); child.once('exit', () => finish(new Error('The room server exited before it was ready.')));
    const timer = setTimeout(() => finish(new Error('The room server did not become ready.')), 12000);
  });
}
async function connect() {
  if (operation) throw new Error('Another action is already in progress.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable; Playit credentials cannot be stored safely.');
  operation = true; cancelClaim = false; update({ phase: 'authorizing', error: null });
  const config = await readConfig();
  try {
    const code = config.pendingClaim || claimCode();
    if (!config.pendingClaim) { config.pendingClaim = code; await saveConfig(config); }
    const setup = () => request('/claim/setup', { code, agent_type: 'self-managed', version: 'playit 1.2.0' });
    await setup();
    authWindow = openPlayitWindow(`https://playit.gg/claim/${code}`, 'Connect Playit');
    authWindow.on('closed', () => { authWindow = null; cancelClaim = true; });
    const end = Date.now() + 5 * 60 * 1000;
    while (!cancelClaim && Date.now() < end) {
      await sleep(2000);
      const state = await setup();
      if (state === 'UserRejected') throw new Error('Playit authorization was declined.');
      if (state === 'UserAccepted') {
        const data = await request('/claim/exchange', { code });
        if (!data?.secret_key) throw new Error('Playit did not provide a connection key.');
        await fs.mkdir(dataDir(), { recursive: true });
        await fs.writeFile(encryptedPath(), safeStorage.encryptString(data.secret_key));
        delete config.pendingClaim;
        await saveConfig(config);
        if (authWindow && !authWindow.isDestroyed()) authWindow.close();
        update({ connected: true, phase: 'idle', error: null });
        return view;
      }
    }
    throw new Error(cancelClaim ? 'Playit authorization was cancelled.' : 'Playit authorization timed out.');
  } catch (error) {
    if (/CodeExpired|UserRejected|CodeNotFound/i.test(error.message)) { delete config.pendingClaim; await saveConfig(config); }
    update({ phase: 'idle', error: error.message }); throw error;
  }
  finally { operation = false; if (authWindow && !authWindow.isDestroyed()) authWindow.close(); }
}
async function start(password) {
  if (operation || room || agent) throw new Error('A room is already running or starting.');
  if (typeof password !== 'string' || password.length > 64 || /[\r\n\0]/.test(password)) throw new Error('Use a password of up to 64 characters.');
  operation = true; update({ phase: 'starting', progress: 'room', error: null, address: null });
  try {
    const secret = await readSecret();
    const config = await readConfig();
    const address = await prepareRoom({
      startRoom: async () => { await startRoom(password); update({ progress: 'agent' }); },
      startAgent: async () => {
        await fs.writeFile(runtimeSecret(), secret, { mode: 0o600 });
        agent = spawn(path.join(resources, 'playitd.exe'), ['--secret-path', runtimeSecret(), '--socket-path', `\\\\.\\pipe\\kartlink-${process.pid}`], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
        supervise(agent, 'Playit agent');
        await new Promise((resolve, reject) => { agent.once('spawn', resolve); agent.once('error', reject); });
        update({ progress: 'address' });
      },
      getTunnel: () => { if (!agent || agent.exitCode !== null) throw new Error('The Playit agent stopped. Check your internet connection and try again.'); return ensureTunnel(secret, config, saveConfig); },
      wait: sleep,
    });
    if (!agent || agent.exitCode !== null) throw new Error('The Playit agent stopped. Check your internet connection and try again.');
    update({ phase: 'ready', progress: null, address, error: null });
    return view;
  } catch (error) { await stopChildren(); update({ error: error.message }); throw error; }
  finally { operation = false; }
}

app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  await fs.rm(runtimeSecret(), { force: true }).catch(() => {});
  const saved = await savedConnection();
  view.connected = saved === 'ready';
  view.needsReset = saved === 'unreadable';
  if (view.needsReset) view.error = 'KartLink cannot read its saved Playit connection. Clear the saved connection below, then connect Playit again. You may need to remove the old agent in Manage Playit agents.';
  main = new BrowserWindow({ width: 860, height: 620, minWidth: 640, minHeight: 520, backgroundColor: '#171717', title: 'KartLink P2P', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', event => event.preventDefault());
  await main.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
});
ipcMain.handle('state', () => view);
ipcMain.handle('connect', connect);
ipcMain.handle('manage-playit', () => { openPlayitWindow('https://playit.gg/account/agents', 'Manage Playit'); });
ipcMain.handle('start', (_event, password) => start(password));
ipcMain.handle('stop', async () => { if (operation) throw new Error('Please wait for the current action to finish.'); await stopChildren(); update({ error: null }); return view; });
ipcMain.handle('disconnect', async () => { if (operation) throw new Error('Please wait for the current action to finish.'); await stopChildren(); await fs.rm(encryptedPath(), { force: true }); await saveConfig({}); update({ connected: false, needsReset: false, error: null }); return view; });
ipcMain.handle('copy', (_event, text) => { if (typeof text !== 'string' || text.length > 1000) throw new Error('Invalid text.'); clipboard.writeText(text); });
app.on('before-quit', () => { shuttingDown = true; cancelClaim = true; void stopChildren(); });
app.on('window-all-closed', () => app.quit());
