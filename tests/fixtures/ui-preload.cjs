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
let fakeSessionReady = false;
let sessionChanged = () => {};
contextBridge.exposeInMainWorld('kartlinkTest', { lastCopied: () => lastCopied, emitDiagnostics: diagnostics => { state = { ...state, diagnostics, revision: (state.revision || 0) + 1 }; notify(state); } });
contextBridge.exposeInMainWorld('kartlink', {
  state: async () => { if (process.env.KARTLINK_UI_SCENARIO === 'race') { await new Promise(r=>setTimeout(r,250)); return {connected:false,phase:'idle',address:null,error:null,revision:1}; } return ({...state, health: {roomRunning: state.phase === 'ready', agentRunning: state.phase === 'ready'}, diagnostics: {logs:['Room is open'], players:['KartA'], playerListReliable:false}}); },
  onState: fn => { notify = fn; if(process.env.KARTLINK_UI_SCENARIO === 'race') setTimeout(()=>fn({...state,connected:true,revision:2}),10); return () => {}; },
  connect: async () => state,
  disconnect: async () => (state = { connected: false, needsReset: false, phase: 'idle', address: null, error: null }),
  onPlayitSessionChanged: callback => { sessionChanged = callback; return () => { sessionChanged = () => {}; }; },
  listAgents: async () => { if (process.env.KARTLINK_UI_SCENARIO === 'auth-expired' && !fakeSessionReady) throw Error('KartLink could not find your Playit website session. Connect Playit from the Room tab, then refresh this list.'); return process.env.KARTLINK_UI_SCENARIO === 'active-resources' ? [{id:'22222222-2222-4222-8222-222222222222',name:'Current agent',status:'connected',tunnels:1,inUse:true},{id:'33333333-3333-4333-8333-333333333333',name:'Old agent',status:'offline',tunnels:0,inUse:false}] : [{id:'22222222-2222-4222-8222-222222222222',name:'Test agent',status:'offline',tunnels:1,inUse:false}].filter(() => !process.env.KARTLINK_TEST_AGENT_DELETED); },
  deleteAgent: async () => { process.env.KARTLINK_TEST_AGENT_DELETED = '1'; },
  listTunnels: async () => process.env.KARTLINK_UI_SCENARIO === 'active-resources' ? [{id:'11111111-1111-4111-8111-111111111111',name:'Current tunnel',protocol:'UDP',inUse:true},{id:'44444444-4444-4444-8444-444444444444',name:'Old tunnel',protocol:'UDP',inUse:false}] : [{id:'11111111-1111-4111-8111-111111111111', name:'Test tunnel', protocol:'UDP', portCount:1, address:{host:'example.test',port:32100}, localPort:6009, agentName:'Test agent',inUse:false}].filter(t => !process.env.KARTLINK_TEST_TUNNEL_DELETED),
  deleteTunnel: async () => { process.env.KARTLINK_TEST_TUNNEL_DELETED = '1'; },
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
