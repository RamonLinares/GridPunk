import * as THREE from 'three';
import { createNeonRaceBoard } from '../NeonLedSigns';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../Materials';
import type { TrackBuilder } from './TrackBuilder';
export interface TracksideResult {
    group: THREE.Group;
}
function numberTexture(number: number, name: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111418';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(8, 8, 240, 240);
    ctx.fillStyle = '#111418';
    ctx.fillRect(20, 20, 216, 216);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 150px Titillium Web, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), 128, 118);
    ctx.font = '700 30px Titillium Web, Arial, sans-serif';
    ctx.fillStyle = '#f7c948';
    ctx.fillText(name.toUpperCase().slice(0, 12), 128, 216);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}
export function createTrackside(builder: TrackBuilder, materials: MaterialLibrary): TracksideResult {
    const group = new THREE.Group();
    group.name = 'trackside';
    const n = builder.spline.count;
    const MIN = 8.4; // keep props off the racing surface
    // ---------------- Advertising banners on the barriers ----------------
    // Kairo Solar prints its sponsors on fabric; the night circuits run LED boards.
    const daylight = builder.spline.circuitId === 'solar';
    const bannerTexts: [string, string, string, string][] = daylight ? [
        [builder.spline.circuit.shortName.toUpperCase(), '#28332e', '#f3f7ef', 'RACING FOR A BRIGHTER TOMORROW'],
        ['GRIDLINK', '#303a34', '#c6df8b', 'CLEAN ENERGY. HIGHER PERFORMANCE.'],
    ] : [
        [builder.spline.circuit.shortName.toUpperCase(), '#10152b', '#63f8ff', 'RACE THE NIGHT'],
        ['GRIDPUNK', '#20132e', '#ff92cd', 'AFTER DARK'],
    ];
    // One placement schedule per barrier, shared by all five designs. The old
    // per-design loops started at samples 0..4, overlapping 12.5m signs whose
    // same-side centres were only about 8m apart.
    const bannerWidth = 12.5;
    const bannerPitch = 40;
    const boardDesigns = [...bannerTexts, ...bannerTexts];
    const parts: THREE.BufferGeometry[][] = boardDesigns.map(() => []);
    const housings: THREE.BufferGeometry[] = [];
    const panels: {
        side: string;
        start: number;
        end: number;
        pathLength: number;
        design: number;
        width: number;
        maxTurn: number;
    }[] = [];
    for (const side of ['L', 'R'] as const) {
        const offsets = side === 'L' ? builder.offL : builder.offR;
        const sign = side === 'L' ? -1 : 1;
        // Use the actual barrier polyline and height, not terrain height or the
        // centreline tangent. Move in front of the wall and its 0.18m-deep posts.
        const points = builder.spline.samples.map((sample, i) => sample.position.clone().addScaledVector(sample.right, offsets[i] - sign * 0.25));
        points.push(points[0].clone());
        const distances = [0];
        for (let i = 1; i < points.length; i++)
            distances.push(distances[i - 1] + points[i].distanceTo(points[i - 1]));
        const total = distances[n];
        const count = Math.floor(total / bannerPitch);
        const spacing = total / count;
        const pointAt = (distance: number): THREE.Vector3 => {
            let lo = 0, hi = n;
            while (hi - lo > 1) {
                const mid = (lo + hi) >> 1;
                if (distances[mid] <= distance)
                    lo = mid;
                else
                    hi = mid;
            }
            return points[lo].clone().lerp(points[hi], (distance - distances[lo]) / (distances[hi] - distances[lo]));
        };
        for (let j = 0; j < count; j++) {
            const centre = (j + 0.5) * spacing;
            let width = bannerWidth;
            let start = centre - width / 2, end = start + width;
            let knots = [start, ...distances.filter(d => d > start && d < end), end];
            let samples = knots.map(pointAt);
            const maxTurnOf = (points: THREE.Vector3[]) => {
                let maximum = 0;
                for (let k = 1; k + 1 < points.length; k++) {
                    const incoming = points[k].clone().sub(points[k - 1]).normalize();
                    const outgoing = points[k + 1].clone().sub(points[k]).normalize();
                    maximum = Math.max(maximum, incoming.angleTo(outgoing));
                }
                return maximum;
            };
            // Never fold a long wordmark over a sharp inside-wall join. Short panels
            // work on gentle bends; leave the apex's segmented Armco unadvertised.
            if (maxTurnOf(samples) > .22) {
                width = 5;
                start = centre - width / 2;
                end = start + width;
                knots = [start, ...distances.filter(d => d > start && d < end), end];
                samples = knots.map(pointAt);
            }
            const maxTurn = maxTurnOf(samples);
            if (maxTurn > .28)
                continue;
            if (samples.some(p => builder.distanceToTrack(p.x, p.z) < MIN))
                continue;
            const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
            for (let k = 0; k < samples.length; k++) {
                const p = samples[k];
                const along = (knots[k] - start) / width;
                const u = side === 'L' ? along : 1 - along;
                // Sit within the existing barrier face instead of floating above it.
                positions.push(p.x, p.y + 0.04, p.z, p.x, p.y + 0.82, p.z);
                uvs.push(u, 0, u, 1);
                if (k > 0) {
                    const a = (k - 1) * 2, b = k * 2;
                    if (side === 'L')
                        indices.push(a, b, a + 1, b, b + 1, a + 1);
                    else
                        indices.push(a, a + 1, b, b, a + 1, b + 1);
                }
            }
            for (let k = 1; k < samples.length; k++) {
                const a = samples[k - 1], b = samples[k], direction = b.clone().sub(a).normalize();
                const normal = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(side === 'L' ? 1 : -1);
                const up = new THREE.Vector3().crossVectors(normal, direction).normalize();
                const basis = new THREE.Matrix4().makeBasis(direction, up, normal);
                basis.setPosition(a.clone().add(b).multiplyScalar(.5).add(new THREE.Vector3(0, .43, 0)).addScaledVector(normal, -.06));
                housings.push(new THREE.BoxGeometry(a.distanceTo(b), .84, .1).applyMatrix4(basis));
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            const design = (j + (side === 'R' ? 2 : 0)) % bannerTexts.length + (width < 10 ? bannerTexts.length : 0);
            parts[design].push(geometry);
            panels.push({ side, start, end, pathLength: total, design, width, maxTurn });
        }
    }
    group.userData.advertisingPanels = panels;
    boardDesigns.forEach(([text, bg, fg, sub], ti) => {
        if (!parts[ti].length)
            return;
        const geometry = mergeGeometries(parts[ti], false);
        parts[ti].forEach(part => part.dispose());
        if (!geometry)
            return;
        const material = daylight ? printedBanner(text, sub, bg, fg, ti >= bannerTexts.length) : createNeonRaceBoard(text, sub, fg, ti >= bannerTexts.length);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `barrier-advertising-${ti}`;
        group.add(mesh);
        // A separate back-face-only material makes the reverse a plain panel,
        // instead of displaying a mirrored sponsor through a DoubleSide texture.
        const back = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x525a60, roughness: .85, metalness: .15, side: THREE.BackSide }));
        back.name = `barrier-advertising-back-${ti}`;
        group.add(back);
    });
    if (housings.length) {
        const geometry = mergeGeometries(housings, false)!;
        housings.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: daylight ? 0xdde3dc : 0x121c24, roughness: .72, metalness: daylight ? .1 : .45 }));
        mesh.name = daylight ? 'solar-barrier-banner-frames' : 'neon-barrier-led-cabinets';
        group.add(mesh);
    }
    // ---------------- Corner number boards ----------------
    for (const corner of builder.corners) {
        const sample = builder.spline.sampleAt(corner.apexIndex);
        const side = corner.direction === 'left' ? 1 : -1;
        const o = side > 0 ? builder.offR[corner.apexIndex] + 2 : builder.offL[corner.apexIndex] - 2;
        const pos = sample.position.clone().addScaledVector(sample.right, o);
        pos.y = builder.surfaceHeightAt(pos.x, pos.z);
        if (builder.distanceToTrack(pos.x, pos.z) < MIN)
            continue;
        const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: numberTexture(corner.number, corner.name), side: THREE.FrontSide, roughness: 0.7 }));
        const yaw = Math.atan2(sample.tangent.x, sample.tangent.z) + Math.PI;
        board.position.set(pos.x, pos.y + 3.2, pos.z);
        board.rotation.y = yaw;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 0.12), materials.darkMetal);
        frame.position.copy(board.position).addScaledVector(sample.tangent, 0.1);
        frame.rotation.y = yaw;
        group.add(frame, board);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), materials.darkMetal);
        post.position.set(pos.x, pos.y + 1.6, pos.z);
        group.add(post);
    }
    // ---------------- Braking distance markers ----------------
    const brakeGroup = new THREE.Group();
    const brakeTexts = ['150', '100', '50'];
    const brakeMaterials = brakeTexts.map((text) => new THREE.MeshStandardMaterial({ map: brakeTexture(text), side: THREE.FrontSide, roughness: 0.9 }));
    const brakeBoards: THREE.Mesh[] = [];
    for (const corner of builder.corners) {
        if (corner.minRadius > 120)
            continue;
        for (let b = 0; b < brakeTexts.length; b += 1) {
            const backSamples = Math.round(Number(brakeTexts[b]) / (builder.spline.length / n));
            const idx = ((corner.startIndex - backSamples) % n + n) % n;
            const sample = builder.spline.sampleAt(idx);
            const inset = .8;
            const o = corner.direction === 'left' ? builder.offR[idx] - inset : builder.offL[idx] + inset;
            const pos = sample.position.clone().addScaledVector(sample.right, o);
            pos.y = builder.surfaceHeightAt(pos.x, pos.z);
            if (builder.distanceToTrack(pos.x, pos.z) < MIN)
                continue;
            const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6), brakeMaterials[b]);
            board.position.set(pos.x, pos.y + 1.4, pos.z);
            board.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z) + Math.PI;
            brakeBoards.push(board);
        }
        if (brakeBoards.length > 120)
            break;
    }
    brakeGroup.add(...brakeBoards);
    const brakeBackParts = brakeBoards.map(board => { board.updateMatrix(); return board.geometry.clone().applyMatrix4(board.matrix); });
    if (brakeBackParts.length) {
        const backGeometry = mergeGeometries(brakeBackParts, false);
        if (backGeometry)
            brakeGroup.add(new THREE.Mesh(backGeometry, new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: .9, side: THREE.BackSide })));
        brakeBackParts.forEach(part => part.dispose());
    }
    group.add(brakeGroup);
    return { group }; // The city environment owns street fencing and urban props.
}

function brakeTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f7f2';
  ctx.fillRect(0, 0, 128, 160);
  ctx.strokeStyle = '#111418';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 148);
  ctx.fillStyle = '#111418';
  ctx.font = '900 66px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Printed fabric sponsor banner with a leaf mark; matte, never emissive. */
function printedBanner(title: string, subtitle: string, background: string, ink: string, compact: boolean): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = compact ? 512 : 1280;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${compact ? 40 : 46}px Titillium Web, Arial, sans-serif`;
  ctx.fillText(title, canvas.width / 2 + 10, compact ? 40 : 30);
  if (!compact) {
    ctx.font = '700 17px Titillium Web, Arial, sans-serif';
    ctx.fillText(subtitle, canvas.width / 2 + 10, 62);
  }
  const size = compact ? 44 : 50, x = canvas.width / 2 - ctx.measureText(title).width / 2 - (compact ? 60 : 110), y = (canvas.height - size) / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + size);
  ctx.quadraticCurveTo(x, y, x + size, y);
  ctx.quadraticCurveTo(x + size, y + size, x, y + size);
  ctx.fill();
  ctx.strokeStyle = background;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + size * .12, y + size * .88);
  ctx.lineTo(x + size * .7, y + size * .3);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: .8, metalness: 0 });
}
