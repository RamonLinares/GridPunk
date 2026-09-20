import * as THREE from 'three';
import type { TrackBuilder } from '../game/track/TrackBuilder';

/** Small separation keeps the rendered body from z-fighting with the Armco. */
// The visual pose adds up to 0.06 rad of body roll and 0.05 rad of pitch after
// physics collision. Twelve centimetres covers those tilted high points and
// steered front-wheel corners within the audited 0.08 m visible tolerance.
export const BARRIER_CLEARANCE = 0.12;

export interface CarFootprintBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly radius: number;
  /** Convex support envelope around every visible mesh bound. */
  readonly points: readonly THREE.Vector2[];
}

export interface BarrierResolution {
  readonly collided: boolean;
  /** Inward-facing contact normal in world space. */
  readonly normal: THREE.Vector3;
  readonly correctionDistance: number;
}

/**
 * Builds a conservative horizontal convex envelope from the meshes the player
 * actually sees. Per-mesh bounds are transformed into car-local space, so
 * wings, wheels and the nose participate even after static geometry batching.
 */
export function renderedFootprintBounds(root: THREE.Object3D): CarFootprintBounds {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const transform = new THREE.Matrix4();
  const corner = new THREE.Vector3();
  const candidates: THREE.Vector2[] = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const geometry = object.geometry;
    if (!geometry.getAttribute('position')) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) return;
    transform.multiplyMatrices(rootInverse, object.matrixWorld);
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corner.set(x, y, z).applyMatrix4(transform);
          minX = Math.min(minX, corner.x);
          maxX = Math.max(maxX, corner.x);
          minZ = Math.min(minZ, corner.z);
          maxZ = Math.max(maxZ, corner.z);
          candidates.push(new THREE.Vector2(corner.x, corner.z));
        }
      }
    }
  });

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) {
    throw new Error('Car model has no finite visible footprint');
  }
  const points = convexHull(candidates);
  const radius = points.reduce((largest, point) => Math.max(largest, point.length()), 0);
  return { minX, maxX, minZ, maxZ, radius, points };
}

interface Contact {
  depth: number;
  normalX: number;
  normalZ: number;
}

/**
 * Swept convex support envelope against the authored per-station barrier
 * offsets. This stays a
 * custom deterministic constraint because the car already uses authored
 * arcade vehicle physics; introducing a second rigid-body simulation here
 * would change steering and braking feel.
 */
export class CarBarrierResolver {
  private readonly corner = new THREE.Vector3();
  private readonly sweepPosition = new THREE.Vector3();
  private readonly contactNormal = new THREE.Vector3();
  private readonly noNormal = new THREE.Vector3();
  private readonly cache = { index: 0 };

  constructor(
    private readonly builder: TrackBuilder,
    readonly footprint: CarFootprintBounds,
  ) {}

  reset(sampleIndex: number): void {
    this.cache.index = sampleIndex;
  }

  resolve(
    previousPosition: THREE.Vector3,
    previousYaw: number,
    position: THREE.Vector3,
    yaw: number,
  ): BarrierResolution {
    const endContact = this.deepestContact(position, yaw);
    if (!endContact) return { collided: false, normal: this.noNormal.set(0, 0, 0), correctionDistance: 0 };

    // Locate the first overlap along the fixed physics step. Translation is
    // sampled no farther than 0.25 m apart and rotation no farther than 2.5°;
    // a short bisection then places the centre immediately before contact.
    const distance = previousPosition.distanceTo(position);
    const yawDelta = shortestAngle(yaw - previousYaw);
    const samples = Math.max(1, Math.ceil(distance / 0.25), Math.ceil(Math.abs(yawDelta) / (Math.PI / 72)));
    let safeT = 0;
    let hitT = 1;
    let first = endContact;
    const startContact = this.deepestContact(previousPosition, previousYaw);
    if (!startContact) {
      for (let step = 1; step <= samples; step += 1) {
        const t = step / samples;
        this.sweepPosition.copy(previousPosition).lerp(position, t);
        const contact = this.deepestContact(this.sweepPosition, previousYaw + yawDelta * t);
        if (contact) { hitT = t; first = contact; break; }
        safeT = t;
      }
      for (let iteration = 0; iteration < 7; iteration += 1) {
        const t = (safeT + hitT) * 0.5;
        this.sweepPosition.copy(previousPosition).lerp(position, t);
        const contact = this.deepestContact(this.sweepPosition, previousYaw + yawDelta * t);
        if (contact) { hitT = t; first = contact; } else safeT = t;
      }

      this.contactNormal.set(first.normalX, 0, first.normalZ).normalize();
      this.sweepPosition.copy(previousPosition).lerp(position, safeT);
      // Preserve motion along the wall and discard only the untravelled motion
      // that points through it. This retains player steering during a scrape.
      const remainingX = position.x - this.sweepPosition.x;
      const remainingZ = position.z - this.sweepPosition.z;
      const intoWall = remainingX * this.contactNormal.x + remainingZ * this.contactNormal.z;
      position.copy(this.sweepPosition);
      if (intoWall < 0) {
        position.x += remainingX - this.contactNormal.x * intoWall;
        position.z += remainingZ - this.contactNormal.z * intoWall;
      } else {
        position.x += remainingX;
        position.z += remainingZ;
      }
    } else {
      this.contactNormal.set(startContact.normalX, 0, startContact.normalZ).normalize();
    }

    let correctionDistance = 0;
    // Curved Monaco Armco and the escape terminal can impose two constraints
    // at once. Bounded projection passes resolve the envelope at both contacts.
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const contact = this.deepestContact(position, yaw);
      if (!contact) break;
      position.x += contact.normalX * contact.depth;
      position.z += contact.normalZ * contact.depth;
      correctionDistance += contact.depth;
      if (contact.depth > first.depth) {
        this.contactNormal.set(contact.normalX, 0, contact.normalZ).normalize();
        first = contact;
      }
    }
    return { collided: true, normal: this.contactNormal, correctionDistance };
  }

  /** Positive penetration of the conservative visible envelope, for diagnostics. */
  penetration(position: THREE.Vector3, yaw: number): number {
    return this.deepestContact(position, yaw)?.depth ?? 0;
  }

  private deepestContact(position: THREE.Vector3, yaw: number): Contact | undefined {
    const centreProbe = this.builder.spline.probe(position, this.cache);
    const index = centreProbe.sample.index;
    // Prove the whole bounding circle safe against every nearby profile
    // station. Looking only at the centre station is unsound where Monaco's
    // width changes through a bend: the nose may already reach a narrower
    // section even though the centre still has ample clearance.
    const sampleSpacing = this.builder.spline.length / this.builder.spline.count;
    const nearby = Math.ceil(this.footprint.radius / sampleSpacing) + 2;
    let circleSafe = true;
    for (let delta = -nearby; delta <= nearby; delta += 1) {
      const sample = this.builder.spline.sampleAt(index + delta);
      const dx = position.x - sample.position.x;
      const dz = position.z - sample.position.z;
      const centreOffset = dx * sample.right.x + dz * sample.right.z;
      if (
        centreOffset < this.builder.offL[sample.index] + this.footprint.radius + BARRIER_CLEARANCE
        || centreOffset > this.builder.offR[sample.index] - this.footprint.radius - BARRIER_CLEARANCE
      ) {
        circleSafe = false;
        break;
      }
    }
    if (circleSafe) return undefined;

    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let deepest: Contact | undefined;
    for (const point of this.footprint.points) {
        const localX = point.x, localZ = point.y;
        this.corner.set(
          position.x + cos * localX + sin * localZ,
          position.y,
          position.z - sin * localX + cos * localZ,
        );
        const probe = this.builder.spline.probe(this.corner, { index });
        const pointIndex = probe.sample.index;
        const leftLimit = this.builder.offL[pointIndex] + BARRIER_CLEARANCE;
        const rightLimit = this.builder.offR[pointIndex] - BARRIER_CLEARANCE;
        let depth = 0, direction = 0;
        if (probe.signedOffset < leftLimit) {
          depth = leftLimit - probe.signedOffset;
          direction = 1;
        } else if (probe.signedOffset > rightLimit) {
          depth = probe.signedOffset - rightLimit;
          direction = -1;
        }
        if (depth > 0 && (!deepest || depth > deepest.depth)) {
          deepest = {
            depth,
            normalX: probe.sample.right.x * direction,
            normalZ: probe.sample.right.z * direction,
          };
        }
    }
    return deepest;
  }
}

function convexHull(points: THREE.Vector2[]): readonly THREE.Vector2[] {
  const unique = new Map<string, THREE.Vector2>();
  for (const point of points) unique.set(`${point.x.toFixed(6)}:${point.y.toFixed(6)}`, point);
  const sorted = [...unique.values()].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (origin: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  const lower: THREE.Vector2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: THREE.Vector2[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function shortestAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
