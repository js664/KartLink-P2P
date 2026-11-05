"""Create a GPL source snapshot containing the exact KartLink room entry-point change."""
from pathlib import Path
import argparse,zipfile
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--upstream',type=Path,default=root/'release'/'kartlink-eden-room-source.zip');p.add_argument('--output',type=Path,default=root/'release-build'/'kartlink-eden-room-source.zip');args=p.parse_args()
entry='eden-source/src/yuzu_room_standalone/yuzu_room_standalone.cpp';replacement=(root/'server'/'yuzu_room_standalone.cpp').read_bytes();args.output.parent.mkdir(parents=True,exist_ok=True)
if args.output.resolve()==args.upstream.resolve():raise SystemExit('Output must differ from the original source archive.')
with zipfile.ZipFile(args.upstream,'r') as src,zipfile.ZipFile(args.output,'w') as dst:
 if entry not in src.namelist():raise SystemExit('Expected standalone source is not in the original archive.')
 for info in src.infolist():dst.writestr(info,replacement if info.filename==entry else src.read(info.filename))
print('Wrote matching room-server source:',args.output)
