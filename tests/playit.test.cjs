const { test } = require('node:test');
const assert = require('node:assert/strict');
const { claimCode, parseAddress, request, ensureTunnel, prepareRoom, listTunnels, deleteTunnel, PlayitError } = require('../electron/playit.cjs');

test('tunnel management lists safe fields and deletes only a listed inactive tunnel', async () => {
  const id = '11111111-1111-4111-8111-111111111111'; const calls = [];
  const api = async (path, body) => { calls.push({path, body}); return path === '/tunnels/list' ? {tunnels:[{id,name:'Room',port_type:'udp',port_count:1,origin:{data:{agent_name:'Agent',local_port:6009}},alloc:{status:'allocated',data:{static_ip4:'192.0.2.1',port_start:1234}}, secret:'must-not-escape'}]} : {}; };
  const list = await listTunnels('key', api);
  assert.deepEqual(list[0].address, {host:'192.0.2.1',port:1234});
  assert.equal('secret' in list[0], false);
  await assert.rejects(deleteTunnel('key', id, id, api), /Stop your room/);
  await assert.rejects(deleteTunnel('key', 'invalid', null, api), /Invalid tunnel ID/);
  await assert.rejects(deleteTunnel('key', '22222222-2222-4222-8222-222222222222', null, api), /no longer in the list/);
  await deleteTunnel('key', id, null, api);
  assert.deepEqual(calls.at(-1), {path:'/tunnels/delete',body:{tunnel_id:id}});
  await assert.rejects(listTunnels('key', async () => ({})), /invalid tunnel list/);
});

test('claim codes and addresses are validated', () => {
  assert.match(claimCode(), /^[0-9a-f]{10}$/);
  assert.deepEqual(parseAddress('example.playit.gg:12345'), { host: 'example.playit.gg', port: 12345 });
  assert.equal(parseAddress('example:0'), null);
  assert.equal(parseAddress('http://example:6009'), null);
});
test('API sends the agent key and surfaces provider errors', async () => {
  let seen;
  const fake = async (url, options) => { seen = { url, options }; return { ok: true, json: async () => ({ status: 'fail', data: 'NoPermission' }) }; };
  await assert.rejects(request('/example', {}, 'secret', fake), /NoPermission/);
  assert.equal(seen.options.headers.authorization, 'Agent-Key secret');
});
test('HTTP 400 translates a known provider error into recovery steps', async () => {
  const fake = async () => ({ ok: false, status: 400, json: async () => ({ status: 'error', data: { type: 'auth', message: 'InvalidAgentId' } }) });
  await assert.rejects(request('/tunnels/create', {}, 'secret', fake), /Disconnect Playit.*connect it again/);
});
test('creates one UDP tunnel and reuses only its recorded ID', async () => {
  let created = 0, saved;
  const state = {};
  const api = async (path, body) => {
    if (path === '/agents/rundata') return { agent_id: 'agent' };
    if (path === '/tunnels/create') { created++; assert.equal(body.port_type, 'udp'); assert.equal(body.tunnel_type, null); assert.ok(body.tunnel_description?.trim(), 'custom UDP tunnels require a description'); assert.equal(body.origin.data.local_port, 6009); return { id: 'ours' }; }
    if (path === '/tunnels/list') return { tunnels: [{ id: 'someone-else' }, { id: 'ours', alloc: { status: 'allocated', data: { static_ip4: '203.0.113.1', port_start: 32100 } } }] };
    throw Error('unexpected request');
  };
  const save = async value => { saved = { ...value }; };
  assert.deepEqual(await ensureTunnel('key', state, save, api), { host: '203.0.113.1', port: 32100 });
  await ensureTunnel('key', state, save, api);
  assert.equal(created, 1); assert.equal(saved.tunnelId, 'ours');
});
test('pending and disabled allocations are not advertised', async () => {
  const state = { tunnelId: 'ours' };
  for (const [alloc, message] of [[{ status: 'pending' }, /still assigning/], [{ status: 'disabled', data: { reason: 'requires-premium' } }, /Premium/]]) {
    const api = async path => path === '/agents/rundata' ? { agent_id: 'agent' } : { tunnels: [{ id: 'ours', alloc }] };
    await assert.rejects(ensureTunnel('key', state, async () => {}, api), message);
  }
});
test('agent limit stops before any tunnel is created', async () => {
  const calls = [];
  const api = async path => { calls.push(path); return { agent_id: 'agent', account_status: 'agent-over-limit' }; };
  await assert.rejects(ensureTunnel('key', {}, async () => {}, api), /too many agents.*Manage Playit agents/);
  assert.deepEqual(calls, ['/agents/rundata']);
});
test('a removed saved tunnel is cleared so the next attempt can recover', async () => {
  const state = { tunnelId: 'removed' }; let saved;
  const api = async path => path === '/agents/rundata' ? { agent_id: 'agent' } : { tunnels: [] };
  await assert.rejects(ensureTunnel('key', state, async value => { saved = { ...value }; }, api), /Press Create room again/);
  assert.equal(saved.tunnelId, undefined);
});
test('network failure and rate limiting offer recovery steps', async () => {
  await assert.rejects(request('/x', {}, null, async () => { throw new Error('offline'); }), /internet connection/);
  const limited = async () => ({ ok: false, status: 429, json: async () => ({ status: 'error' }) });
  await assert.rejects(request('/x', {}, null, limited), /Wait a moment/);
});
test('starts the agent before tunnel creation and retries while its version registers', async () => {
  const calls = []; let attempts = 0;
  const result = await prepareRoom({
    startRoom: async () => calls.push('room'), startAgent: async () => calls.push('agent'),
    getTunnel: async () => { calls.push('tunnel'); if (++attempts < 3) throw new PlayitError('not registered', 'AgentVersionTooOld'); return { host: 'example.test', port: 1234 }; },
    wait: async () => calls.push('wait'),
  });
  assert.deepEqual(calls, ['room', 'agent', 'tunnel', 'wait', 'tunnel', 'wait', 'tunnel']);
  assert.equal(result.host, 'example.test');
});
test('does not retry unrelated tunnel errors', async () => {
  let attempts = 0;
  await assert.rejects(prepareRoom({ startRoom: async () => {}, startAgent: async () => {}, getTunnel: async () => { attempts++; throw new PlayitError('permission denied', 'NotAllowedWithReadOnly'); }, wait: async () => {} }), /permission denied/);
  assert.equal(attempts, 1);
});
test('keeps the agent running while Playit assigns an address', async () => {
  const events = []; let attempts = 0;
  const result = await prepareRoom({
    startRoom: async () => events.push('room'), startAgent: async () => events.push('agent'),
    getTunnel: async () => { events.push('tunnel'); if (++attempts < 3) throw new PlayitError('pending', 'AllocationPending'); return { host: 'example.test', port: 1234 }; },
    wait: async () => events.push('wait'),
  });
  assert.deepEqual(events, ['room', 'agent', 'tunnel', 'wait', 'tunnel', 'wait', 'tunnel']);
  assert.equal(result.port, 1234);
});
test('reports a persistent pending allocation after a bounded wait', async () => {
  let calls = 0;
  await assert.rejects(prepareRoom({ startRoom: async () => {}, startAgent: async () => {}, getTunnel: async () => { calls++; throw new PlayitError('still pending', 'AllocationPending'); }, wait: async () => {} }), /still pending/);
  assert.equal(calls, 11);
});

test('a failed ID save is recovered using the pre-saved unique tunnel claim', async () => {
  let disk = {}, remote = [], creates = 0, failIdSave = true;
  const save = async value => { if (value.tunnelId && failIdSave) { failIdSave = false; throw new Error('disk failure'); } disk = structuredClone(value); };
  const api = async (route, body) => {
    if (route === '/agents/rundata') return { agent_id: 'agent' };
    if (route === '/tunnels/create') { creates++; remote.push({ id: 'owned', name: body.name, origin:body.origin, port_type:body.port_type, port_count:body.port_count, alloc: {status:'allocated',data:{static_ip4:'203.0.113.1',port_start:1234}} }); return {id:'owned'}; }
    if (route === '/tunnels/list') return {tunnels:remote}; throw new Error('unexpected route');
  };
  await assert.rejects(ensureTunnel('key', {}, save, api), /disk failure/);
  assert.equal(disk.tunnelCreatePending, true); assert.ok(disk.tunnelClaim); assert.equal(creates, 1);
  const restored = structuredClone(disk); assert.equal((await ensureTunnel('key', restored, save, api)).port,1234);
  assert.equal(creates,1); assert.equal(disk.tunnelId,'owned'); assert.equal(disk.tunnelCreatePending,undefined);
});
test('uncertain creation does not create a duplicate or adopt another tunnel', async () => {
  const state = {tunnelClaim:'abc123',tunnelCreatePending:true}; let creates=0;
  const api=async route=>route==='/agents/rundata'?{agent_id:'agent'}:route==='/tunnels/list'?{tunnels:[{id:'other',name:'KartLink P2P'}]}:(creates++,{});
  await assert.rejects(ensureTunnel('key',state,async()=>{},api),/previous tunnel request/); assert.equal(creates,0);
});
test('a failed intent save never creates a tunnel',async()=>{
 let calls=[];const state={};const api=async route=>{calls.push(route);return {agent_id:'agent'}};
 await assert.rejects(ensureTunnel('key',state,async()=>{throw Error('disk full')},api),/disk full/);
 assert.deepEqual(calls,['/agents/rundata']);assert.deepEqual(state,{});
});

test('reconciliation never adopts a matching name from a different agent', async () => {
 const state={tunnelClaim:'same',tunnelCreatePending:true};let creates=0;
 const api=async route=>route==='/agents/rundata'?{agent_id:'ours'}:route==='/tunnels/list'?{tunnels:[{id:'other',name:'KartLink P2P-same',origin:{type:'agent',data:{agent_id:'different',local_ip:'127.0.0.1',local_port:6009}},port_type:'udp',port_count:1}]}:(creates++,{});
 await assert.rejects(ensureTunnel('key',state,async()=>{},api),/previous tunnel request/);assert.equal(creates,0);
});
