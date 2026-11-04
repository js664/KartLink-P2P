const MAX_LINES = 300;
function createDiagnostics(onChange = () => {}) {
  let lines = [], players = new Set(), remainder = '';
  const snapshot = () => ({ logs: [...lines], players: [...players], playerListReliable: false });
  const accept = line => {
    line = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, 2000);
    if (!line.trim()) return;
    lines.push(line); if (lines.length > MAX_LINES) lines.shift();
    const event = line.match(/SendStatusMessage:\s*\[[^\]]*\]\s*(.+?)\s+has (joined|left|been kicked|been banned)\.\s*$/);
    if (event) { if (event[2] === 'joined') players.add(event[1]); else players.delete(event[1]); }
  };
  return {
    reset() { lines = []; players.clear(); remainder = ''; onChange(snapshot()); },
    push(chunk) { remainder += String(chunk); const parts = remainder.split(/\r?\n/); remainder = parts.pop().slice(-4000); for (const line of parts) accept(line); onChange(snapshot()); },
    snapshot,
  };
}
module.exports = { createDiagnostics };
