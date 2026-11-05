const { URL } = require('node:url');
function isPlayitUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && (u.hostname === 'playit.gg' || u.hostname.endsWith('.playit.gg')); } catch { return false; }
}
function isExternalHttps(value) {
  try { const u = new URL(value); return value.length <= 2048 && u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
module.exports = { isPlayitUrl, isExternalHttps };
