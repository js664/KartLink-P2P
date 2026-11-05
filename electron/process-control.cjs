function isExited(child) { return !child || child.exitCode !== null || child.signalCode != null || (child.pid == null && child.spawnFailed === true); }
function waitForExit(child, timeoutMs) {
  if (isExited(child)) return Promise.resolve(true);
  return new Promise(resolve => {
    let timer;
    const done = value => { clearTimeout(timer); child.removeListener('exit', onExit); child.removeListener('error', onError); resolve(value); };
    const onExit = () => done(true);
    const onError = () => { if (child.pid == null) { child.spawnFailed = true; done(true); } };
    child.once('exit', onExit); child.on('error', onError);
    timer = setTimeout(() => done(isExited(child)), timeoutMs);
    if (isExited(child)) done(true);
  });
}
async function terminateChild(child, { graceful = false, graceMs = 1500, killMs = 3000, name = 'Child process' } = {}) {
  if (isExited(child)) return;
  let pending = waitForExit(child, graceful ? graceMs : killMs);
  if (graceful) {
    try { child.stdin?.on('error', () => {}); child.stdin?.write('q\n'); } catch { /* Escalate after deadline. */ }
  } else {
    try { child.kill(); } catch (error) { if (!isExited(child)) throw new Error(`${name} could not be stopped: ${error.message}`); }
  }
  if (await pending) return;
  if (!graceful) throw new Error(`${name} did not exit after termination was requested.`);
  pending = waitForExit(child, killMs);
  try { child.kill(); } catch (error) { if (!isExited(child)) throw new Error(`${name} could not be stopped: ${error.message}`); }
  if (!(await pending)) throw new Error(`${name} did not exit after forced termination.`);
}
module.exports = { isExited, terminateChild };
