import { isNeonLayout } from './circuits';
import { NEON_TUNNEL } from './NeonProfile';
import { createNeonRaceBoard } from '../NeonLedSigns';
import { createSteamRaceBoard } from '../SteamMaterials';
import * as THREE from 'three';
import type { MaterialLibrary } from '../Materials';
import type { TrackSample, TrackSpline } from './TrackSpline';
import { GroundSurface } from './GroundSurface';
import { createRoadPaint, createRoadStripe } from './RoadMarkings';
const KERB_WIDTH = 1.35;
const KERB_LIFT = 0.075;
function smooth(values: number[], passes: number, keepEdges = false): number[] {
    let out = values.slice();
    const n = values.length;
    for (let p = 0; p < passes; p += 1) {
        const next = out.slice();
        for (let i = 0; i < n; i += 1) {
            if (keepEdges && (i === 0 || i === n - 1))
                continue;
            const a = out[(i - 1 + n) % n];
            const b = out[i];
            const c = out[(i + 1) % n];
            next[i] = (a + b * 2 + c) / 4;
        }
        out = next;
    }
    return out;
}
export interface CornerInfo {
    number: number;
    name: string;
    direction: 'left' | 'right';
    startIndex: number;
    apexIndex: number;
    endIndex: number;
    apexDistance: number;
    minRadius: number;
}
export class TrackBuilder {
    readonly group = new THREE.Group();
    readonly halfWidth: number[] = [];
    readonly offL: number[] = [];
    readonly offR: number[] = [];
    kerbSide: number[] = [];
    readonly corners: CornerInfo[] = [];
    /** Drivable-surface meshes (asphalt, shoulder, gravel, kerbs) for map overlays. */
    readonly surfaceMeshes: THREE.Mesh[] = [];
    /** Base grass ribbon that sits under the track (hidden for terrain-only views). */
    groundMesh!: THREE.Mesh;
    readonly drivingSurface = new GroundSurface();
    readonly boundaryCurve: THREE.CatmullRomCurve3;
    /** Terrain surface height at a world XZ position (matches the built mesh). */
    terrainHeightAt: (x: number, z: number) => number = () => 0;
    private readonly n: number;
    /** Emissive overlay for the five-lamp start bank; its matrices encode current lamps. */
    private startLightGlow?: THREE.InstancedMesh;
    private startLightBank?: THREE.Group;
    constructor(readonly spline: TrackSpline, private readonly materials: MaterialLibrary) {
        this.n = spline.count;
        this.computeProfile();
        this.detectCorners();
        this.buildRoad();
        this.buildKerb();
        this.buildGround();
        for (const mesh of [...this.surfaceMeshes, this.groundMesh])
            this.drivingSurface.add(mesh);
        this.drivingSurface.add(this.group.getObjectByName('terrain') as THREE.Mesh);
        this.buildBarriers();
        this.buildStartFinish();
        this.buildGrid();
        this.buildSectorLines();
        this.boundaryCurve = new THREE.CatmullRomCurve3(spline.samples.map((_, i) => this.edgePoint(i, this.offR[i] + 1.5)), true, 'centripetal', 0.5);
    }
    private computeProfile(): void {
        {
            for (let i = 0; i < this.n; i++) {
                this.halfWidth[i] = 8;
                this.offL[i] = -12;
                this.offR[i] = 12;
            }
            return;
        }
    }
    private detectCorners(): void {
        if (this.spline.circuit.cornerMarkers) {
            this.spline.circuit.cornerMarkers.forEach((marker, index) => {
                const apex = Math.round(marker.progress * this.n) % this.n;
                const sample = this.spline.sampleAt(apex);
                this.corners.push({ number: index + 1, name: marker.name,
                    direction: sample.curvature > 0 ? 'right' : 'left',
                    startIndex: (apex - 5 + this.n) % this.n, apexIndex: apex, endIndex: (apex + 5) % this.n,
                    apexDistance: sample.distance, minRadius: 1 / Math.max(.0001, Math.abs(sample.curvature)) });
            });
            return;
        }
        const curv = smooth(this.spline.samples.map((s) => s.curvature), 3);
        const threshold = 0.0075;
        let inCorner = false;
        let startIdx = 0;
        let peak = 0;
        let peakIdx = 0;
        let sign = 0;
        let num = 0;
        for (let i = 0; i < this.n; i += 1) {
            const c = curv[i];
            if (!inCorner && Math.abs(c) > threshold) {
                inCorner = true;
                startIdx = i;
                peak = Math.abs(c);
                peakIdx = i;
                sign = Math.sign(c);
            }
            else if (inCorner) {
                if (Math.abs(c) > peak) {
                    peak = Math.abs(c);
                    peakIdx = i;
                }
                if (Math.abs(c) < threshold * 0.45) {
                    inCorner = false;
                    num += 1;
                    this.corners.push({
                        number: num,
                        name: `Turn ${num}`,
                        direction: sign > 0 ? 'right' : 'left',
                        startIndex: startIdx,
                        apexIndex: peakIdx,
                        endIndex: i,
                        apexDistance: this.spline.samples[peakIdx].distance,
                        minRadius: 1 / Math.max(0.0001, peak),
                    });
                }
            }
        }
    }
    /**
     * Ground scenery on the same rendered triangles used for tyre contact.
     * The index is populated before scenery is constructed; outside its extent
     * the terrain sampler provides the existing clamped fallback.
     */
    surfaceHeightAt(x: number, z: number, referenceY?: number): number {
        return this.drivingSurface.heightAt(x, z, undefined, this.spline.circuit.gradeSeparated ? referenceY : undefined) ?? this.terrainHeightAt(x, z);
    }
    /** Minimum horizontal distance from a world point to any part of the track. */
    distanceToTrack(x: number, z: number): number {
        let best = Infinity;
        const samples = this.spline.samples;
        for (let i = 0; i < samples.length; i += 2) {
            const p = samples[i].position;
            const dx = x - p.x;
            const dz = z - p.z;
            const d = dx * dx + dz * dz;
            if (d < best)
                best = d;
        }
        return Math.sqrt(best);
    }
    private edgePoint(i: number, offset: number): THREE.Vector3 {
        const s = this.spline.sampleAt(i);
        return s.position.clone().addScaledVector(s.right, offset);
    }
    /** Builds a closed ribbon between two signed lateral offsets. */
    private makeRibbon(offsetA: number[], offsetB: number[], lift: number, material: THREE.Material, metrePerTile: number, flags: {
        doubleSide?: boolean;
        uSpread?: boolean;
    } = {}): THREE.Mesh {
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const ribbonLength = this.spline.samples.reduce((total, sample, i) => total + sample.position.distanceTo(this.spline.sampleAt(i + 1).position), 0);
        // An integer number of repeats makes the two coincident seam rows agree.
        const tileCount = Math.max(1, Math.round(ribbonLength / metrePerTile));
        const tileLength = ribbonLength / tileCount;
        let distance = 0;
        for (let i = 0; i < this.n; i += 1) {
            const s = this.spline.samples[i];
            const a = s.position.clone().addScaledVector(s.right, offsetA[i]).addScaledVector(s.normal, lift);
            const b = s.position.clone().addScaledVector(s.right, offsetB[i]).addScaledVector(s.normal, lift);
            positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
            normals.push(s.normal.x, s.normal.y, s.normal.z, s.normal.x, s.normal.y, s.normal.z);
            const v = distance / tileLength;
            uvs.push(0, v, flags.uSpread ? 1 : 1, v);
            distance += s.position.distanceTo(this.spline.sampleAt(i + 1).position);
        }
        // Keep the closing strip's UV progression local. Reusing the first row
        // interpolated every lap repeat backwards across this single road segment.
        positions.push(...positions.slice(0, 6));
        normals.push(...normals.slice(0, 6));
        uvs.push(0, tileCount, 1, tileCount);
        const count = this.n;
        for (let i = 0; i < count; i += 1) {
            const cur = i * 2;
            const next = (i + 1) * 2;
            indices.push(cur, cur + 1, next, cur + 1, next + 1, next);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;
        if (flags.doubleSide)
            mesh.material = material.clone();
        return mesh;
    }
    /** Builds a vertical wall ribbon along an offset, between two heights. */
    private makeWall(offset: number[], material: THREE.Material, y0: number, y1: number, metrePerTile: number): THREE.Mesh {
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let distance = 0;
        for (let i = 0; i < this.n; i += 1) {
            const s = this.spline.samples[i];
            const base = s.position.clone().addScaledVector(s.right, offset[i]);
            positions.push(base.x, base.y + y0, base.z, base.x, base.y + y1, base.z);
            normals.push(s.right.x, 0, s.right.z, s.right.x, 0, s.right.z);
            const v = distance / metrePerTile;
            uvs.push(v, 0, v, 1);
            distance += s.position.distanceTo(this.spline.sampleAt(i + 1).position);
        }
        for (let i = 0; i < this.n; i += 1) {
            const cur = i * 2;
            const next = ((i + 1) % this.n) * 2;
            indices.push(cur, cur + 1, next, cur + 1, next + 1, next);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;
        mesh.material.side = THREE.DoubleSide;
        return mesh;
    }
    private buildRoad(): void {
        const left = this.halfWidth.map(w => -w);
        const right = this.halfWidth.slice();
        const road = this.makeRibbon(left, right, 0.04, this.materials.asphalt, 22);
        road.name = 'road';
        if (isNeonLayout(this.spline.circuitId)) {
            // A baked ambient-occlusion term under concrete decks prevents the sky
            // fill from illuminating the enclosed road as if it were in open air.
            const colors: number[] = [];
            for (let i = 0; i <= this.n; i++) {
                const p = (i % this.n) / this.n;
                const tunnel = ([NEON_TUNNEL]).find(b => p >= b.start && p <= b.end);
                const occlusion = tunnel ? 1 - .63 * THREE.MathUtils.smoothstep(Math.min(p - tunnel.start, tunnel.end - p) * this.spline.length, 0, 12) : 1;
                for (let side = 0; side < 2; side++)
                    colors.push(occlusion, occlusion, occlusion);
            }
            road.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            this.materials.asphalt.vertexColors = true;
        }
        if (this.spline.circuitId === 'neon') {
            const dry = this.materials.asphalt.clone();
            dry.name = 'neon-dry-tunnel-asphalt';
            dry.roughness = 1;
            dry.roughnessMap = null;
            dry.metalness = 0;
            dry.envMapIntensity = 0;
            dry.normalScale.set(.055, .055);
            const first = Math.ceil(NEON_TUNNEL.start * this.n), last = Math.floor(NEON_TUNNEL.end * this.n);
            road.material = [this.materials.asphalt, dry];
            road.geometry.clearGroups();
            road.geometry.addGroup(0, first * 6, 0);
            road.geometry.addGroup(first * 6, (last - first) * 6, 1);
            road.geometry.addGroup(last * 6, (this.n - last) * 6, 0);
        }
        road.receiveShadow = true;
        this.group.add(road);
        this.surfaceMeshes.push(road);
        this.buildRacingWear(road);
        this.buildSurfaceHistory(road);
        // Soft asphalt shoulder either side of the painted line.
        const shoulderInner = this.halfWidth.map(w => -(w + 0.5));
        const shoulderInnerR = this.halfWidth.map(w => w + 0.5);
        const shoulder = this.makeRibbon(shoulderInner, shoulderInnerR, -0.02, this.materials.runoffAsphalt, 10);
        shoulder.name = 'shoulder';
        shoulder.renderOrder = -1;
        this.group.add(shoulder);
        this.surfaceMeshes.push(shoulder);
    }
    /**
     * A visual-only tyre deposit follows the corner apex and heavy braking zones.
     * It reads the already-built road vertices for its height, is deliberately
     * broken up along straights, and is never registered with drivingSurface.
     */
    private buildRacingWear(road: THREE.Mesh): void {
        const samples = this.spline.samples;
        const spacing = this.spline.length / this.n;
        const curvature = smooth(samples.map((sample) => sample.curvature), 5);
        const braking = new Float32Array(this.n);
        const brakingSign = new Float32Array(this.n);
        // Work backwards from each detected apex. Tighter corners leave a broader,
        // darker approach zone; this uses only existing static track information.
        for (const corner of this.corners) {
            const sign = Math.sign(curvature[corner.apexIndex]) || 1;
            const approachMetres = THREE.MathUtils.clamp(62 + (130 - corner.minRadius) * 0.32, 62, 106);
            const steps = Math.ceil(approachMetres / spacing);
            for (let step = 0; step <= steps; step += 1) {
                const index = (corner.startIndex - step + this.n) % this.n;
                const amount = Math.pow(1 - step / (steps + 1), 1.35);
                if (amount > braking[index]) {
                    braking[index] = amount;
                    brakingSign[index] = sign;
                }
            }
        }
        const lineOffset: number[] = [];
        const lineWear: number[] = [];
        for (let i = 0; i < this.n; i += 1) {
            const cornerAmount = THREE.MathUtils.clamp((Math.abs(curvature[i]) - 0.0035) * 42, 0, 1);
            const brakeAmount = braking[i];
            const turnSign = Math.sign(curvature[i]) || brakingSign[i] || 1;
            // On entry the line is outside; through the curve it tightens toward the
            // inside. Smoothing below removes any sampled zig-zag from this intent.
            lineOffset[i] = brakeAmount > cornerAmount
                ? -brakingSign[i] * (0.7 + brakeAmount * 2.1)
                : turnSign * (0.35 + cornerAmount * 2.45);
            lineWear[i] = Math.max(cornerAmount * 0.76, brakeAmount * 0.64);
        }
        const smoothedOffset = smooth(lineOffset, 6);
        const roadPositions = road.geometry.getAttribute('position') as THREE.BufferAttribute;
        const positions: number[] = [];
        const normals: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];
        const point = new THREE.Vector3();
        const edgeA = new THREE.Vector3();
        const edgeB = new THREE.Vector3();
        const addPoint = (sampleIndex: number, offset: number, alpha: number): void => {
            // makeRibbon writes edge A at -ROAD_HALF_WIDTH then edge B at
            // +ROAD_HALF_WIDTH, so this signed-offset interpolation matches the
            // visible asphalt vertex order exactly.
            const w = this.halfWidth[((sampleIndex % this.n) + this.n) % this.n];
            const t = THREE.MathUtils.clamp((offset + w) / (w * 2), 0, 1);
            edgeA.fromBufferAttribute(roadPositions, sampleIndex * 2);
            edgeB.fromBufferAttribute(roadPositions, sampleIndex * 2 + 1);
            point.lerpVectors(edgeA, edgeB, t).addScaledVector(samples[sampleIndex].normal, 0.018);
            positions.push(point.x, point.y, point.z);
            normals.push(samples[sampleIndex].normal.x, samples[sampleIndex].normal.y, samples[sampleIndex].normal.z);
            // Three r184 enables USE_COLOR_ALPHA for itemSize=4. Keep RGB neutral
            // and let alpha feather the dark rubber material into the asphalt.
            colors.push(1, 1, 1, alpha);
        };
        // Four nested strips use zero-alpha outer vertices and a low-alpha centre.
        // The result feathers into asphalt without a pale colour fringe or a
        // continuous painted-black stripe.
        for (let i = 0; i < this.n; i += 1) {
            const next = (i + 1) % this.n;
            const wear = (lineWear[i] + lineWear[next]) * 0.5;
            const segmentNoise = 0.64 + Math.sin((i + 19) * 12.9898) * 0.18 + Math.sin((i + 7) * 3.731) * 0.11;
            const intensity = wear * segmentNoise;
            if (intensity < 0.16 || (intensity < 0.42 && ((i * 17) % 11 === 0)))
                continue;
            const width = 0.64 + intensity * 0.98;
            const offsets = [-width, -width * 0.48, width * 0.48, width];
            // With material opacity 0.76 this yields a 9–18% centre deposit.
            const innerAlpha = (0.12 + intensity * 0.12) * (1);
            const alpha = [0, innerAlpha * 0.44, innerAlpha, 0];
            const start = positions.length / 3;
            for (let strip = 0; strip < offsets.length; strip += 1)
                addPoint(i, smoothedOffset[i] + offsets[strip], alpha[strip]);
            for (let strip = 0; strip < offsets.length; strip += 1)
                addPoint(next, smoothedOffset[next] + offsets[strip], alpha[strip]);
            for (let strip = 0; strip < offsets.length - 1; strip += 1) {
                const a = start + strip;
                const b = start + strip + 1;
                const c = start + offsets.length + strip;
                const d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        const material = new THREE.MeshStandardMaterial({
            color: 0x202224,
            vertexColors: true,
            roughness: 0.48,
            metalness: 0,
            transparent: true,
            opacity: 0.76,
            depthWrite: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
        });
        const wear = new THREE.Mesh(geometry, material);
        wear.name = 'curvature-and-braking-rubber-wear';
        wear.renderOrder = 1; // DrivingGuide remains at render order 3 above this.
        wear.castShadow = false;
        wear.receiveShadow = false;
        this.group.add(wear);
    }
    /**
     * Sparse authored track history for the visible racing line. These overlays
     * are visual only: they are deliberately kept out of surfaceMeshes and the
     * GroundSurface sampler so collision and driving-guide behaviour cannot drift.
     */
    private buildSurfaceHistory(road: THREE.Mesh): void {
        const samples = this.spline.samples;
        const spacing = this.spline.length / this.n;
        const roadPositions = road.geometry.getAttribute('position') as THREE.BufferAttribute;
        const point = new THREE.Vector3();
        const edgeA = new THREE.Vector3();
        const edgeB = new THREE.Vector3();
        const nearestIndex = (x: number, z: number): number => {
            let best = 0;
            let bestDistance = Infinity;
            for (let i = 0; i < this.n; i += 1) {
                const sample = samples[i];
                const dx = x - sample.position.x;
                const dz = z - sample.position.z;
                const distance = dx * dx + dz * dz;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = i;
                }
            }
            return best;
        };
        // Surveyed road-side anchors resolve to the nearest generated centreline
        // sample, so the marks remain on the actual road after spline resampling.
        const zones = [
            { name: 'T1', index: nearestIndex(-336, 536), seed: 17 },
            { name: 'T10', index: nearestIndex(183, -438), seed: 31 },
            { name: 'T12', index: nearestIndex(-104, -595), seed: 53 },
        ];
        const addRoadPoint = (sampleIndex: number, offset: number, lift = 0.026): void => {
            const index = ((sampleIndex % this.n) + this.n) % this.n;
            const w = this.halfWidth[index];
            const t = THREE.MathUtils.clamp((offset + w) / (w * 2), 0, 1);
            edgeA.fromBufferAttribute(roadPositions, index * 2);
            edgeB.fromBufferAttribute(roadPositions, index * 2 + 1);
            point.lerpVectors(edgeA, edgeB, t).addScaledVector(samples[index].normal, lift);
        };
        const repairPositions: number[] = [];
        const repairNormals: number[] = [];
        const repairColors: number[] = [];
        const repairIndices: number[] = [];
        const addRepair = (zoneIndex: number, along: number, lateral: number, length: number, width: number, seed: number): void => {
            const ring = [
                [-0.52, -0.18], [-0.17, -0.56], [0.44, -0.46], [0.56, 0.13], [0.19, 0.56], [-0.42, 0.43],
            ];
            const start = repairPositions.length / 3;
            addRoadPoint(zoneIndex + Math.round(along / spacing), lateral, 0.029);
            repairPositions.push(point.x, point.y, point.z);
            repairNormals.push(samples[((zoneIndex + Math.round(along / spacing)) % this.n + this.n) % this.n].normal.x, samples[((zoneIndex + Math.round(along / spacing)) % this.n + this.n) % this.n].normal.y, samples[((zoneIndex + Math.round(along / spacing)) % this.n + this.n) % this.n].normal.z);
            repairColors.push(1, 1, 1, 0.31);
            for (let i = 0; i < ring.length; i += 1) {
                const wobble = 0.86 + Math.sin(seed * 4.17 + i * 2.31) * 0.09;
                const alongOffset = ring[i][0] * length * wobble;
                const lateralOffset = ring[i][1] * width * (0.92 + Math.cos(seed * 2.7 + i) * 0.07);
                const sampleIndex = zoneIndex + Math.round((along + alongOffset) / spacing);
                addRoadPoint(sampleIndex, lateral + lateralOffset, 0.029);
                const normal = samples[((sampleIndex % this.n) + this.n) % this.n].normal;
                repairPositions.push(point.x, point.y, point.z);
                repairNormals.push(normal.x, normal.y, normal.z);
                // The ring boundary is fully transparent so each irregular patch
                // dissolves into the asphalt without a polygon seam.
                repairColors.push(1, 1, 1, 0);
            }
            for (let i = 0; i < ring.length; i += 1) {
                const next = (i + 1) % ring.length;
                repairIndices.push(start, start + 1 + i, start + 1 + next);
            }
        };
        // Two broken patches at T1 and one pair through the stadium's T10–13
        // braking sequence. Their offsets stay comfortably inside ±7m asphalt.
        addRepair(zones[0].index, -30, -2.8, 9, 2.0, zones[0].seed);
        addRepair(zones[0].index, -8, 2.0, 6, 1.5, zones[0].seed + 3);
        addRepair(zones[1].index, -28, -2.6, 8, 1.9, zones[1].seed);
        addRepair(zones[1].index, -9, 1.9, 5, 1.4, zones[1].seed + 3);
        addRepair(zones[2].index, -26, 2.4, 8, 1.8, zones[2].seed);
        addRepair(zones[2].index, -7, -1.8, 5, 1.3, zones[2].seed + 3);
        const repairGeometry = new THREE.BufferGeometry();
        repairGeometry.setAttribute('position', new THREE.Float32BufferAttribute(repairPositions, 3));
        repairGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(repairNormals, 3));
        repairGeometry.setAttribute('color', new THREE.Float32BufferAttribute(repairColors, 4));
        repairGeometry.setIndex(repairIndices);
        repairGeometry.computeBoundingSphere();
        const repairMaterial = this.materials.runoffAsphalt.clone();
        // This geometry intentionally has no UVs. Keep the authored repair tone
        // stable instead of sampling the shared asphalt texture at (0, 0).
        repairMaterial.map = null;
        repairMaterial.normalMap = null;
        repairMaterial.roughnessMap = null;
        repairMaterial.vertexColors = true;
        repairMaterial.transparent = true;
        repairMaterial.opacity = 0.40;
        repairMaterial.depthWrite = false;
        repairMaterial.side = THREE.DoubleSide;
        repairMaterial.forceSinglePass = true;
        repairMaterial.polygonOffset = true;
        repairMaterial.polygonOffsetFactor = -3;
        repairMaterial.polygonOffsetUnits = -3;
        const repairs = new THREE.Mesh(repairGeometry, repairMaterial);
        repairs.name = 'surface-history-repairs';
        repairs.renderOrder = 1;
        repairs.castShadow = false;
        repairs.receiveShadow = false;
        this.group.add(repairs);
        const scuffPositions: number[] = [];
        const scuffNormals: number[] = [];
        const scuffColors: number[] = [];
        const scuffIndices: number[] = [];
        const addScuff = (zoneIndex: number, lateral: number, length: number, width: number, seed: number): void => {
            const start = scuffPositions.length / 3;
            // Follow the generated ribbon at roughly one row per road sample. A
            // three-row strip over a braking zone becomes a straight chord through
            // a corner, which can float above or cut below the actual asphalt.
            const rowCount = Math.max(3, Math.ceil(length / spacing) + 1);
            for (let row = 0; row < rowCount; row += 1) {
                const progress = row / (rowCount - 1);
                const along = -42 + progress * length;
                const sampleIndex = zoneIndex + Math.round(along / spacing);
                const bend = Math.sin(seed * 1.7 + row * 1.9) * 0.055 + Math.sin(seed + row * 0.63) * 0.025;
                const halfWidth = width * 0.5;
                const longitudinalFade = THREE.MathUtils.smoothstep(progress, 0, 0.16)
                    * (1 - THREE.MathUtils.smoothstep(progress, 0.82, 1));
                const brokenDeposit = THREE.MathUtils.clamp(0.68 + Math.sin(seed * 1.93 + row * 1.71) * 0.19 + Math.sin(seed * 0.47 + row * 0.73) * 0.1, 0.30, 1);
                const coreAlpha = 0.30 * longitudinalFade * brokenDeposit;
                // The outer columns are zero-alpha feather vertices. Keeping a real
                // center column makes each deposit read as a narrow tyre trace while
                // allowing the sides to dissolve without a rectangular edge.
                for (const [side, alpha] of [[-1, 0], [0, coreAlpha], [1, 0]] as const) {
                    const offset = lateral + side * halfWidth + bend;
                    addRoadPoint(sampleIndex, offset, 0.034);
                    const normal = samples[((sampleIndex % this.n) + this.n) % this.n].normal;
                    scuffPositions.push(point.x, point.y, point.z);
                    scuffNormals.push(normal.x, normal.y, normal.z);
                    scuffColors.push(1, 1, 1, alpha);
                }
            }
            for (let row = 0; row < rowCount - 1; row += 1) {
                const a = start + row * 3;
                const b = a + 3;
                // Two narrow quads per sample interval, with zero-alpha side columns.
                scuffIndices.push(a, b, a + 1, a + 1, b, b + 1);
                scuffIndices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
            }
        };
        // Paired dark deposits point down the approach, with broken ends and a
        // small lateral wobble so they read as tyre history rather than paint.
        for (const zone of zones) {
            addScuff(zone.index, -0.85, 36, 0.40, zone.seed);
            addScuff(zone.index, 0.85, 31, 0.38, zone.seed + 5);
        }
        const scuffGeometry = new THREE.BufferGeometry();
        scuffGeometry.setAttribute('position', new THREE.Float32BufferAttribute(scuffPositions, 3));
        scuffGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(scuffNormals, 3));
        scuffGeometry.setAttribute('color', new THREE.Float32BufferAttribute(scuffColors, 4));
        scuffGeometry.setIndex(scuffIndices);
        scuffGeometry.computeBoundingSphere();
        const scuffMaterial = this.materials.rubber.clone();
        scuffMaterial.vertexColors = true;
        scuffMaterial.transparent = true;
        scuffMaterial.opacity = 0.68;
        scuffMaterial.depthWrite = false;
        scuffMaterial.side = THREE.DoubleSide;
        scuffMaterial.forceSinglePass = true;
        scuffMaterial.polygonOffset = true;
        scuffMaterial.polygonOffsetFactor = -4;
        scuffMaterial.polygonOffsetUnits = -4;
        const scuffs = new THREE.Mesh(scuffGeometry, scuffMaterial);
        scuffs.name = 'surface-history-braking-scuffs';
        scuffs.renderOrder = 1;
        scuffs.castShadow = false;
        scuffs.receiveShadow = false;
        this.group.add(scuffs);
    }
    private buildKerb(): void {
        const curv = smooth(this.spline.samples.map((s) => s.curvature), 3);
        const threshold = 0.006;
        this.kerbSide = new Array(this.n).fill(0);
        for (let i = 0; i < this.n; i += 1) {
            if (Math.abs(curv[i]) > threshold)
                this.kerbSide[i] = curv[i] > 0 ? 1 : -1;
        }
        // Also add a kerb on the outside of the fastest corners.
        const runs: {
            side: number;
            start: number;
            end: number;
        }[] = [];
        let i = 0;
        while (i < this.n) {
            const side = this.kerbSide[i];
            if (side === 0) {
                i += 1;
                continue;
            }
            let j = i;
            while (j < this.n && this.kerbSide[j] === side)
                j += 1;
            runs.push({ side, start: i, end: j });
            i = j;
        }
        const material = this.materials.kerb;
        for (const run of runs) {
            const len = run.end - run.start;
            if (len < 4)
                continue;
            const offsetA: number[] = [];
            const offsetB: number[] = [];
            for (let k = run.start; k < run.end; k += 1) {
                const w = this.halfWidth[k];
                const kerbWidth = KERB_WIDTH;
                const base = run.side * (w - .05);
                const outer = run.side * (w + kerbWidth);
                offsetA.push(base);
                offsetB.push(outer);
            }
            // Build a temporary sub-ribbon that spans the run only.
            const positions: number[] = [];
            const normals: number[] = [];
            const uvs: number[] = [];
            const indices: number[] = [];
            let distance = 0;
            const local = offsetA.length;
            for (let k = 0; k < local; k += 1) {
                const idx = run.start + k;
                const s = this.spline.sampleAt(idx);
                const a = s.position.clone().addScaledVector(s.right, offsetA[k]).addScaledVector(s.normal, KERB_LIFT);
                const b = s.position.clone().addScaledVector(s.right, offsetB[k]).addScaledVector(s.normal, KERB_LIFT);
                positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
                normals.push(s.normal.x, s.normal.y, s.normal.z, s.normal.x, s.normal.y, s.normal.z);
                uvs.push(0, distance / 12, 1, distance / 12);
                distance += s.position.distanceTo(this.spline.sampleAt(idx + 1).position);
            }
            const top = local * 2;
            for (let k = 0; k < local - 1; k += 1) {
                const cur = k * 2;
                const next = (k + 1) * 2;
                indices.push(cur, cur + 1, next, cur + 1, next + 1, next);
            }
            // Outer chamfer edge sloping back down to the verge.
            const chamferStart = top;
            for (let k = 0; k < local; k += 1) {
                const idx = run.start + k;
                const s = this.spline.sampleAt(idx);
                const outer = offsetB[k];
                const inner = outer + Math.sign(outer) * 0.35;
                const topPt = s.position.clone().addScaledVector(s.right, outer).addScaledVector(s.normal, KERB_LIFT);
                const grassPt = s.position.clone().addScaledVector(s.right, inner).addScaledVector(s.normal, -0.06);
                positions.push(topPt.x, topPt.y, topPt.z, grassPt.x, grassPt.y, grassPt.z);
                normals.push(s.normal.x, s.normal.y, s.normal.z, s.normal.x, s.normal.y, s.normal.z);
                uvs.push(0, 0, 1, 0);
            }
            for (let k = 0; k < local - 1; k += 1) {
                const cur = chamferStart + k * 2;
                const next = chamferStart + (k + 1) * 2;
                indices.push(cur, cur + 1, next, cur + 1, next + 1, next);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            const mesh = new THREE.Mesh(geo, material);
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            this.group.add(mesh);
            this.surfaceMeshes.push(mesh);
        }
    }
    private buildGround(): void {
        {
            const apron = this.makeRibbon(this.offL, this.offR, -.045, this.materials.runoffAsphalt, 12);
            apron.name = 'ground';
            apron.receiveShadow = true;
            this.group.add(apron);
            this.groundMesh = apron;
            const terrain = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), this.materials.runoffAsphalt);
            terrain.rotation.x = -Math.PI / 2;
            terrain.position.y = -.06;
            terrain.name = 'terrain';
            terrain.receiveShadow = true;
            this.group.add(terrain);
            this.terrainHeightAt = () => -.06;
            return;
        }
    }
    private buildBarriers(): void {
        {
            // Closed concrete walls, including the rear face and cap. Fence feet
            // sit on these caps; road-side collision uses the same inner offsets.
            // Embed the bottom below the lowered verge and its sloping earth bank.
            for (const [side, offsets] of [[-1, this.offL], [1, this.offR]] as const) {
                const rear = offsets.map(o => o + side * .42);
                for (const [name, edge] of [['front', offsets], ['rear', rear]] as const) {
                    const face = this.makeWall(edge, this.materials.barrier, -.55, 1.05, 4);
                    face.name = `${this.spline.circuitId}-concrete-${side}-${name}`;
                    face.castShadow = true;
                    face.receiveShadow = true;
                    this.group.add(face);
                }
                const cap = this.makeRibbon(side < 0 ? rear : offsets, side < 0 ? offsets : rear, 0, this.materials.barrier, 4);
                cap.geometry.translate(0, 1.05, 0);
                cap.name = `${this.spline.circuitId}-wall-cap-${side}`;
                cap.receiveShadow = true;
                this.group.add(cap);
            }
            return;
        }
    }
    private buildStartFinish(): void {
        const startIndex = Math.round((this.spline.circuit.gridStartFraction ?? 0) * this.n);
        const startSample = this.spline.sampleAt(startIndex);
        const group = new THREE.Group();
        // Checkered start/finish line.
        const checker = this.makeCheckerTexture();
        checker.repeat.set(1, 1);
        const lineMat = createRoadPaint(this.materials.paintWhite);
        lineMat.map = checker;
        const line = this.makeQuadAcross(this.spline.sampleAt(0), 1.4, lineMat);
        line.name = 'start-finish-line';
        group.add(line);
        // Start/finish gantry.
        const gantryMaterial = this.materials.darkMetal;
        const startHalfWidth = this.halfWidth[startIndex];
        const beamLength = startHalfWidth * 2 + 4;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(beamLength, 0.5, 0.5), gantryMaterial);
        const up = new THREE.Vector3(0, 1, 0);
        const across = startSample.right.clone();
        const leftBase = startSample.position.clone().addScaledVector(across, -(startHalfWidth + 1.8));
        const rightBase = startSample.position.clone().addScaledVector(across, startHalfWidth + 1.8);
        const midBase = leftBase.clone().add(rightBase).multiplyScalar(0.5);
        beam.position.copy(midBase).addScaledVector(up, 6.2);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), across.clone().normalize());
        group.add(beam);
        // Only the two road-facing sign faces receive the canvas artwork. BoxGeometry
        // orders materials as ±X, ±Y, +Z, −Z, keeping the narrow edge faces solid
        // dark metal instead of stretching the lettering around the gantry.
        const bannerFace = this.spline.circuit.stage !== 'cyberpunk' ? createSteamRaceBoard(this.spline.circuit.shortName, this.spline.circuit.stage === 'solarpunk')
            : createNeonRaceBoard('START / FINISH', `${this.spline.circuit.shortName.toUpperCase()} / RACE CONTROL`, '#80e9ff');
        const banner = new THREE.Mesh(new THREE.BoxGeometry(beamLength * 0.92, 1.6, .28), [gantryMaterial, gantryMaterial, gantryMaterial, gantryMaterial, bannerFace, bannerFace]);
        banner.name = 'start-finish-banner-face-only';
        banner.position.copy(midBase).addScaledVector(up, 5.2);
        banner.quaternion.copy(beam.quaternion);
        group.add(banner);
        for (const base of [leftBase, rightBase]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 0.5), gantryMaterial);
            post.position.copy(base).addScaledVector(up, 3.2);
            post.castShadow = true;
            group.add(post);
        }
        // One centred F1-style bank reads as race control from the grid. Static dark
        // lenses and a preallocated emissive overlay share two materials; updates
        // change only five matrices, avoiding material churn during the countdown.
        const lightBank = new THREE.Group();
        lightBank.name = 'start-light-bank';
        lightBank.position.copy(midBase).addScaledVector(up, 6.72);
        lightBank.quaternion.copy(beam.quaternion);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(4.72, 0.98, 0.42), gantryMaterial);
        housing.name = 'start-light-bank-housing';
        housing.castShadow = true;
        lightBank.add(housing);
        const lensGeometry = new THREE.SphereGeometry(0.27, 12, 8);
        const idleLens = new THREE.MeshStandardMaterial({ color: 0x270609, roughness: 0.38, metalness: 0.18 });
        const activeLens = new THREE.MeshStandardMaterial({
            color: 0xff2525, emissive: 0xee0505, emissiveIntensity: 2.45, roughness: 0.25, metalness: 0.08,
        });
        const lenses = new THREE.InstancedMesh(lensGeometry, idleLens, 5);
        lenses.name = 'start-light-idle-lenses';
        const glow = new THREE.InstancedMesh(lensGeometry, activeLens, 5);
        glow.name = 'start-light-glow-instances';
        glow.frustumCulled = false;
        const idleMatrix = new THREE.Matrix4();
        const glowMatrix = new THREE.Matrix4();
        for (let i = 0; i < 5; i += 1) {
            const x = (i - 2) * 0.78;
            // beam local +Z resolves to −tangent (the incoming grid/camera side),
            // so the glow sits 2cm in front of the unlit lens without coplanar z-fight.
            idleMatrix.compose(new THREE.Vector3(x, 0, 0.27), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
            glowMatrix.compose(new THREE.Vector3(x, 0, 0.29), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
            lenses.setMatrixAt(i, idleMatrix);
            glow.setMatrixAt(i, glowMatrix);
        }
        lenses.instanceMatrix.needsUpdate = true;
        glow.instanceMatrix.needsUpdate = true;
        // All five glow lenses are allocated once; only the visible count changes.
        glow.count = 0;
        lightBank.userData.litCount = 0;
        lightBank.add(lenses, glow);
        group.add(lightBank);
        this.startLightGlow = glow;
        this.startLightBank = lightBank;
        group.name = 'start-finish';
        this.group.add(group);
    }
    /**
     * Mirrors Hud.updateStartLights: countdown is seconds remaining (4 → 0),
     * and every lamp extinguishes at LIGHTS OUT. Call once per rendered frame.
     */
    updateStartLights(countdown: number, started: boolean): void {
        if (!this.startLightGlow || !this.startLightBank)
            return;
        const running = !started && Number.isFinite(countdown) && countdown > 0;
        const elapsed = 4 - Math.min(4, Math.max(0, countdown));
        const litCount = running ? Math.min(5, Math.max(1, Math.ceil(elapsed * 1.25))) : 0;
        // `count` draws the first N prebuilt glow lenses, with no matrix rewrite
        // or allocation during the countdown. The bank retains inspectable state.
        if (this.startLightGlow.count !== litCount)
            this.startLightGlow.count = litCount;
        this.startLightBank.userData.litCount = litCount;
        this.startLightBank.userData.running = running;
    }
    private makeQuadAcross(sample: TrackSample, width: number, material: THREE.Material): THREE.Mesh {
        const road = this.group.getObjectByName('road') as THREE.Mesh;
        const mesh = new THREE.Mesh(createRoadStripe(road.geometry, sample, width), material);
        mesh.receiveShadow = true;
        return mesh;
    }
    private makeCheckerTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('no ctx');
        const cols = 32;
        const rows = 4;
        const cw = canvas.width / cols;
        const ch = canvas.height / rows;
        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
                ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f4f0' : '#1b1d20';
                ctx.fillRect(x * cw, y * ch, cw, ch);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    /**
     * Starting-grid slot: sample index + lateral offset. Shared by the painted
     * grid markings and by car placement so the field lines up on the boxes.
     * Slot 0 is pole.
     */
    gridSlot(slot: number): {
        index: number;
        lateral: number;
    } {
        const side = slot % 2 === 0 ? -1 : 1;
        const distanceBehind = 24 + slot * 4 - (this.spline.circuit.gridStartFraction ?? 0) * this.spline.length;
        const index = Math.round((((this.n - (distanceBehind / this.spline.length) * this.n) % this.n) + this.n) % this.n);
        return { index, lateral: side * 2.6 };
    }
    private buildGrid(): void {
        const group = new THREE.Group();
        group.name = 'grid';
        const positions: number[] = [];
        const indices: number[] = [];
        const bar = (sample: TrackSample, lateral: number, along: number, width: number, depth: number) => {
            const base = sample.position.clone().addScaledVector(sample.right, lateral).addScaledVector(sample.tangent, along).addScaledVector(sample.normal, 0.061);
            const start = positions.length / 3;
            for (const [x, z] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [-width / 2, depth / 2], [width / 2, depth / 2]]) {
                const p = base.clone().addScaledVector(sample.right, x).addScaledVector(sample.tangent, z);
                positions.push(p.x, p.y, p.z);
            }
            indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
        };
        for (let slot = 0; slot < 20; slot += 1) {
            const { index, lateral } = this.gridSlot(slot);
            const sample = this.spline.sampleAt(index);
            bar(sample, lateral, 2.3, 2.3, 0.12);
            bar(sample, lateral - 1.1, 1.6, 0.12, 1.4);
            bar(sample, lateral + 1.1, 1.6, 0.12, 1.4);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        const paint = new THREE.Mesh(geo, createRoadPaint(this.materials.paintWhite));
        paint.receiveShadow = true;
        group.add(paint);
        this.group.add(group);
    }
    private buildSectorLines(): void {
        const fractions = this.spline.circuit.sectorFractions;
        const paint = createRoadPaint(this.materials.paintYellow);
        for (const fraction of fractions) {
            const index = Math.floor(fraction * this.n);
            const sample = this.spline.sampleAt(index);
            const line = this.makeQuadAcross(sample, 0.5, paint);
            line.name = `sector-line-${fractions.indexOf(fraction) + 1}`;
            this.group.add(line);
        }
    }
}
