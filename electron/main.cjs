const { app, BrowserWindow, ipcMain, clipboard, safeStorage, Menu, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const path = require('node:path');
const { request, claimCode, ensureTunnel, prepareRoom, listTunnels, deleteTunnel } = require('./playit.cjs');
const { createDiagnostics } = require('./diagnostics.cjs');
const { shell } = require('electron');
const { configurePortable } = require('./portable.cjs');
const { terminateChild, isExited } = require('./process-control.cjs');
const { waitForRoomReady } = require('./room-process.cjs');
const { isPlayitUrl, isExternalHttps } = require('./auth-url.cjs');
const { createAccountApi } = require('./playit-account.cjs');
const { markCurrent } = require('./active-resources.cjs');
configurePortable(app);
app.on('browser-window-created', (_event, window) => {
  const contents = window.webContents;
  const reset = () => { if (!contents.isDestroyed()) contents.setZoomFactor(1); };
  contents.on('did-finish-load', reset);
  contents.on('zoom-changed', reset);
  contents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && ['+', '=', '-', '_', '0', 'Add', 'Subtract', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(input.key)) event.preventDefault();
  });
});

app.setName('KartLink P2P');
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
const resources = app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, '..', 'resources');
const dataDir = () => app.getPath('userData');
const configPath = () => path.join(dataDir(), 'config.json');
const encryptedPath = () => path.join(dataDir(), 'playit-secret.enc');
const runtimeSecret = () => path.join(dataDir(), 'playit-runtime-secret');
let main, authWindow, room, agent, operation = false, cancelClaim = false, shuttingDown = false, cleanupPromise = null, quitAfterCleanup = false;
const stoppingChildren = new WeakSet();
app.on('second-instance', () => {
  if (main && !main.isDestroyed()) { if (main.isMinimized()) main.restore(); main.focus(); }
});
let view = { revision: 0, initializing: true, connectionVerification: 'unverified', connected: false, needsReset: false, phase: 'idle', progress: null, address: null, error: null, diagnostics: { logs: [], players: [], playerListReliable: false } };
const health = () => ({ roomRunning: !!room && !isExited(room), agentRunning: !!agent && !isExited(agent) });
const update = change => { view = { ...view, ...change, health: health(), revision: view.revision + 1 }; if (main && !main.isDestroyed()) main.webContents.send('state', view); };
const diagnostics = createDiagnostics(value => update({ diagnostics: value }));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function openPlayitWindow(url, title) {
  const window = new BrowserWindow({ parent: main, width: 920, height: 740, title, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'zoom-preload.cjs'), partition: 'persist:kartlink-playit-auth' } });
  const external = target => { const destination = title === 'Connect Playit' ? url : target; if (isExternalHttps(destination)) void shell.openExternal(destination).catch(() => update({ error: 'Could not open the link in your browser.' })); };
  window.webContents.setWindowOpenHandler(({ url: target }) => { if (isPlayitUrl(target) && !window.isDestroyed()) void window.loadURL(target); else external(target); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, target) => { if (!isPlayitUrl(target)) { event.preventDefault(); external(target); } });
  window.webContents.on('will-redirect', (event, target) => { if (!isPlayitUrl(target)) { event.preventDefault(); external(target); } });
  void window.loadURL(url).catch(() => { if (!window.isDestroyed()) update({ error: 'Could not open Playit. Check your internet connection and try again.' }); });
  return window;
}
async function readConfig() { try { return JSON.parse(await fs.readFile(configPath(), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('KartLink could not read its saved settings. Check file access and try again.'); } }
async function saveConfig(config) {
  await fs.mkdir(dataDir(), { recursive: true });
  const temp = path.join(dataDir(), `config-${crypto.randomUUID()}.tmp`);
  try { await fs.writeFile(temp, JSON.stringify(config, null, 2), { flag: 'wx' }); await fs.rename(temp, configPath()); }
  finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
async function readSecret() { const raw = await fs.readFile(encryptedPath()); return safeStorage.decryptString(raw); }
async function savedConnection() {
  try { await fs.access(encryptedPath()); } catch (error) { if (error.code === 'ENOENT') return 'missing'; throw error; }
  try { await readSecret(); return 'ready'; } catch { return 'unreadable'; }
}
async function stopChildren() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const oldRoom = room, oldAgent = agent;
    if (oldRoom) stoppingChildren.add(oldRoom);
    if (oldAgent) stoppingChildren.add(oldAgent);
    const results = await Promise.allSettled([
      terminateChild(oldRoom, { graceful: true, name: 'Room server' }),
      terminateChild(oldAgent, { name: 'Playit agent' }),
    ]);
    if (results[0].status === 'fulfilled' && room === oldRoom) room = null;
    if (results[1].status === 'fulfilled' && agent === oldAgent) agent = null;
    if (results[1].status === 'fulfilled') await fs.rm(runtimeSecret(), { force: true }).catch(() => {});
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    update({ phase: 'idle', progress: null, address: null, connectionVerification: 'unverified' });
  })();
  try { await cleanupPromise; } finally { cleanupPromise = null; }
}
function supervise(child, name) {
  const unexpected = detail => {
    if (shuttingDown || stoppingChildren.has(child) || (child !== room && child !== agent)) return;
    void stopChildren().then(() => update({ error: `${name} stopped unexpectedly (${detail}). Check your connection, then create the room again.` })).catch(error => update({ error: error.message }));
  };
  child.once('error', error => unexpected(error.message));
  child.once('exit', code => unexpected(`code ${code ?? 'unknown'}`));
}
async function startRoom(password) {
  diagnostics.reset();
  const args = ['-n', 'KartLink P2P', '-g', 'Mario Kart World', '-s', '127.0.0.1', '-p', '6009', '-m', '16'];
  if (password) args.push('-w', password);
  const child = spawn(path.join(resources, 'eden-room.exe'), args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  room = child;
  try {
    await waitForRoomReady(child, { onOutput: (chunk, stream) => diagnostics.push(chunk, stream), beforeStop: process => stoppingChildren.add(process) });
    supervise(child, 'Room server');
  } catch (error) { if (isExited(child) && room === child) room = null; throw error; }
}
async function connect() {
  if (operation || view.initializing) throw new Error('Another action is already in progress.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable; Playit credentials cannot be stored safely.');
  operation = true; cancelClaim = false; update({ phase: 'authorizing', error: null });
  let config;
  try {
    config = await readConfig();
    const code = config.pendingClaim || claimCode();
    if (!config.pendingClaim) { config.pendingClaim = code; await saveConfig(config); }
    const setup = () => request('/claim/setup', { code, agent_type: 'self-managed', version: 'playit 1.2.0' });
    await setup();
    if (shuttingDown) throw new Error('KartLink is closing.');
    authWindow = openPlayitWindow(`https://playit.gg/claim/${code}`, 'Connect Playit');
    authWindow.on('closed', () => {
      authWindow = null;
      cancelClaim = true;
      if (main && !main.isDestroyed()) main.webContents.send('playit-session-changed');
    });
    const end = Date.now() + 5 * 60 * 1000;
    while (!cancelClaim && Date.now() < end) {
      await sleep(2000);
      if (cancelClaim || shuttingDown) break;
      const state = await setup();
      if (shuttingDown) throw new Error('KartLink is closing.');
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
    if (config && /CodeExpired|UserRejected|CodeNotFound/i.test(error.message)) { delete config.pendingClaim; await saveConfig(config); }
    update({ phase: 'idle', error: error.message }); throw error;
  }
  finally { operation = false; if (authWindow && !authWindow.isDestroyed()) authWindow.close(); }
}
async function start(password) {
  if (operation || view.initializing || room || agent) throw new Error('A room is already running or starting.');
  if (typeof password !== 'string' || password.length > 64 || /[\r\n\0]/.test(password)) throw new Error('Use a password of up to 64 characters.');
  operation = true; update({ phase: 'starting', progress: 'room', error: null, address: null });
  try {
    const secret = await readSecret();
    const config = await readConfig();
    const address = await prepareRoom({
      startRoom: async () => { if (shuttingDown) throw new Error('KartLink is closing.'); await startRoom(password); if (shuttingDown) throw new Error('KartLink is closing.'); update({ progress: 'agent' }); },
      startAgent: async () => {
        if (shuttingDown) throw new Error('KartLink is closing.');
        await fs.writeFile(runtimeSecret(), secret, { mode: 0o600 });
        if (shuttingDown) throw new Error('KartLink is closing.');
        agent = spawn(path.join(resources, 'playitd.exe'), ['--secret-path', runtimeSecret(), '--socket-path', `\\\\.\\pipe\\kartlink-${process.pid}`], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
        supervise(agent, 'Playit agent');
        await new Promise((resolve, reject) => { agent.once('spawn', resolve); agent.once('error', reject); });
        update({ progress: 'address' });
      },
      getTunnel: () => { if (shuttingDown) throw new Error('KartLink is closing.'); if (!agent || agent.exitCode !== null) throw new Error('The Playit agent stopped. Check your internet connection and try again.'); return ensureTunnel(secret, config, saveConfig); },
      wait: sleep,
    });
    if (shuttingDown || !agent || agent.exitCode !== null) throw new Error('The Playit agent stopped. Check your internet connection and try again.');
    update({ phase: 'ready', progress: null, address, error: null, connectionVerification: 'unverified' });
    return view;
  } catch (error) { try { await stopChildren(); } catch (cleanupError) { error = new Error(`${error.message} ${cleanupError.message}`); } update({ error: error.message }); throw error; }
  finally { operation = false; }
}

app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  Menu.setApplicationMenu(null);
  main = new BrowserWindow({ width: 860, height: 620, minWidth: 640, minHeight: 520, backgroundColor: '#171717', title: 'KartLink P2P', icon: app.isPackaged ? path.join(resources, 'kartlink.ico') : path.join(__dirname, '..', 'assets', 'kartlink.ico'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  main.on('close', event => { if (!quitAfterCleanup) { event.preventDefault(); app.quit(); } });
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', event => event.preventDefault());
  const initialize = (async () => {
    try {
      await fs.rm(runtimeSecret(), { force: true }).catch(() => {});
      const saved = await savedConnection();
      update({ connected: saved === 'ready', needsReset: saved === 'unreadable', initializing: false, error: saved === 'unreadable' ? 'KartLink cannot read its saved Playit connection. Clear the saved connection below, then connect Playit again. You may need to remove the old agent in Manage Playit agents.' : null });
    } catch { update({ initializing: false, error: 'KartLink could not read its saved Playit connection. Check file access and try again.' }); }
  })();
  await Promise.all([main.loadFile(path.join(__dirname, '..', 'dist', 'index.html')), initialize]);
});
ipcMain.handle('state', () => ({ ...view, health: health() }));
ipcMain.handle('connect', connect);
const accountApi = () => createAccountApi((...args) => session.fromPartition('persist:kartlink-playit-auth').fetch(...args));
ipcMain.handle('list-agents', async () => {
  const agents = await accountApi().list();
  if (!agent || isExited(agent)) return markCurrent(agents, null, false);
  let current;
  try { current = (await request('/agents/rundata', {}, await readSecret())).agent_id; }
  catch { throw new Error('Could not identify the running KartLink agent. Check your connection and refresh.'); }
  if (typeof current !== 'string') throw new Error('Could not identify the running KartLink agent. Check your connection and refresh.');
  return markCurrent(agents, current, !!agent && !isExited(agent));
});
ipcMain.handle('delete-agent', async (_event, id, strategy) => {
  if (operation || view.initializing) throw new Error('Please wait for the current action to finish.');
  operation = true;
  try {
    let ownAgentId = null;
    if (view.connected) {
      try { ownAgentId = (await request('/agents/rundata', {}, await readSecret())).agent_id; }
      catch { throw new Error('Could not identify KartLink’s agent. Check your Playit connection before deleting an agent.'); }
      if (!ownAgentId) throw new Error('Could not identify KartLink’s agent. Check your Playit connection before deleting an agent.');
    }
    await accountApi().remove(id, strategy, agent && !isExited(agent) ? ownAgentId : null);
    if (ownAgentId && id.toLowerCase() === ownAgentId.toLowerCase()) {
      await fs.rm(encryptedPath(), {force:true});
      update({connected:false, needsReset:false, error:null});
      await saveConfig({});
    }
  } finally { operation = false; }
});
ipcMain.handle('list-tunnels', async () => {
  let tunnels;
  try { tunnels = await accountApi().listTunnels(); }
  catch (error) { if (error.code !== 'AccountSignInRequired' || !view.connected) throw error; tunnels = await listTunnels(await readSecret()); }
  const config = room && !isExited(room) && agent && !isExited(agent) ? await readConfig() : {};
  return markCurrent(tunnels, config.tunnelId, !!room && !isExited(room) && !!agent && !isExited(agent));
});
ipcMain.handle('delete-tunnel', async (_event, id) => {
  if (operation || view.initializing) throw new Error('Please wait for the current action to finish.');
  operation = true;
  try {
    const config = await readConfig();
    const activeTunnelId = room && !isExited(room) && agent && !isExited(agent) ? config.tunnelId : null;
    try { await accountApi().removeTunnel(id, activeTunnelId); }
    catch (error) { if (error.code !== 'AccountSignInRequired' || !view.connected) throw error; await deleteTunnel(await readSecret(), id, activeTunnelId); }
    if (config.tunnelId === id) { delete config.tunnelId; delete config.tunnelClaim; delete config.tunnelCreatePending; await saveConfig(config); }
  } finally { operation = false; }
});
ipcMain.handle('start', (_event, password) => start(password));
ipcMain.handle('stop', async () => { if (operation) throw new Error('Please wait for the current action to finish.'); operation = true; try { await stopChildren(); update({ error: null }); return view; } finally { operation = false; } });
ipcMain.handle('disconnect', async () => { if (operation) throw new Error('Please wait for the current action to finish.'); operation = true; try { await stopChildren(); await fs.rm(encryptedPath(), { force: true }); await saveConfig({}); update({ connected: false, needsReset: false, error: null }); return view; } finally { operation = false; } });
ipcMain.handle('check-update', async () => {
  const response = await fetch('https://api.github.com/repos/js664/KartLink-P2P/releases?per_page=20', { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'KartLink-P2P' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Could not check GitHub for updates. Try again later.');
  const releases = await response.json();
  const parts = v => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v)?.slice(1).map(Number);
  const current = parts(app.getVersion());
  const latest = releases.filter(r => !r.draft && parts(r.tag_name)).sort((a,b) => { const x=parts(a.tag_name), y=parts(b.tag_name); return y[0]-x[0] || y[1]-x[1] || y[2]-x[2]; })[0];
  if (!latest || !current) return { current: app.getVersion(), latest: null, available: false };
  const v = parts(latest.tag_name);
  return { current: app.getVersion(), latest: latest.tag_name, available: v[0]>current[0] || (v[0]===current[0] && (v[1]>current[1] || (v[1]===current[1] && v[2]>current[2]))) };
});
ipcMain.handle('open-releases', () => shell.openExternal('https://github.com/js664/KartLink-P2P/releases'));
ipcMain.handle('copy', (_event, text) => { if (typeof text !== 'string' || text.length > 1000) throw new Error('Invalid text.'); clipboard.writeText(text); });
app.on('before-quit', event => { if (quitAfterCleanup) return; event.preventDefault(); shuttingDown = true; cancelClaim = true; void stopChildren().then(() => { quitAfterCleanup = true; app.quit(); }).catch(error => { shuttingDown = false; update({ error: error.message }); if (main && !main.isDestroyed()) main.show(); }); });
app.on('window-all-closed', () => app.quit());
