// Bake actual sampled race centrelines into small SVG paths for the boot menu.
// Source points are captured by capture-selection-art.mjs; no track code runs in the menu.
import { readFile, writeFile } from 'node:fs/promises';
const tracks = JSON.parse(await readFile('artifacts/menu-source/maps.json', 'utf8'));
const maps = {};
function simplify(points, epsilon) {
  const first = points[0], last = points.at(-1);
  const dx = last[0] - first[0], dy = last[1] - first[1], length = dx*dx + dy*dy;
  let max = 0, index = 0;
  for (let i=1; i<points.length-1; i++) {
    const p = points[i], t = length ? Math.max(0,Math.min(1,((p[0]-first[0])*dx+(p[1]-first[1])*dy)/length)) : 0;
    const d = Math.hypot(p[0]-first[0]-t*dx,p[1]-first[1]-t*dy);
    if (d>max) { max=d; index=i; }
  }
  return max>epsilon ? [...simplify(points.slice(0,index+1),epsilon).slice(0,-1),...simplify(points.slice(index),epsilon)] : [first,last];
}
for (const [id, points] of Object.entries(tracks)) {
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const minX=Math.min(...xs), minY=Math.min(...ys), w=Math.max(...xs)-minX, h=Math.max(...ys)-minY;
  const scale=Math.min(242/w,142/h);
  const projected=points.map(([x,y])=>[(280-w*scale)/2+(x-minX)*scale,(180-h*scale)/2+(y-minY)*scale]);
  const reduced=simplify([...projected,projected[0]],.42);
  maps[id]={path:reduced.map((p,i)=>`${i?'L':'M'}${p.map(v=>Number(v.toFixed(1))).join(' ')}`).join('')+'Z', start:projected[0].map(v=>Number(v.toFixed(1)))};
}
await writeFile('src/game/track/selectionMaps.ts', '// Generated from the actual track splines by scripts/build-selection-maps.mjs.\nexport const SELECTION_MAPS = '+JSON.stringify(maps,null,2)+' as const;\n');
