import * as THREE from 'three';
import type { TrackBuilder } from '../game/track/TrackBuilder';
import { type CarModel } from './CarModel';
import { createNeonCarModel } from './NeonCarModel';
import { createShinseiCarModel } from './ShinseiCarModel';
import type { NeonVehicle } from './NeonVehicleChoice';
import { VehiclePhysics, type SurfaceInfo, type VehicleInput } from '../systems/VehiclePhysics';
import { CarBarrierResolver, renderedFootprintBounds } from '../systems/CarBarrierCollision';
import { wantsStraightLineAero } from '../systems/ArcadeAero';
export const ROAD_HALF_WIDTH = 7.0;
const KERB_WIDTH = 1.35;
interface TyreProfile {
    /** Local wheel-axis coordinate after CarModel rotates the LatheGeometry. */
    readonly axial: number;
    /** Radius of this exterior lathe-profile ring. */
    readonly radius: number;
}
interface WheelMount {
    readonly wheel: THREE.Group;
    readonly mount: THREE.Vector3;
    /** Full rendered mesh positions, retained only for discontinuity fallback. */
    readonly points: Float32Array;
    /** Unique exterior rings of the rendered tyre, extracted once at construction. */
    readonly profiles: readonly TyreProfile[];
    /** The source LatheGeometry's radial tessellation, retained for exact support vertices. */
    readonly radialStep: number;
    readonly radialPhase: number;
    /** Bounding radius of the complete rendered tyre, used for conservative patch selection. */
    readonly footprintRadius: number;
    height: number;
}
/**
 * The tyre is a surface of revolution whose axis is local +X after its model
 * rotation. Collapsing equal-axis vertices into their largest radius preserves
 * every exterior profile break while discarding the 40 angular tessellation.
 */
function tyreProfiles(points: Float32Array): {
    profiles: readonly TyreProfile[];
    radialStep: number;
    radialPhase: number;
    footprintRadius: number;
} {
    const rings = new Map<string, {
        axial: number;
        radius: number;
        angles: number[];
    }>();
    for (let i = 0; i < points.length; i += 3) {
        const axial = points[i];
        const radius = Math.hypot(points[i + 1], points[i + 2]);
        // Lathe vertices repeat the seam, so a quantised axis key deliberately
        // folds that duplicate together without changing the authored profile.
        const key = axial.toFixed(6);
        const existing = rings.get(key);
        const angle = Math.atan2(points[i + 2], points[i + 1]);
        if (!existing || radius > existing.radius + 1e-6)
            rings.set(key, { axial, radius, angles: [angle] });
        else if (Math.abs(radius - existing.radius) <= 1e-6)
            existing.angles.push(angle);
    }
    const exterior = [...rings.values()].sort((a, b) => a.axial - b.axial);
    const profiles = exterior.map(({ axial, radius }) => ({ axial, radius }));
    const reference = exterior.reduce((best, ring) => ring.angles.length > best.angles.length ? ring : best, exterior[0]);
    // LatheGeometry has one duplicated seam vertex, hence n - 1 unique steps.
    const segments = Math.max(3, reference.angles.length - 1);
    let footprintRadius = 0;
    for (let i = 0; i < points.length; i += 3)
        footprintRadius = Math.max(footprintRadius, Math.hypot(points[i], points[i + 1], points[i + 2]));
    return { profiles, radialStep: Math.PI * 2 / segments, radialPhase: reference.angles[0], footprintRadius };
}
export interface CarUpdateResult {
    collided: boolean;
    collisionImpulse: number;
    surface: SurfaceInfo;
}
export class Car {
    readonly physics = new VehiclePhysics();
    readonly model: CarModel;
    readonly group: THREE.Group;
    private readonly probeCache = { index: 0 };
    private readonly halfWidth: number[];
    private readonly kerbSide: number[];
    private readonly forward = new THREE.Vector3();
    private readonly right = new THREE.Vector3();
    private readonly up = new THREE.Vector3(0, 1, 0);
    private readonly heading = new THREE.Vector3();
    private readonly baseMatrix = new THREE.Matrix4();
    private readonly rollQuat = new THREE.Quaternion();
    private readonly baseQuat = new THREE.Quaternion();
    private readonly wheelMounts: WheelMount[];
    private readonly wheelCenter = new THREE.Vector3();
    private readonly tyrePoint = new THREE.Vector3();
    private readonly wheelOrientation = new THREE.Quaternion();
    private readonly worldVertical = new THREE.Vector3();
    private readonly wheelAxis = new THREE.Vector3();
    private readonly tyreRadial = new THREE.Vector3();
    private readonly supportVector = new THREE.Vector3();
    private readonly localTyreDirection = new THREE.Vector3();
    private readonly inverseWheelOrientation = new THREE.Quaternion();
    private readonly planeNormal = new THREE.Vector3();
    private readonly barrierResolver: CarBarrierResolver;
    private readonly previousPhysicsPosition = new THREE.Vector3();
    private straightLineAero = 0;
    private suspension = 0;
    private displayTimer = 0;
    private surface: SurfaceInfo = { mu: 1.55, rolling: 0.014, drag: 0, rumble: 0 };
    private lastSurface: SurfaceInfo = this.surface;
    constructor(private readonly builder: TrackBuilder, livery: {
        primary?: number;
        secondary?: number;
        number?: number;
        accent?: number;
    } = {}, neonVehicle: NeonVehicle = 'k89') {
        this.halfWidth = builder.halfWidth;
        this.kerbSide = builder.kerbSide;
        this.model =
            neonVehicle === 'shinsei' ? createShinseiCarModel() : createNeonCarModel(livery);
        this.group = this.model.group;
        this.barrierResolver = new CarBarrierResolver(builder, renderedFootprintBounds(this.group));
        this.wheelMounts = Object.values(this.model.wheels).map((wheel) => {
            const points = wheel.userData.contactPoints as Float32Array;
            const profile = tyreProfiles(points);
            return { wheel, mount: wheel.position.clone(), points, ...profile, height: 0 };
        });
    }
    resetAt(startIndex: number, lateral: number): void {
        const sample = this.builder.spline.samples[startIndex];
        const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
        const pos = sample.position.clone().addScaledVector(sample.right, lateral);
        this.physics.reset(pos, yaw);
        this.accumulator = 0;
        this.suspension = 0;
        this.straightLineAero = 0;
        this.surface = this.sampleSurface(lateral, startIndex);
        for (const wheel of Object.values(this.model.wheels)) {
            (wheel.userData.spin as THREE.Object3D).rotation.x = 0;
        }
        this.probeCache.index = startIndex;
        this.barrierResolver.reset(startIndex);
        this.updateVisual(0);
    }
    private accumulator = 0;
    update(dt: number, input: VehicleInput, syncVisual = true): CarUpdateResult {
        // Fixed-timestep accumulator keeps the car's motion tied to real time even if
        // the frame rate dips; capped so a long stall cannot spiral.
        const fixed = 1 / 120;
        this.accumulator = Math.min(this.accumulator + Math.max(0, dt), 0.25);
        let collided = false;
        let impulse = 0;
        let iterations = 0;
        while (this.accumulator >= fixed && iterations < 30) {
            const probe = this.builder.spline.probe(this.physics.position, this.probeCache);
            this.surface = this.sampleSurface(probe.signedOffset, probe.sample.index);
            this.previousPhysicsPosition.copy(this.physics.position);
            const previousYaw = this.physics.yaw;
            this.physics.step(fixed, input, this.surface);
            const hit = this.resolveBarriers(this.previousPhysicsPosition, previousYaw);
            collided = collided || hit.collided;
            impulse = Math.max(impulse, hit.impulse);
            this.accumulator -= fixed;
            iterations += 1;
        }
        if (syncVisual)
            this.updateVisual(dt);
        return { collided, collisionImpulse: impulse, surface: this.surface };
    }
    private sampleSurface(offset: number, index: number): SurfaceInfo {
        const abs = Math.abs(offset);
        const road = this.halfWidth[index];
        if (abs <= road) {
            // Slightly less grip off the racing line and on painted edges.
            return { mu: 1.58, rolling: 0.013, drag: 0, rumble: 0 };
        }
        const kerb = this.kerbSide[index];
        const onKerbSide = kerb !== 0 && Math.sign(offset) === kerb;
        const kerbWidth = KERB_WIDTH;
        if (onKerbSide && abs <= road + kerbWidth) {
            return { mu: 1.18, rolling: 0.02, drag: 0.05, rumble: 0.5 };
        }
        if (abs <= road + KERB_WIDTH + 2.5) {
            return { mu: 0.72, rolling: 0.06, drag: 0.35, rumble: 0.85 };
        }
        // Gravel / dirt far off the track.
        return { mu: 0.5, rolling: 0.11, drag: 0.8, rumble: 1.2 };
    }
    private resolveBarriers(previousPosition: THREE.Vector3, previousYaw: number): {
        collided: boolean;
        impulse: number;
    } {
        const hit = this.barrierResolver.resolve(previousPosition, previousYaw, this.physics.position, this.physics.yaw);
        if (!hit.collided)
            return { collided: false, impulse: 0 };
        this.forward.set(Math.sin(this.physics.yaw), 0, Math.cos(this.physics.yaw));
        this.right.set(Math.cos(this.physics.yaw), 0, -Math.sin(this.physics.yaw));
        const vn = this.physics.velocity.dot(hit.normal);
        if (vn < 0) {
            const restitution = 0.18;
            this.physics.velocity.addScaledVector(hit.normal, -(1 + restitution) * vn);
            // Scrub tangential speed and add a small yaw kick.
            this.physics.velocity.multiplyScalar(0.9);
            const side = Math.sign(hit.normal.dot(this.right));
            this.physics.omega += side * 0.35 * Math.min(1, Math.abs(vn) / 12);
        }
        // Re-project velocity back into the body frame.
        this.physics.vLong = this.physics.velocity.dot(this.forward);
        this.physics.vLat = this.physics.velocity.dot(this.right);
        this.physics.vLat *= 0.6;
        return { collided: true, impulse: Math.abs(vn) };
    }
    /** Re-apply wall constraints after an external solver translates the car. */
    reconcileBarrier(previousX: number, previousZ: number, previousYaw = this.physics.yaw): CarUpdateResult {
        this.previousPhysicsPosition.set(previousX, this.physics.position.y, previousZ);
        const hit = this.resolveBarriers(this.previousPhysicsPosition, previousYaw);
        return { collided: hit.collided, collisionImpulse: hit.impulse, surface: this.surface };
    }
    /** Also called after collision separation, before cameras and rendering. */
    syncVisual(dt = 0): void {
        this.updateVisual(dt);
    }
    private updateVisual(dt: number): void {
        const p = this.physics.position;
        const probe = this.builder.spline.probe(p, this.probeCache);
        const sample = probe.sample;
        // Orient the car to its ACTUAL physics heading (so it points where it is
        // really going, including slides), tilted onto the track-surface normal.
        const yaw = this.physics.yaw;
        const sin = Math.sin(yaw), cos = Math.cos(yaw);
        // Fit the chassis to all four contact patches, using the same triangles the
        // player sees. Centreline height omits the road lift, kerbs and lower verges.
        for (const contact of this.wheelMounts) {
            const { mount } = contact;
            contact.height = this.builder.drivingSurface.heightAt(p.x + cos * mount.x + sin * mount.z, p.z - sin * mount.x + cos * mount.z, undefined, undefined) ?? probe.height;
        }
        const [fl, fr, rl, rr] = this.wheelMounts;
        const groundY = (fl.height + fr.height + rl.height + rr.height) / 4;
        this.physics.position.y = groundY;
        const forwardSlope = ((fl.height + fr.height) - (rl.height + rr.height)) / (2 * (fl.mount.z - rl.mount.z));
        const rightSlope = ((fr.height + rr.height) - (fl.height + rl.height)) / ((fr.mount.x - fl.mount.x) + (rr.mount.x - rl.mount.x));
        this.forward.set(sin, forwardSlope, cos).normalize();
        this.right.set(cos, rightSlope, -sin).normalize();
        this.up.crossVectors(this.forward, this.right).normalize();
        this.right.crossVectors(this.up, this.forward).normalize();
        this.heading.crossVectors(this.right, this.up).normalize();
        this.baseMatrix.makeBasis(this.right, this.up, this.heading);
        this.baseQuat.setFromRotationMatrix(this.baseMatrix);
        // Guard against a degenerate surface normal producing a NaN basis (which
        // would make the car's matrix non-finite and blow the frame out).
        if (!Number.isFinite(this.baseQuat.x) || !Number.isFinite(this.baseQuat.y) ||
            !Number.isFinite(this.baseQuat.z) || !Number.isFinite(this.baseQuat.w)) {
            this.baseQuat.identity();
        }
        // Body roll and pitch from accelerations, plus suspension compression.
        const roll = THREE.MathUtils.clamp(-this.physics.telemetry.lateralG * 0.012, -0.06, 0.06);
        const pitch = THREE.MathUtils.clamp(-this.physics.telemetry.longitudinalG * 0.01, -0.05, 0.05);
        this.rollQuat.setFromEuler(new THREE.Euler(pitch, 0, roll));
        this.group.quaternion.copy(this.baseQuat).multiply(this.rollQuat);
        this.suspension += ((this.surface.rumble * 0.03 + Math.abs(this.physics.telemetry.longitudinalG) * 0.005) - this.suspension) * Math.min(1, dt * 6);
        const bob = Math.sin(this.physics.wheelSpinAngle * 0.5) * this.surface.rumble * 0.012;
        this.group.position.set(p.x, groundY + this.suspension * 0.2 + bob, p.z);
        // Wheels.
        const steer = this.physics.steer;
        const wheels = this.model.wheels;
        for (const key of ['fl', 'fr'] as const) {
            // Model +X maps to screen-left, so negate to make the wheels point into the turn.
            wheels[key].rotation.y = -steer;
        }
        const spinDelta = (this.physics.vLong / 0.36) * dt;
        for (const wheel of Object.values(wheels)) {
            (wheel.userData.spin as THREE.Object3D).rotation.x += spinDelta;
        }
        this.model.steeringWheel.rotation.z = this.physics.steer * 2.4;
        this.displayTimer -= dt;
        if (this.displayTimer <= 0) {
            const { speed, gear, rpm } = this.physics.telemetry;
            this.model.updateDisplay(speed, gear, rpm);
            this.displayTimer = .1;
        }
        this.groundWheels();
        // Automatic arcade aero trim: this is intentionally not a claim about a
        // circuit DRS zone or regulatory eligibility.
        const wantStraightLineAero = wantsStraightLineAero(sample.curvature, this.physics.vLong, this.physics.telemetry.brake) ? 1 : 0;
        this.straightLineAero += (wantStraightLineAero - this.straightLineAero) * Math.min(1, dt * 3);
        this.model.drsFlap.rotation.x = -this.straightLineAero * 0.7;
        // Brake light glow.
        const braking = this.physics.telemetry.brake;
        for (const light of this.model.brakeLights) {
            const mat = light.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = 0.4 + braking * 4;
        }
        this.lastSurface = this.surface;
    }
    private groundWheels(): void {
        this.worldVertical.set(0, 1, 0).applyQuaternion(this.baseQuat.copy(this.group.quaternion).invert());
        for (const { wheel, mount, points, profiles, radialStep, radialPhase, footprintRadius } of this.wheelMounts) {
            wheel.position.copy(mount);
            this.wheelCenter.copy(mount).applyQuaternion(this.group.quaternion).add(this.group.position);
            // The support point must land on the rendered tyre mesh, including its
            // spin phase. The analytic solve below picks that vertex directly instead
            // of visiting every below-axis vertex in the 40-segment LatheGeometry.
            this.wheelOrientation.copy(this.group.quaternion).multiply(wheel.quaternion).multiply((wheel.userData.spin as THREE.Object3D).quaternion);
            this.wheelAxis.set(1, 0, 0).applyQuaternion(this.wheelOrientation).normalize();
            const referenceY = undefined;
            const radialPoint = (axial: number, radius: number, radial: THREE.Vector3) => this.tyrePoint.copy(this.wheelCenter).addScaledVector(this.wheelAxis, axial).addScaledVector(radial, radius);
            const snapRadialVertex = (direction: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 => {
                this.inverseWheelOrientation.copy(this.wheelOrientation).invert();
                this.localTyreDirection.copy(direction).applyQuaternion(this.inverseWheelOrientation);
                const angle = Math.atan2(this.localTyreDirection.z, this.localTyreDirection.y);
                const snapped = radialPhase + Math.round((angle - radialPhase) / radialStep) * radialStep;
                return target.set(0, Math.cos(snapped), Math.sin(snapped)).applyQuaternion(this.wheelOrientation);
            };
            const supportVertex = (direction: THREE.Vector3): TyreProfile => {
                const axialWeight = direction.dot(this.wheelAxis);
                snapRadialVertex(direction, this.tyreRadial);
                const radialWeight = direction.dot(this.tyreRadial);
                let support = profiles[0];
                let best = axialWeight * support.axial + radialWeight * support.radius;
                for (let i = 1; i < profiles.length; i += 1) {
                    const profile = profiles[i];
                    const value = axialWeight * profile.axial + radialWeight * profile.radius;
                    if (value > best) {
                        best = value;
                        support = profile;
                    }
                }
                return support;
            };
            const planeConstant = this.builder.drivingSurface.planarPatch(this.wheelCenter.x, this.wheelCenter.z, footprintRadius, this.planeNormal, referenceY);
            let correction = -Infinity;
            if (planeConstant !== undefined) {
                // Every surface candidate beneath the entire tyre footprint lies on
                // this plane. Its extrema over the spun, polygonal LatheGeometry occur
                // at a rendered vertex, which supportVertex selects exactly.
                this.supportVector.copy(this.planeNormal).multiplyScalar(-1 / this.planeNormal.y);
                const support = supportVertex(this.supportVector);
                radialPoint(support.axial, support.radius, this.tyreRadial);
                const planeGround = (planeConstant - this.planeNormal.x * this.tyrePoint.x - this.planeNormal.z * this.tyrePoint.z) / this.planeNormal.y;
                // The footprint-wide patch is a proof only if the exact support vertex
                // is covered by the selected surface. A missing triangle or a surface
                // transition at that point takes the same complete-scan fallback.
                const actualGround = this.builder.drivingSurface.heightAt(this.tyrePoint.x, this.tyrePoint.z, undefined, referenceY);
                if (actualGround !== undefined && Math.abs(actualGround - planeGround) <= .00025)
                    correction = actualGround - this.tyrePoint.y;
            }
            if (!Number.isFinite(correction)) {
                // A conservative patch rejection retains the former exact scan for
                // kerbs, seams, grades and the figure-eight's mixed deck candidates.
                for (let i = 0; i < points.length; i += 3) {
                    this.tyrePoint.fromArray(points, i).applyQuaternion(this.wheelOrientation);
                    if (this.tyrePoint.y >= 0)
                        continue;
                    this.tyrePoint.add(this.wheelCenter);
                    const ground = this.builder.drivingSurface.heightAt(this.tyrePoint.x, this.tyrePoint.z, undefined, referenceY);
                    if (ground !== undefined)
                        correction = Math.max(correction, ground - this.tyrePoint.y);
                }
            }
            // Move vertically in world space so correction cannot shift the footprint
            // across a kerb edge and alternate between two different surface heights.
            if (Number.isFinite(correction))
                wheel.position.addScaledVector(this.worldVertical, correction);
        }
    }
    get surfaceInfo(): SurfaceInfo {
        return this.lastSurface;
    }

    get isStraightLineAeroActive(): boolean {
        return this.straightLineAero > 0.5;
    }
}
