const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = process.env.KARTLINK_RELEASE_OUTPUT ? path.resolve(process.env.KARTLINK_RELEASE_OUTPUT) : path.join(root, 'release-build');
const unpacked = path.join(output, 'win-unpacked');
const version = require('../package.json').version;
const mode = process.argv[2] || 'all';
if (process.platform !== 'win32') throw new Error('Windows is required to build the Windows distributions.');
if (!['all', 'installer', 'portable'].includes(mode)) throw new Error('Expected all, installer or portable.');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed (${result.status})`);
}
run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
const builder = require.resolve('electron-builder/cli.js');
run(process.execPath, [builder, '--win', ...(mode === 'portable' ? ['--dir'] : ['nsis']), '--x64', `--config.directories.output=${output}`]);
if (mode !== 'installer') {
  const flag = path.join(unpacked, 'kartlink-portable.flag');
  const instructions = path.join(unpacked, 'PORTABLE-README.txt');
  if (fs.existsSync(flag) || fs.existsSync(instructions)) throw new Error('Portable staging files already exist; refusing to overwrite them.');
  const zip = path.join(output, `KartLink-P2P-Portable-${version}.zip`);
  try {
    fs.writeFileSync(flag, 'KartLink portable profile marker\n', { flag: 'wx' });
    fs.writeFileSync(instructions, 'Extract the entire ZIP to a writable folder before starting KartLink P2P.exe.\r\nSettings and Playit data are stored in the KartLink-data folder next to the app.\r\nWindows encryption ties saved Playit credentials to the Windows user and computer; reconnect Playit after moving to another account or PC.\r\n', { flag: 'wx' });
    if (fs.existsSync(zip)) fs.unlinkSync(zip);
    run('tar.exe', ['-a', '-c', '-f', zip, '.'], unpacked);
    console.log(`Portable ZIP: ${zip}`);
  } finally {
    if (fs.existsSync(flag)) fs.unlinkSync(flag);
    if (fs.existsSync(instructions)) fs.unlinkSync(instructions);
  }
}
