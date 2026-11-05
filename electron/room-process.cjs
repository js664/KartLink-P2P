const { terminateChild, isExited } = require('./process-control.cjs');
function waitForRoomReady(child, { timeoutMs = 12000, onOutput = () => {}, beforeStop = () => {}, graceMs = 1500, killMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    let output = '', finished = false;
    const finish = async error => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (error) {
        beforeStop(child);
        try { await terminateChild(child, { graceful: true, graceMs, killMs, name: 'Room server' }); }
        catch (cleanupError) { reject(new Error(`${error.message} ${cleanupError.message}`)); return; }
        reject(error);
      } else if (isExited(child)) reject(new Error('The room server exited before it was ready.'));
      else resolve();
    };
    const read = stream => chunk => {
      onOutput(chunk, stream);
      if (finished) return;
      output = (output + chunk.toString()).slice(-8192);
      if (output.includes('Room is open')) void finish();
      else if (output.includes('Failed to create room')) void finish(new Error('Could not open local UDP port 6009. Close another room using that port and try again.'));
    };
    child.stdout.on('data', read('stdout')); child.stderr.on('data', read('stderr'));
    child.once('error', error => { if (!child.pid) child.spawnFailed = true; void finish(error); });
    child.once('exit', () => void finish(new Error('The room server exited before it was ready.')));
    const timer = setTimeout(() => void finish(new Error('The room server did not become ready.')), timeoutMs);
  });
}
module.exports = { waitForRoomReady };
