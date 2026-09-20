import * as THREE from 'three';
import { CIRCUITS, type CircuitDefinition } from './circuits';
export interface TrackSample {
    readonly index: number;
    readonly position: THREE.Vector3;
    readonly tangent: THREE.Vector3;
    readonly normal: THREE.Vector3;
    readonly right: THREE.Vector3;
    readonly curvature: number;
    readonly distance: number;
}
export interface SurfaceProbe {
    inside: boolean;
    signedOffset: number;
    lateralDist: number;
    height: number;
    segmentT: number;
    normal: THREE.Vector3;
    sample: TrackSample;
}
const SAMPLE_SPACING = 4;
/**
 * Resamples the authored Neon centerline into a smooth, evenly spaced closed loop and
 * exposes geometric queries used for road construction, physics and timing.
 */
export class TrackSpline {
    readonly samples: TrackSample[] = [];
    readonly length: number;
    private readonly curve: THREE.CatmullRomCurve3;
    get circuitId() { return this.circuit.id; }
    constructor(readonly circuit: CircuitDefinition = CIRCUITS.neon) {
        const pts = circuit.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
        this.curve.arcLengthDivisions = 4000;
        const approxLength = this.curve.getLength();
        const count = Math.max(64, Math.round(approxLength / SAMPLE_SPACING));
        this.length = approxLength;
        const points = this.curve.getSpacedPoints(count);
        points.pop();
        if (circuit.surfaceLiftAt)
            points.forEach((p, i) => { p.y += circuit.surfaceLiftAt!(i / count); });
        for (let i = 0; i < count; i += 1) {
            const position = points[i];
            const next = points[(i + 1) % count];
            const prev = points[(i - 1 + count) % count];
            const tangent = next.clone().sub(prev).normalize();
            // Remove any vertical component from the horizontal frame calculation.
            const flat = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
            const right = new THREE.Vector3().crossVectors(flat, new THREE.Vector3(0, 1, 0)).normalize();
            const normal = new THREE.Vector3().crossVectors(right, tangent).normalize();
            if (normal.y < 0)
                normal.negate();
            const bank = circuit.bankingAt?.(i / count) ?? 0;
            right.applyAxisAngle(tangent, bank);
            normal.applyAxisAngle(tangent, bank);
            this.samples.push({
                index: i,
                position,
                tangent,
                normal,
                right,
                curvature: 0,
                distance: (i / count) * approxLength,
            });
        }
        // Signed horizontal curvature using the yaw change per metre.
        for (let i = 0; i < count; i += 1) {
            const prev = this.samples[(i - 1 + count) % count];
            const curr = this.samples[i];
            const next = this.samples[(i + 1) % count];
            const d1 = Math.atan2(curr.position.x - prev.position.x, curr.position.z - prev.position.z);
            const d2 = Math.atan2(next.position.x - curr.position.x, next.position.z - curr.position.z);
            let delta = d2 - d1;
            while (delta > Math.PI)
                delta -= Math.PI * 2;
            while (delta < -Math.PI)
                delta += Math.PI * 2;
            const ds = curr.position.distanceTo(next.position) || SAMPLE_SPACING;
            // Positive bends toward sample.right; negative bends toward its left.
            (this.samples[i] as {
                curvature: number;
            }).curvature = -delta / ds;
        }
    }
    get count(): number {
        return this.samples.length;
    }
    sampleAt(index: number): TrackSample {
        const n = this.samples.length;
        return this.samples[((index % n) + n) % n];
    }
    /** Nearest sample to a world point using a persistent cached start index. */
    nearestSample(point: THREE.Vector3, cache: {
        index: number;
    }): TrackSample {
        const n = this.samples.length;
        let bestIndex = cache.index;
        let bestDist = Infinity;
        let bestHorizontal = Infinity;
        const consider = (idx: number) => {
            const s = this.samples[idx];
            const dx = point.x - s.position.x;
            const dz = point.z - s.position.z;
            const horizontal = dx * dx + dz * dz;
            const d = horizontal + (0);
            if (d < bestDist) {
                bestDist = d;
                bestHorizontal = horizontal;
                bestIndex = idx;
            }
        };
        const window = 60;
        for (let offset = -window; offset <= window; offset += 1) {
            const idx = ((cache.index + offset) % n + n) % n;
            consider(idx);
        }
        if (bestHorizontal > 400 * 400) {
            bestDist = Infinity;
            for (let i = 0; i < n; i += 1)
                consider(i);
        }
        cache.index = bestIndex;
        return this.samples[bestIndex];
    }
    progressAt(point: THREE.Vector3, cache: {
        index: number;
    }): number {
        const probe = this.probe(point, cache);
        const a = probe.sample;
        let progress = a.distance + probe.segmentT * this.length / this.count;
        const n = this.length;
        progress = ((progress % n) + n) % n;
        return progress;
    }
    probe(point: THREE.Vector3, cache: {
        index: number;
    }): SurfaceProbe {
        const n = this.samples.length;
        let bestIndex = cache.index;
        let bestDist = Infinity;
        let bestT = 0;
        const consider = (idx: number) => {
            const a = this.samples[idx].position;
            const b = this.sampleAt(idx + 1).position;
            const dx = b.x - a.x, dz = b.z - a.z;
            const t = THREE.MathUtils.clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / Math.max(1e-8, dx * dx + dz * dz), 0, 1);
            const horizontal = (point.x - a.x - dx * t) ** 2 + (point.z - a.z - dz * t) ** 2;
            const d = horizontal + (0);
            if (d < bestDist) {
                bestDist = d;
                bestIndex = idx;
                bestT = t;
            }
        };
        // Search segments, not vertices: choosing the nearest vertex and only its
        // following segment used to snap the car uphill/downhill halfway between samples.
        for (let offset = -40; offset <= 40; offset += 1) {
            const idx = ((cache.index + offset) % n + n) % n;
            consider(idx);
        }
        cache.index = bestIndex;
        const a = this.samples[bestIndex];
        const b = this.sampleAt(bestIndex + 1);
        const surfacePos = a.position.clone().lerp(b.position, bestT);
        const surfaceNormal = a.normal.clone().lerp(b.normal, bestT).normalize();
        const right = a.right.clone().lerp(b.right, bestT).normalize();
        const side = ((point.x - surfacePos.x) * right.x + (point.z - surfacePos.z) * right.z) / Math.max(.5, right.x * right.x + right.z * right.z);
        return {
            inside: Math.abs(side) <= 0,
            signedOffset: side,
            lateralDist: Math.abs(side),
            height: surfacePos.y + right.y * side,
            segmentT: bestT,
            normal: surfaceNormal,
            sample: a,
        };
    }
}
