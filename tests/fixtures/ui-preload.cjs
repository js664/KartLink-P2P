const { contextBridge } = require('electron');
let state = process.env.KARTLINK_UI_SCENARIO === 'progress'
  ? { connected: true, phase: 'starting', progress: 'address', address: null, error: null }
  : process.env.KARTLINK_UI_SCENARIO === 'ready'
  ? { connected: true, phase: 'ready', address: { host: 'example.playit.gg', port: 12345 }, error: null }
  : process.env.KARTLINK_UI_SCENARIO === 'error'
  ? { connected: true, phase: 'idle', address: null, error: 'Your Playit account has too many agents. Open Manage Playit agents and remove unused agents, then try again.' }
  : process.env.KARTLINK_UI_SCENARIO === 'disconnected'
  ? { connected: false, phase: 'idle', address: null, error: null }
  : process.env.KARTLINK_UI_SCENARIO === 'unreadable'
  ? { connected: false, needsReset: true, phase: 'idle', address: null, error: 'KartLink cannot read its saved Playit connection. Clear the saved connection below, then connect Playit again.' }
  : { connected: true, phase: 'idle', address: null, error: null };
let notify = () => {};
let lastCopied = null;
contextBridge.exposeInMainWorld('kartlinkTest', { lastCopied: () => lastCopied });
contextBridge.exposeInMainWorld('kartlink', {
  state: async () => ({...state, health: {roomRunning: state.phase === 'ready', agentRunning: state.phase === 'ready'}, diagnostics: {logs:['Room is open'], players:['KartA'], playerListReliable:false}}),
  onState: fn => { notify = fn; return () => {}; },
  connect: async () => state,
  disconnect: async () => (state = { connected: false, needsReset: false, phase: 'idle', address: null, error: null }),
  managePlayit: async () => {},
  checkUpdate: async () => ({current:'1.0.1', latest:'v1.0.2', available:true}),
  openReleases: async () => {},
  copy: async value => { lastCopied = value; },
  start: async () => {
    if (process.env.KARTLINK_UI_SCENARIO === 'agent-limit') {
      state = { ...state, error: 'Your Playit account has too many agents. Open Manage Playit agents and remove unused agents, then try again.' };
      notify(state);
      throw new Error(state.error);
    }
    return (state = { ...state, phase: 'ready', address: { host: 'example.test', port: 32100 }, error: null, health: {roomRunning:true, agentRunning:true}, diagnostics: {logs:['Room is open'], players:['KartA'], playerListReliable:false} });
  },
  stop: async () => (state = { ...state, phase: 'idle', address: null, error: null }),
});
