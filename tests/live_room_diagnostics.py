"""Verify actual room joins and leaves are visible before the server stops."""
import os,re,socket,subprocess,sys,threading,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]; workspace=root.parent
server=Path(os.environ.get('KARTLINK_ROOM_BIN',root/'resources'/'eden-room.exe'))
probe_dir=workspace/'selevet-research'/'build-kartlink'/'bin'
harness=workspace/'research'/'server-release-review'/'server'/'tests'/'test_remote_room.py'
with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
p=subprocess.Popen([str(server),'-n','KartLink test','-g','Mario Kart World','-s','127.0.0.1','-p',str(port),'-m','16'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',bufsize=1)
ready=threading.Event();events=[]
def read():
 for line in p.stdout:
  if 'Room is open' in line:ready.set()
  match=re.search(r'SendStatusMessage: \[[^\]]*\] (.+?) has (joined|left)\.',line)
  if match:events.append((match.group(1),match.group(2)))
t=threading.Thread(target=read,daemon=True);t.start()
try:
 if not ready.wait(12):raise RuntimeError('Server failed to start')
 probe=subprocess.run([sys.executable,str(harness),'127.0.0.1','--port',str(port),'--bin-dir',str(probe_dir)],timeout=60,capture_output=True,text=True)
 if probe.returncode:raise RuntimeError('Client probe failed: '+probe.stderr[-1000:])
 deadline=time.monotonic()+2
 while time.monotonic()<deadline and len(events)<8:time.sleep(.05)
 if p.poll() is not None:raise RuntimeError('Server stopped prematurely')
 for name in ['KartA','KartB']:
  for event in ['joined','left']:
   if events.count((name,event))<2:raise RuntimeError('Missing live events: '+repr(events))
 print('PASS: two sessions, both clients joined and left; all events received while server was running')
finally:
 if p.poll() is None:
  p.stdin.write('q\n');p.stdin.flush()
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
 t.join(timeout=2)
