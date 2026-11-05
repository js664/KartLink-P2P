const crypto = require('node:crypto');

class PlayitError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const recovery = {
  'agent-over-limit': 'Your Playit account has too many agents. Open Manage Playit agents and remove unused agents, then try again.',
  AgentOverLimit: 'Your Playit account has too many agents. Open Manage Playit agents and remove unused agents, then try again.',
  AccountPortLimitReached: 'Your Playit account has reached its port limit. Open Manage Playit agents, remove an unused tunnel, and try again.',
  'over-port-limit': 'Your Playit account has reached its port limit. Open Manage Playit agents, remove an unused tunnel, and try again.',
  RequiresPlayitPremium: 'Playit says this tunnel requires Premium. Check your Playit account and plan before trying again.',
  'requires-premium': 'Playit says this tunnel requires Premium. Check your Playit account and plan before trying again.',
  RequiresVerifiedAccount: 'Playit requires a verified account. Verify your email in Playit, then try again.',
  EmailMustBeVerified: 'Playit requires a verified email. Verify your email in Playit, then try again.',
  InvalidAgentKey: 'Your Playit connection is no longer valid. Disconnect Playit in KartLink, then connect it again.',
  InvalidApiKey: 'Your Playit connection is no longer valid. Disconnect Playit in KartLink, then connect it again.',
  AgentNotFound: 'Playit could not find this agent. Disconnect Playit in KartLink, then connect it again.',
  InvalidAgentId: 'Playit could not find this agent. Disconnect Playit in KartLink, then connect it again.',
  'agent-disabled': 'The Playit agent is disabled. Open Manage Playit agents to enable it, then try again.',
  'email-not-verified': 'Playit requires a verified email. Verify your email in Playit, then try again.',
  banned: 'Playit reports that this account is unavailable. Open Manage Playit agents to check your account.',
  NotAllowedWithReadOnly: 'Playit did not allow this agent to create a tunnel. Check the agent permissions in Manage Playit agents.',
  AgentNotSelfManaged: 'Playit did not allow this agent to manage tunnels. Disconnect Playit in KartLink, then connect it again.',
  AgentVersionTooOld: 'Playit has not accepted this agent version. Check your internet connection and try again; if it continues, update KartLink.',
  TunnelTypeRequiresDescription: 'Playit rejected the tunnel description. Update KartLink and try again.',
};
function explain(code, fallback) {
  return recovery[code] || fallback;
}

async function request(path, body = {}, secret, fetcher = fetch) {
  const headers = { 'content-type': 'application/json' };
  if (secret) headers.authorization = `Agent-Key ${secret}`;
  let response;
  try {
    response = await fetcher(`https://api.playit.gg${path}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    throw new PlayitError(error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'Playit took too long to respond. Check your connection and try again.'
      : 'Could not reach Playit. Check your internet connection and try again.');
  }
  let result;
  try { result = await response.json(); } catch {
    throw new PlayitError(`Playit ${path} returned HTTP ${response.status} without a readable explanation.`);
  }
  if (!response.ok) {
    const message = typeof result.data === 'string' ? result.data : result.data?.message;
    const detail = typeof message === 'string' && /^[\w .:-]{1,160}$/.test(message) ? `: ${message}` : '';
    const fallback = response.status === 429 ? 'Playit is receiving too many requests. Wait a moment, then try again.' :
      response.status >= 500 ? 'Playit is having a server problem. Wait a moment, then try again.' :
      `Playit ${path} returned HTTP ${response.status}${detail}.`;
    throw new PlayitError(explain(message, fallback), message);
  }
  if (result.status !== 'success') {
    const code = typeof result.data === 'string' ? result.data : result.data?.message;
    const safe = typeof code === 'string' && /^[\w .:-]{1,160}$/.test(code) ? code : 'Unknown error';
    throw new PlayitError(explain(code, `Playit: ${safe}. Try again; if it continues, check your Playit account.`), code);
  }
  return result.data;
}

async function prepareRoom({ startRoom, startAgent, getTunnel, wait }) {
  await startRoom();
  await startAgent();
  let versionRetries = 0, allocationRetries = 0;
  for (;;) {
    try { return await getTunnel(); }
    catch (error) {
      if (error.code === 'AgentVersionTooOld' && versionRetries++ < 4) { await wait(3000); continue; }
      if (error.code !== 'AllocationPending' || allocationRetries++ >= 10) throw error;
      await wait(3000);
    }
  }
}

function claimCode() { return crypto.randomBytes(5).toString('hex'); }
function parseAddress(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^([^\s:]+):(\d{1,5})$/);
  const port = match && Number(match[2]);
  return match && port > 0 && port < 65536 ? { host: match[1], port } : null;
}

async function listTunnels(secret, api = request) {
  const result = await api('/tunnels/list', {}, secret);
  if (!Array.isArray(result?.tunnels)) throw new PlayitError('Playit returned an invalid tunnel list. Please try again.');
  return result.tunnels.filter(t => typeof t.id === 'string').map(t => ({
    id: t.id, name: typeof t.name === 'string' && t.name ? t.name : 'Unnamed tunnel',
    protocol: typeof t.port_type === 'string' ? t.port_type.toUpperCase() : 'Unknown',
    portCount: Number.isInteger(t.port_count) ? t.port_count : null,
    address: t.alloc?.status === 'allocated' ? parseAddress(`${t.alloc.data?.static_ip4 || t.alloc.data?.assigned_domain || t.alloc.data?.ip_hostname}:${t.alloc.data?.port_start}`) : null,
    localPort: Number.isInteger(t.origin?.data?.local_port) ? t.origin.data.local_port : null,
    agentName: typeof t.origin?.data?.agent_name === 'string' ? t.origin.data.agent_name : null,
  }));
}

async function deleteTunnel(secret, id, activeTunnelId, api = request) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new PlayitError('Invalid tunnel ID. Refresh the list and try again.');
  if (activeTunnelId && id.toLowerCase() === activeTunnelId.toLowerCase()) throw new PlayitError('Stop your room before deleting its tunnel.');
  const tunnels = await listTunnels(secret, api);
  if (!tunnels.some(t => t.id === id)) throw new PlayitError('This tunnel is no longer in the list. Refresh and try again.');
  await api('/tunnels/delete', { tunnel_id: id }, secret);
}

// Use only the tunnel ID recorded by this app; never reuse or change other tunnels.
async function ensureTunnel(secret, state, save, api = request) {
  const run = await api('/agents/rundata', {}, secret);
  if (!run.agent_id) throw new PlayitError('Playit did not return an agent ID.');
  if (['agent-over-limit', 'agent-disabled', 'email-not-verified', 'banned'].includes(run.account_status)) throw new PlayitError(explain(run.account_status));
  if (!state.tunnelId) {
    if (state.tunnelClaim) {
      const existing = await api('/tunnels/list', {}, secret);
      const matches = (existing.tunnels || []).filter(t => t.name === `KartLink P2P-${state.tunnelClaim}` && t.origin?.type === 'agent' && t.origin.data?.agent_id === run.agent_id && t.origin.data?.local_ip === '127.0.0.1' && t.origin.data?.local_port === 6009 && t.port_type === 'udp' && t.port_count === 1);
      if (matches.length > 1) throw new PlayitError('More than one tunnel matches this KartLink connection. Open Manage agents to review them.');
      if (matches.length === 1 && matches[0].id) {
        state.tunnelId = matches[0].id;
        delete state.tunnelCreatePending;
        await save(state);
      } else if (state.tunnelCreatePending) {
        throw new PlayitError('KartLink is checking a previous tunnel request. Wait a moment and try again; if it remains unresolved, check Manage agents.');
      }
    }
    if (!state.tunnelId) {
      const previous = { ...state };
      state.tunnelClaim = state.tunnelClaim || crypto.randomBytes(12).toString('hex');
      state.tunnelCreatePending = true;
      try { await save(state); } catch (error) { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, previous); throw error; }
      let created;
      try {
        created = await api('/tunnels/create', {
          name: `KartLink P2P-${state.tunnelClaim}`, tunnel_type: null, tunnel_description: 'Eglantine multiplayer room server', port_type: 'udp', port_count: 1,
          origin: { type: 'agent', data: { agent_id: run.agent_id, local_ip: '127.0.0.1', local_port: 6009 } },
          enabled: true, alloc: null, firewall_id: null, proxy_protocol: null,
        }, secret);
      } catch (error) {
        if (['AgentVersionTooOld', 'TunnelTypeRequiresDescription', 'RequiresPlayitPremium', 'RequiresVerifiedAccount', 'EmailMustBeVerified', 'AccountPortLimitReached', 'AgentOverLimit', 'InvalidAgentId', 'AgentNotFound', 'NotAllowedWithReadOnly', 'AgentNotSelfManaged'].includes(error.code)) { delete state.tunnelCreatePending; await save(state); }
        throw error;
      }
      if (!created?.id) throw new PlayitError('Playit did not return a tunnel ID. Check Manage agents before retrying.');
      state.tunnelId = created.id;
      delete state.tunnelCreatePending;
      await save(state);
    }
  }
  const listing = await api('/tunnels/list', {}, secret);
  const tunnel = listing.tunnels?.find(t => t.id === state.tunnelId);
  if (!tunnel) {
    delete state.tunnelId;
    delete state.tunnelClaim;
    delete state.tunnelCreatePending;
    await save(state);
    throw new PlayitError('The saved KartLink tunnel was removed from Playit. Press Create room again to make a new one.');
  }
  if (tunnel.alloc?.status === 'disabled' || tunnel.disabled_reason) {
    const reason = tunnel.alloc?.data?.reason || tunnel.disabled_reason;
    throw new PlayitError(explain(reason, `The Playit tunnel is disabled (${reason}). Open Manage Playit agents and check your tunnel.`));
  }
  if (tunnel.alloc?.status !== 'allocated') throw new PlayitError('Playit is still assigning an address. Wait a moment, then press Create room again. If this continues, check the tunnel in Manage Playit agents.', 'AllocationPending');
  const allocation = tunnel.alloc.data;
  const host = allocation.static_ip4 || allocation.assigned_domain || allocation.ip_hostname;
  const port = Number(allocation.port_start);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new PlayitError('Playit did not provide a usable address and port.');
  return { host, port };
}

module.exports = { request, claimCode, parseAddress, listTunnels, deleteTunnel, ensureTunnel, prepareRoom, PlayitError };
