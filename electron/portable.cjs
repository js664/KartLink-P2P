const fs = require('node:fs');
const path = require('node:path');
function configurePortable(app, { executable = process.execPath, exists = fs.existsSync } = {}) {
  if (!app.isPackaged || !exists(path.join(path.dirname(executable), 'kartlink-portable.flag'))) return false;
  const data = path.join(path.dirname(executable), 'KartLink-data');
  app.setPath('userData', data);
  app.setPath('sessionData', path.join(data, 'Session'));
  return true;
}
module.exports = { configurePortable };
