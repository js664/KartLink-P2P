const { test } = require('node:test');
const assert = require('node:assert/strict');
const { claimCode, parseAddress, request, ensureTunnel, prepareRoom, PlayitError } = require('../electron/playit.cjs');

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
