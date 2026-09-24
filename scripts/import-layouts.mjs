// Imports additional circuit layouts from the owner's montmelo-circuit project.
// Surveyed centrelines keep their elevation (rebased so the control line is at
// 0 m); the plan alone is rescaled so GridPunk's closed centripetal spline keeps
// each lap length in 3D. Output carries fictional layout IDs only.
//   node scripts/import-layouts.mjs [path-to-montmelo-circuit]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as THREE from 'three';

const source = process.argv[2] ?? '/Users/ramonlinarespallares/Documents/montmelo/montmelo-circuit';
const track = `${source}/src/game/track`;
const read = file => readFile(`${track}/${file}`, 'utf8');
const triples = text => [...text.matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)].map(m => [+m[1], +m[2], +m[3]]);
const block = (text, name) => {
  const start = text.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const open = text.indexOf('= [', start) + 2;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return text.slice(open, i + 1);
  }
  throw new Error(`${name} unterminated`);
};
const progresses = (text, name) => [...block(text, name).matchAll(/"?progress"?\s*:\s*(-?[\d.]+)/g)].map(m => +m[1]);

// Fictional IDs → source files. Lengths are the source's timing lengths.
const layouts = [
  { id: 'sable', file: 'centerlineData.ts', points: 'TRACK_POINTS', length: 4657, sectors: [.336, .678] },
  { id: 'talon', file: 'spaData.ts', points: 'SPA_POINTS', corners: 'SPA_CORNERS', length: 7004, sectorsFrom: 'SPA_SECTOR_FRACTIONS' },
  { id: 'mirage', file: 'monacoData.ts', points: 'MONACO_POINTS', corners: 'MONACO_CORNERS', length: 3337, sectorsFrom: 'MONACO_SECTOR_FRACTIONS', refine: 'MonacoCenterline.ts' },
  { id: 'orbit', file: 'madringData.ts', points: 'MADRING_POINTS', corners: 'MADRING_CORNERS', length: 5414, sectors: [1526 / 5414, 3575 / 5414] },
  { id: 'zenith', file: 'cotaData.ts', points: 'COTA_POINTS', corners: 'COTA_CORNERS', length: 5513, sectorsFrom: 'COTA_SECTORS', grid: 'COTA_STANDING_START' },
  { id: 'cinder', file: 'lagunaSecaData.ts', points: 'LAGUNA_POINTS', corners: 'LAGUNA_CORNERS', length: 3602, sectorsFrom: 'LAGUNA_SECTORS' },
];

const splineLength = points => {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal', .5);
  curve.arcLengthDivisions = 4000;
  return { curve, length: curve.getLength() };
};

const out = {}, maps = {};
for (const layout of layouts) {
  const text = await read(layout.file);
  let points = triples(block(text, layout.points));
  if (layout.refine) {
    const omit = new Set(triples((await read(layout.refine)).split('export const MONACO_CENTRELINE_REFINEMENTS')[1].split('] as const')[0]).map(p => p.join(',')));
    points = points.filter(p => !omit.has(p.join(',')));
  }
  const base = points[0][1];
  const rebased = points.map(([x, y, z]) => [x, y - base, z]);
  // Scale the plan only, iterating because the climb does not scale with it.
  let scale = 1;
  for (let k = 0; k < 6; k++) scale *= layout.length / splineLength(rebased.map(([x, y, z]) => [x * scale, y, z * scale])).length;
  const scaled = rebased.map(([x, y, z]) => [+(x * scale).toFixed(3), +y.toFixed(3), +(z * scale).toFixed(3)]);
  const { curve, length } = splineLength(scaled);
  const heights = scaled.map(p => p[1]);
  const sectors = layout.sectors ?? (() => { const m = text.match(new RegExp(`${layout.sectorsFrom}\\s*=\\s*\\[([^\\]]+)\\]`)); return m[1].split(',').map(v => +eval(v)); })();
  const corners = layout.corners ? progresses(text, layout.corners) : undefined;
  const grid = layout.grid ? +text.match(new RegExp(`${layout.grid}[\\s\\S]*?progress:\\s*([\\d.]+)`))[1] : undefined;

  // Where the road passes close to another part of itself, the city needs care.
  const spaced = curve.getSpacedPoints(Math.round(length / 4)); spaced.pop();
  let closest = { d: Infinity };
  for (let i = 0; i < spaced.length; i += 2) for (let j = i + 2; j < spaced.length; j += 2) {
    const along = Math.min(j - i, spaced.length - (j - i)) * length / spaced.length;
    if (along < 250) continue;
    const d = Math.hypot(spaced[i].x - spaced[j].x, spaced[i].z - spaced[j].z);
    if (d < closest.d) closest = { d, a: i / spaced.length, b: j / spaced.length };
  }
  console.log(`${layout.id}: ${points.length} controls, scale ${scale.toFixed(6)}, lap ${length.toFixed(1)} m, climb ${Math.min(...heights).toFixed(1)}..${Math.max(...heights).toFixed(1)} m, ${corners?.length ?? 'auto'} corners, closest approach ${closest.d.toFixed(1)} m at ${closest.a?.toFixed(3)} / ${closest.b?.toFixed(3)}`);
  out[layout.id] = { points: scaled, sectors: [sectors[0], sectors.length > 2 ? sectors[0] + sectors[1] : sectors[1]], corners, grid, closest: +closest.d.toFixed(1) };
  maps[layout.id] = curve.getSpacedPoints(Math.round(length / 4)).map(p => [p.x, p.z]);
}

const lines = [
  '// Generated by scripts/import-layouts.mjs from the owner’s montmelo-circuit project.',
  '// Horizontal plans: © OpenStreetMap contributors (ODbL); see public/credits.html.',
  '// Surveyed elevation is kept (control line at 0 m); plans are rescaled to keep each 3D lap length.',
  '// Layout names are fictional; progress values are normalized [0, 1).',
  '',
  'export interface ImportedLayout {',
  '  readonly points: readonly (readonly [number, number, number])[];',
  '  readonly sectors: readonly [number, number];',
  '  readonly corners?: readonly number[];',
  '  readonly grid?: number;',
  '}',
  '',
  'export const IMPORTED_LAYOUTS = {',
];
for (const [id, data] of Object.entries(out)) {
  lines.push(`  ${id}: {`);
  lines.push(`    sectors: [${data.sectors.map(v => +v.toFixed(9)).join(', ')}],`);
  if (data.corners) lines.push(`    corners: [${data.corners.map(v => +v.toFixed(6)).join(', ')}],`);
  if (data.grid !== undefined) lines.push(`    grid: ${data.grid},`);
  lines.push('    points: [');
  for (let i = 0; i < data.points.length; i += 4) lines.push('      ' + data.points.slice(i, i + 4).map(([x, y, z]) => `[${x}, ${y}, ${z}]`).join(', ') + ',');
  lines.push('    ],');
  lines.push('  },');
}
lines.push('} satisfies Record<string, ImportedLayout>;', '');
await writeFile('src/game/track/importedLayouts.ts', lines.join('\n'));

// Menu outlines: merge into the capture set that build-selection-maps.mjs reads.
await mkdir('artifacts/menu-source', { recursive: true });
let existing = {};
try { existing = JSON.parse(await readFile('artifacts/menu-source/maps.json', 'utf8')); } catch { /* first run */ }
await writeFile('artifacts/menu-source/maps.json', JSON.stringify({ ...existing, ...maps }));
