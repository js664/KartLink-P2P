"""Exercise the bundled room with the existing two-process ENet proxy probe."""
import subprocess
import sys
import threading
from pathlib import Path

project = Path(__file__).resolve().parents[1]
workspace = project.parent
server = project / 'resources' / 'eden-room.exe'
probe_dir = workspace / 'selevet-research' / 'build-kartlink' / 'bin'
harness = workspace / 'research' / 'server-release-review' / 'server' / 'tests' / 'test_remote_room.py'
if not (probe_dir / 'kartlink_proxy_tests.exe').exists() or not harness.exists():
    sys.exit('The workspace proxy probe and test harness are required for this integration test.')
process = subprocess.Popen([str(server), '-n', 'KartLink P2P', '-g', 'Mario Kart World', '-s', '127.0.0.1', '-p', '6009', '-m', '16'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
ready = threading.Event()
lines = []
def read_output():
    for line in process.stdout:
        lines.append(line)
        if 'Room is open' in line:
            ready.set()
threading.Thread(target=read_output, daemon=True).start()
try:
    if not ready.wait(10) or process.poll() is not None:
        sys.exit('Room did not start; is UDP 6009 in use?\n' + ''.join(lines))
    result = subprocess.run([sys.executable, str(harness), '127.0.0.1', '--port', '6009', '--bin-dir', str(probe_dir)], timeout=90)
    sys.exit(result.returncode)
finally:
    process.terminate()
    process.wait(timeout=10)
