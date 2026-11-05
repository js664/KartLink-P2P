// Playit's website uses its own persistent browser session, not the agent key.
const { PlayitError } = require('./playit.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createAccountApi(fetcher) {
  let refreshPromise = null;
  async function raw(endpoint, body = {}) {
    let response;
    try {
      response = await fetcher(`https://api.playit.gg${endpoint}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
      });
    } catch { throw new PlayitError('Could not reach Playit. Check your connection and try again.'); }
    try { return await response.json(); }
    catch { throw new PlayitError(`Playit returned an unreadable response (HTTP ${response.status}).`); }
  }
  async function call(endpoint, body = {}) {
    let result = await raw(endpoint, body);
    if (result?.status === 'error' && result.data?.type === 'auth' && result.data?.message === 'SessionExpired') {
      if (!refreshPromise) refreshPromise = raw('/login/refresh').finally(() => { refreshPromise = null; });
      await refreshPromise;
      result = await raw(endpoint, body);
    }
    if (result?.status !== 'success') {
      const code = typeof result?.data === 'string' ? result.data : result?.data?.message;
      if (['SessionExpired', 'AuthRequired', 'InvalidAuthType', 'NoLongerValid'].includes(code)) throw new PlayitError('KartLink could not find your Playit website session. Connect Playit from the Room tab, then refresh this list.', 'AccountSignInRequired');
      const safe = typeof code === 'string' && /^[\w .:-]{1,120}$/.test(code) ? ` (${code})` : '';
      throw new PlayitError(`Playit could not complete this action${safe}. Refresh and try again.`, code);
    }
    return result.data;
  }
  return {
    async listTunnels() {
      const result = await call('/v1/tunnels/list');
      if (!Array.isArray(result?.tunnels)) throw new PlayitError('Playit returned an invalid tunnel list. Refresh and try again.');
      return result.tunnels.filter(t => typeof t.id === 'string' && UUID.test(t.id)).map(t => {
        const allocation = t.public_allocations?.find(a => a.type === 'PortAllocation')?.details;
        const host = allocation?.ip || allocation?.auto_domain || allocation?.ip_hostname;
        const port = Number(allocation?.port);
        return {id:t.id, name:typeof t.name === 'string' && t.name ? t.name : 'Unnamed tunnel', protocol:typeof t.port_type === 'string' ? t.port_type.toUpperCase() : 'Unknown', portCount:Number.isInteger(t.port_count) ? t.port_count : null, address:host && Number.isInteger(port) && port > 0 && port < 65536 ? {host,port}:null, localPort:null, agentName:typeof t.origin?.details?.name === 'string' ? t.origin.details.name : null};
      });
    },
    async removeTunnel(id, activeTunnelId) {
      if (typeof id !== 'string' || !UUID.test(id)) throw new PlayitError('Invalid tunnel ID. Refresh and try again.');
      if (id.toLowerCase() === activeTunnelId?.toLowerCase()) throw new PlayitError('Stop your room before deleting its tunnel.');
      if (!(await this.listTunnels()).some(t => t.id === id)) throw new PlayitError('This tunnel is no longer in the list. Refresh and try again.');
      await call('/tunnels/delete', {tunnel_id:id});
    },
    async list() {
      const [result, tunnelResult] = await Promise.all([call('/agents/list'), call('/v1/tunnels/list')]);
      if (!Array.isArray(result?.agents) || !Array.isArray(tunnelResult?.tunnels)) throw new PlayitError('Playit returned an invalid agent list. Refresh and try again.');
      return result.agents.filter(a => typeof a.id === 'string' && UUID.test(a.id)).map(a => ({
        id: a.id, name: typeof a.name === 'string' && a.name ? a.name : 'Unnamed agent',
        status: typeof a.status?.state === 'string' ? a.status.state : 'unknown',
        tunnels: tunnelResult.tunnels.filter(t => t.origin?.type === 'agent' && t.origin?.details?.agent_id === a.id).length,
      }));
    },
    async remove(id, strategy, activeAgentId) {
      if (typeof id !== 'string' || !UUID.test(id)) throw new PlayitError('Invalid agent ID. Refresh and try again.');
      if (id.toLowerCase() === activeAgentId?.toLowerCase()) throw new PlayitError('Stop your room before deleting its Playit agent.');
      if (!['leave', 'delete'].includes(strategy)) throw new PlayitError('Choose what to do with this agent’s tunnels.');
      const agents = await this.list();
      const target = agents.find(a => a.id === id);
      if (!target) throw new PlayitError('This agent is no longer in the list. Refresh and try again.');
      const tunnels_strategy = target.tunnels === 0 ? {type:'require_empty',details:null} : strategy === 'delete' ? {type:'delete_tunnels',details:null} : {type:'move_to_agent',details:{agent_id:null,disable_tunnels:false}};
      await call('/agents/delete', {agent_id:id, tunnels_strategy});
    },
  };
}
module.exports = { createAccountApi };
