const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { configurePortable } = require('../electron/portable.cjs');
test('portable marker puts user and browser session data next to the executable', () => {
  const values = {};
  const app = { isPackaged: true, setPath: (key, value) => { values[key] = value; } };
  const executable = path.join('C:', 'portable', 'KartLink P2P.exe');
  assert.equal(configurePortable(app, { executable, exists: () => true }), true);
  assert.equal(values.userData, path.join(path.dirname(executable), 'KartLink-data'));
  assert.equal(values.sessionData, path.join(values.userData, 'Session'));
});
test('installed and development builds do not redirect the profile', () => {
  const calls = [];
  assert.equal(configurePortable({ isPackaged: true, setPath: (...args) => calls.push(args) }, { exists: () => false }), false);
  assert.equal(configurePortable({ isPackaged: false, setPath: (...args) => calls.push(args) }, { exists: () => true }), false);
  assert.deepEqual(calls, []);
});
