const { _electron } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const version = require('../package.json').version;
  const output = process.env.KARTLINK_RELEASE_OUTPUT ? path.resolve(process.env.KARTLINK_RELEASE_OUTPUT) : path.join(root,'release-build');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartlink-package-test-'));
  try {
    const portable = path.join(temp, 'portable');
    fs.mkdirSync(portable);
    execFileSync('tar.exe', ['-xf', path.join(output, `KartLink-P2P-Portable-${version}.zip`), '-C', portable]);
    for (const [label, folder, args] of [
      ['unpacked', path.join(output, 'win-unpacked'), [`--user-data-dir=${path.join(temp, 'profile')}`]],
      ['portable', portable, []],
    ]) {
      const app = await _electron.launch({ executablePath: path.join(folder, 'KartLink P2P.exe'), args, timeout: 60000 });
      try {
        const page = await app.firstWindow();
        await page.getByRole('button', { name: 'Connect Playit' }).waitFor({ timeout: 60000 });
        assert.equal(await app.evaluate(({app}) => app.getVersion()), version);
        const dataPath = await app.evaluate(({app}) => app.getPath('userData'));
        assert.ok(dataPath.startsWith(temp), `Unexpected ${label} profile: ${dataPath}`);
        assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()), 1);
        console.log(`${label}: launches with isolated profile and 100% zoom`);
      } finally { await app.close(); }
    }
  } finally { fs.rmSync(temp, {recursive:true, force:true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
