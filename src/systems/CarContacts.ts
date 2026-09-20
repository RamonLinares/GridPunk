/** Planar arcade contacts; wheel/surface suspension remains owned by Car. */
export interface ContactBody {
  position: { x: number; y?: number; z: number };
  velocity: { x: number; z: number };
  yaw: number;
  applyWorldImpulse(x: number, z: number): void;
}

const HALF_SEGMENT = 1.9;
const DIAMETER = 2.5;
const SLOP = .0005;
export interface CapsuleContact { penetration: number; nx: number; nz: number }
export type ContactConstraint = (
  bodyIndex: number,
  previousX: number,
  previousZ: number,
  previousYaw: number,
) => void;

/** Closest points on two continuous centre segments, expanded by tyre width. */
export function capsuleContact(a: ContactBody, b: ContactBody): CapsuleContact {
  const ax = a.position.x - Math.sin(a.yaw) * HALF_SEGMENT;
  const az = a.position.z - Math.cos(a.yaw) * HALF_SEGMENT;
  const bx = b.position.x - Math.sin(b.yaw) * HALF_SEGMENT;
  const bz = b.position.z - Math.cos(b.yaw) * HALF_SEGMENT;
  const ux = Math.sin(a.yaw) * HALF_SEGMENT * 2, uz = Math.cos(a.yaw) * HALF_SEGMENT * 2;
  const vx = Math.sin(b.yaw) * HALF_SEGMENT * 2, vz = Math.cos(b.yaw) * HALF_SEGMENT * 2;
  const rx = ax - bx, rz = az - bz;
  const aa = ux * ux + uz * uz, bb = ux * vx + uz * vz, ee = vx * vx + vz * vz;
  const cc = ux * rx + uz * rz, ff = vx * rx + vz * rz;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const denominator = aa * ee - bb * bb;
  let s = denominator > 1e-8 ? clamp((bb * ff - cc * ee) / denominator) : 0;
  let t = (bb * s + ff) / ee;
  if (t < 0) { t = 0; s = clamp(-cc / aa); }
  else if (t > 1) { t = 1; s = clamp((bb - cc) / aa); }
  const dx = bx + vx * t - ax - ux * s, dz = bz + vz * t - az - uz * s;
  const distance = Math.hypot(dx, dz);
  let nx = dx / distance, nz = dz / distance;
  if (distance < 1e-8) {
    const lateral = (b.position.x - a.position.x) * Math.cos(a.yaw) - (b.position.z - a.position.z) * Math.sin(a.yaw);
    const sign = lateral < 0 ? -1 : 1;
    nx = Math.cos(a.yaw) * sign; nz = -Math.sin(a.yaw) * sign;
  }
  return { penetration: DIAMETER - distance, nx, nz };
}

export class CarContacts {
  private active = new Set<number>();
  playerEvents = 0;
  playerContactSeconds = 0;
  playerResolutions = 0;
  maxResidualPenetration = 0;

  reset(): void {
    this.active.clear(); this.playerEvents = 0; this.playerContactSeconds = 0;
    this.playerResolutions = 0; this.maxResidualPenetration = 0;
  }

  resolve(bodies: readonly ContactBody[], dt: number, layered = false, constrain?: ContactConstraint): number {
    const touched = new Set<number>();
    let maxPlayerImpulse = 0;
    // Revisit every pair after neighbouring contacts move it. Six small cars
    // need only 15 pairs per pass, avoiding unresolved three-wide squeezes.
    for (let pass = 0; pass < 8; pass++) {
      let maxDepth = 0;
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (layered && Math.abs((a.position.y ?? 0) - (b.position.y ?? 0)) > 2.5) continue;
        if (Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) > 6.5) continue;
        const { penetration, nx, nz } = capsuleContact(a, b);
        if (penetration <= SLOP) continue;
        const key = i * bodies.length + j;
        touched.add(key); maxDepth = Math.max(maxDepth, penetration);
        const previousAX = a.position.x, previousAZ = a.position.z, previousAYaw = a.yaw;
        const previousBX = b.position.x, previousBZ = b.position.z, previousBYaw = b.yaw;
        const correction = (penetration + SLOP) * .5;
        a.position.x -= nx * correction; a.position.z -= nz * correction;
        b.position.x += nx * correction; b.position.z += nz * correction;
        const closing = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz;
        if (closing < 0) {
          // Nearly inelastic at low speed; a small rebound only on a real hit.
          const restitution = closing < -3 ? .08 : 0;
          const impulse = -closing * (1 + restitution) * .5;
          a.applyWorldImpulse(-nx * impulse, -nz * impulse);
          b.applyWorldImpulse(nx * impulse, nz * impulse);
          if (i === 0) maxPlayerImpulse = Math.max(maxPlayerImpulse, impulse);
        }
        // Pair separation can push a car through a track wall after its own
        // vehicle step has already resolved barriers. Alternate the two
        // constraints inside the bounded solver so neither one wins merely by
        // running last. Only the moved pair is revisited.
        constrain?.(i, previousAX, previousAZ, previousAYaw);
        constrain?.(j, previousBX, previousBZ, previousBYaw);
      }
      if (maxDepth < .002) break;
    }
    const next = new Set<number>();
    let playerTouching = false, residual = 0;
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const key = i * bodies.length + j;
      if (layered && Math.abs((bodies[i].position.y ?? 0) - (bodies[j].position.y ?? 0)) > 2.5) continue;
      const contact = capsuleContact(bodies[i], bodies[j]);
      residual = Math.max(residual, contact.penetration);
      // Keep one contact episode alive through tiny solver separations.
      if (touched.has(key) || (this.active.has(key) && contact.penetration > -.08)) {
        next.add(key);
        if (i === 0) {
          if (!this.active.has(key)) this.playerEvents++;
          playerTouching = true;
        }
      }
      if (i === 0 && touched.has(key)) this.playerResolutions++;
    }
    if (playerTouching) this.playerContactSeconds += dt;
    this.maxResidualPenetration = residual;
    this.active = next;
    return maxPlayerImpulse;
  }
}
