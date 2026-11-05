"""Build the unbuffered room entry point against an existing matching Windows room build."""
from pathlib import Path
import argparse, os, re, subprocess

project=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--build-dir',type=Path,default=project.parent/'selevet-research'/'build-kartlink')
parser.add_argument('--vsdevcmd',type=Path,help='Path to Visual Studio VsDevCmd.bat')
args=parser.parse_args();build=args.build_dir.resolve();out=project/'server'/'build';out.mkdir(parents=True,exist_ok=True)
cache=(build/'CMakeCache.txt').read_text(encoding='utf-8',errors='replace')
def cache_value(name):
 match=re.search(r'^'+re.escape(name)+r':[A-Z_]+=(.*)$',cache,re.MULTILINE)
 if not match:raise RuntimeError(f'{name} not found in {build / "CMakeCache.txt"}')
 return match.group(1).strip()
ninja=cache_value('CMAKE_MAKE_PROGRAM');compiler=cache_value('CMAKE_CXX_COMPILER');source_root=Path(cache_value('CMAKE_HOME_DIRECTORY'))/'src'
vs=args.vsdevcmd
if not vs:
 vswhere=Path(os.environ.get('ProgramFiles(x86)',r'C:\Program Files (x86)'))/'Microsoft Visual Studio'/'Installer'/'vswhere.exe'
 install=subprocess.check_output([str(vswhere),'-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],text=True).strip()
 if not install:raise RuntimeError('Visual Studio C++ build tools were not found; specify --vsdevcmd.')
 vs=Path(install)/'Common7'/'Tools'/'VsDevCmd.bat'
raw=subprocess.check_output(f'call "{vs}" -arch=x64 -host_arch=x64 >nul && set',shell=True,text=True,errors='replace')
env=os.environ.copy()
for line in raw.splitlines():
 if '=' in line and not line.startswith('='):
  key,value=line.split('=',1);env[key]=value
obj=out/'standalone.obj'
subprocess.run([compiler,'/nologo','/std:c++20','/O2','/MD','/EHsc',f'/I{source_root}',f'/Fo{obj}','/c',str(project/'server'/'yuzu_room_standalone.cpp')],cwd=build,env=env,check=True)
link=subprocess.check_output([ninja,'-t','commands','eden-room.exe'],cwd=build,text=True,env=env).splitlines()[-1]
replacements={r'--intdir=src\yuzu_room_standalone\CMakeFiles\yuzu_room_standalone.dir':f'--intdir="{out}"',r'src\yuzu_room_standalone\CMakeFiles\yuzu_room_standalone.dir\yuzu_room_standalone.cpp.obj':f'"{obj}"',r'/out:bin\eden-room.exe':f'/out:"{out / "eden-room.exe"}"',r'/implib:src\yuzu_room_standalone\eden-room.a':f'/implib:"{out / "eden-room.a"}"',r'/pdb:bin\eden-room.pdb':''}
for before,after in replacements.items():
 if before not in link:raise RuntimeError(f'The existing room build does not have the expected linker argument: {before}')
 link=link.replace(before,after)
link=link.replace(' /DEBUG ', ' ')
subprocess.run(link,cwd=build,env=env,shell=True,check=True)
print('Built server:',out/'eden-room.exe')
