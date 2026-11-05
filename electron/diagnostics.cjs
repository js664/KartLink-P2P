const { StringDecoder } = require('node:string_decoder');
const MAX_LINES = 300;
function createDiagnostics(onChange = () => {}) {
  let lines = [], players = new Set(), streams = new Map();
  const snapshot = () => ({ logs: [...lines], players: [...players], playerListReliable: false });
  const accept = line => {
    line = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, 2000);
    if (!line.trim()) return;
    lines.push(line); if (lines.length > MAX_LINES) lines.shift();
    const event = line.match(/^\[\s*[\d.]+\]\s+Network\s+<Info>\s+[^\r\n]*?room\.cpp:\d+:SendStatusMessage:\s*\[[^\]]*\]\s*(.+?)\s+has (joined|left|been kicked|been banned)\.\s*$/);
    if (event) { if (event[2] === 'joined') players.add(event[1]); else players.delete(event[1]); }
  };
  return {
    reset() { lines = []; players.clear(); streams = new Map(); onChange(snapshot()); },
    push(chunk, stream = 'stdout') {
      let state = streams.get(stream); if (!state) { state = { decoder: new StringDecoder('utf8'), remainder: '' }; streams.set(stream, state); }
      state.remainder += Buffer.isBuffer(chunk) ? state.decoder.write(chunk) : String(chunk);
      const parts = state.remainder.split(/\r?\n/); state.remainder = parts.pop().slice(-4000);
      for (const line of parts) accept(line); onChange(snapshot());
    },
    snapshot,
  };
}
module.exports = { createDiagnostics };
