import * as THREE from 'three';
import type { Car } from '../entities/Car';
import type { TrackSpline } from '../game/track/TrackSpline';
import { DEFAULT_CONFIG, type VehicleInput } from './VehiclePhysics';
export type OpponentDifficulty = 'easy' | 'normal' | 'hard';
// Rival pace is independent from the fixed Rookie driving aids.
// Pace changes corner commitment, braking and launch response. All tiers use
// the shared vehicle physics and engine performance without catch-up boosts.
export const AI_DIFFICULTY_PACE: Record<OpponentDifficulty, number> = { easy: .94, normal: 1.08, hard: 1.65 };
/**
 * Lightweight racing-line follower. It aims at a speed-dependent look-ahead
 * point, brakes for the tightest curvature in the next stretch and keeps a
 * per-driver lateral offset so the field spreads across the track.
 */
export class AiDriver {
    private readonly cache = { index: 0 };
    private pace = 1;
    private launchElapsed = 0;
    private readonly cornerCurvature: Float64Array;
    private targetLane: number;
    private passHold = 0;
    private passLane: number;
    private readonly target = new THREE.Vector3();
    private readonly trafficCache = { index: 0 };
    private readonly traffic: {
        along: number;
        lane: number;
        speed: number;
    }[] = [];
    private readonly trafficPool: {
        along: number;
        lane: number;
        speed: number;
    }[] = [];
    constructor(private readonly spline: TrackSpline, private readonly lateralOffset = 0, private readonly grip = 15.5, private readonly topSpeed = 94) {
        this.targetLane = lateralOffset;
        this.passLane = lateralOffset;
        // The steering look-ahead rounds short survey-point kinks. Plan for that
        // driven arc, not a single four-metre centreline segment's curvature spike.
        this.cornerCurvature = new Float64Array(spline.count);
        for (let i = 0; i < spline.count; i++) {
            let curvature = 0, weight = 0;
            for (let j = -3; j <= 3; j++) {
                const w = 4 - Math.abs(j);
                curvature += Math.abs(spline.sampleAt(i + j).curvature) * w;
                weight += w;
            }
            const sample = spline.sampleAt(i);
            // La Source is a compact hairpin. Retain more of its measured peak so
            // the seven-tap survey smoothing cannot let a traffic-compromised line
            // accelerate across the outside edge on corner exit.
            const rawShare = .65;
            this.cornerCurvature[i] = Math.max(curvature / weight, Math.abs(sample.curvature) * rawShare);
        }
    }
    reset(index = 0): void {
        this.cache.index = index;
        this.launchElapsed = 0;
        this.targetLane = this.lateralOffset;
        this.passLane = this.lateralOffset;
        this.passHold = 0;
    }
    setPace(pace: number): void {
        this.pace = THREE.MathUtils.clamp(pace, 0.78, 1.7);
    }
    update(car: Car, others: {
        position: THREE.Vector3;
        speed: number;
    }[] = [], dt = 1 / 60): VehicleInput {
        this.launchElapsed += dt;
        const p = car.physics.position;
        const probe = this.spline.probe(p, this.cache);
        const base = probe.sample.index;
        const count = this.spline.count;
        const speed = Math.max(0, car.physics.telemetry.speed);
        const spacing = this.spline.length / count;
        const lane = probe.signedOffset;
        const progress = probe.sample.distance + probe.segmentT * spacing;
        const lookahead = 8 + speed * THREE.MathUtils.lerp(.42, .34, THREE.MathUtils.smoothstep(speed, 30, 60));
        const aheadIndex = base + Math.max(2, Math.round(lookahead / spacing));
        const ahead = this.spline.sampleAt(aheadIndex);
        const horizonMetres = Math.max(40, speed * 2.2);
        const traffic = this.traffic;
        traffic.length = 0;
        const horizonSquared = (horizonMetres + 12) ** 2;
        for (const other of others) {
            if (!(other.position.distanceToSquared(p) < horizonSquared))
                continue;
            this.trafficCache.index = base;
            const otherProbe = this.spline.probe(other.position, this.trafficCache);
            // Compare with this route at the other car, so traffic on a ramp
            // stays visible while cars on the crossing’s other deck do not.
            if (this.spline.circuit.gradeSeparated && Math.abs(other.position.y - otherProbe.height) > 2.5) continue;
            let along = otherProbe.sample.distance + otherProbe.segmentT * spacing - progress;
            if (along > this.spline.length / 2)
                along -= this.spline.length;
            if (along < -this.spline.length / 2)
                along += this.spline.length;
            if (!(along > -10 && along < horizonMetres && Math.abs(otherProbe.signedOffset) < (8)))
                continue;
            const slot = traffic.length;
            const item = this.trafficPool[slot] ?? (this.trafficPool[slot] = { along: 0, lane: 0, speed: 0 });
            item.along = along;
            item.lane = otherProbe.signedOffset;
            item.speed = other.speed;
            traffic.push(item);
        }
        // Reserve lateral space for cars alongside. A racing line is a preference,
        // never permission to steer through a neighbour to get back to that line.
        const laneLimit = 4.2;
        let minLane = -laneLimit, maxLane = laneLimit;
        for (const other of traffic)
            if (Math.abs(other.along) < 6.5) {
                if (other.lane > lane)
                    maxLane = Math.min(maxLane, other.lane - 2.8);
                else
                    minLane = Math.max(minLane, other.lane + 2.8);
            }
        const blocked = traffic.some(other => other.along > 0 && Math.abs(other.lane - lane) < 2.8 &&
            (other.speed < speed - 1.5 || other.along < 18));
        this.passHold = Math.max(0, this.passHold - dt);
        const bend = Math.max(Math.abs(this.spline.sampleAt(base).curvature), Math.abs(ahead.curvature));
        const cruisingLane = this.lateralOffset * (1 - .8 * Math.min(1, bend / .008));
        let wantLane = this.passHold > 0 ? this.passLane : cruisingLane;
        if (blocked && minLane <= maxLane) {
            const candidates = [this.targetLane, this.lateralOffset, -3.6, 0, 3.6, minLane, maxLane];
            let bestCost = Infinity;
            for (const candidate of candidates) {
                const candidateLane = THREE.MathUtils.clamp(candidate, minLane, maxLane);
                let cost = Math.abs(candidateLane - this.targetLane) * .35 + Math.abs(candidateLane - this.lateralOffset) * .08;
                for (const other of traffic) {
                    if (Math.abs(other.lane - candidateLane) < 2.8) {
                        cost += other.along < 9 ? 100 : 18 * (1 - other.along / horizonMetres);
                    }
                }
                if (cost < bestCost) {
                    bestCost = cost;
                    wantLane = candidateLane;
                }
            }
            this.passLane = wantLane;
            this.passHold = 1.2;
        }
        if (minLane <= maxLane)
            wantLane = THREE.MathUtils.clamp(wantLane, minLane, maxLane);
        else
            wantLane = lane;
        const laneSlew = 4;
        this.targetLane += THREE.MathUtils.clamp(wantLane - this.targetLane, -laneSlew * dt, laneSlew * dt);
        // A close neighbour's occupied corridor takes precedence over lane smoothing.
        const aimLane = minLane <= maxLane
            ? THREE.MathUtils.clamp(this.targetLane, minLane, maxLane)
            : lane;
        const stoppedAhead = traffic.find(other => other.along > 0 && other.along < 30 && other.speed < 3 && Math.abs(other.lane - lane) < 3);
        const alongside = traffic.some(other => Math.abs(other.along) < 6.5);
        const aimSample = stoppedAhead && Math.abs(aimLane - lane) > .3
            ? this.spline.sampleAt(base + Math.max(1, Math.round(Math.max(7, stoppedAhead.along * .4) / spacing)))
            : alongside ? this.spline.sampleAt(base + Math.max(2, Math.round((10 + speed * .6) / spacing))) : ahead;
        const target = this.target.copy(aimSample.position).addScaledVector(aimSample.right, aimLane);
        const desiredYaw = Math.atan2(target.x - p.x, target.z - p.z);
        let err = desiredYaw - car.physics.yaw;
        while (err > Math.PI)
            err -= Math.PI * 2;
        while (err < -Math.PI)
            err += Math.PI * 2;
        // Positive command now turns screen-right, so negate the heading error.
        const steerLimit = DEFAULT_CONFIG.maxSteer * Math.max(.12, 1 / (1 + speed * .075));
        const targetDistance = Math.max(5, Math.hypot(target.x - p.x, target.z - p.z));
        const steer = THREE.MathUtils.clamp(alongside ? -err * 1.9 : -Math.atan2(2 * DEFAULT_CONFIG.wheelbase * Math.sin(err), targetDistance) / steerLimit, -1, 1);
        // Plan a braking envelope in metres. A far-away hairpin should not force
        // the entire straight to be driven at its apex speed.
        // Difficulty chiefly changes corner commitment; all modes retain full
        // engine performance on straights instead of the old 68% Rookie speed cap.
        const difficulty = THREE.MathUtils.clamp((this.pace - .94) / .30, 0, 1);
        let cornerSpeed = this.topSpeed * (0.92 + this.pace * 0.08);
        // A compromised line in traffic has less cornering room than a solo lap.
        const lineMargin = 1 - (traffic.length ? .24 : .16) * THREE.MathUtils.clamp((Math.max(Math.abs(aimLane), Math.abs(lane)) - 1) / 3, 0, 1);
        const trafficMargin = alongside ? .9 : 1;
        const brakingDeceleration = 22 + difficulty * 6;
        const horizon = Math.max(90, speed * speed / (2 * brakingDeceleration) + 55);
        const scan = Math.ceil(horizon / spacing);
        for (let k = 0; k <= scan; k += 1) {
            const sampleIndex = (base + k) % count;
            const curvature = Math.max(0.0001, this.cornerCurvature[sampleIndex]);
            // Tight chicanes still need time to reverse steering. Spend the
            // higher difficulty's pace on flowing corners, not hairpin overshoot.
            const hairpinPace = THREE.MathUtils.lerp(this.pace, Math.min(this.pace, 1.08),
                THREE.MathUtils.smoothstep(curvature, .035, .075));
            // v²*k <= base grip + downforce grip*v². Keep a conservative share
            // of the shared car's aerodynamic grip for steering/braking headroom.
            const apexSpeed = Math.sqrt(this.grip / Math.max(.0001, curvature - .00325)) * hairpinPace * lineMargin * trafficMargin;
            const availableDistance = Math.max(0, k * spacing - 4);
            cornerSpeed = Math.min(cornerSpeed, Math.sqrt(apexSpeed * apexSpeed + 2 * brakingDeceleration * availableDistance));
        }
        // Rejoin gently after contact rather than accelerating sideways into a wall.
        if (Math.abs(err) > 1.1) {
            cornerSpeed = Math.min(cornerSpeed, 22);
        }
        // Lift before an outward drift reaches the road edge, including after
        // a side-by-side pass. This uses real velocity rather than snapping back.
        const projectedLane = lane + car.physics.velocity.dot(probe.sample.right) * .6;
        const edgeRisk = Math.max(Math.abs(lane), Math.abs(projectedLane));
        cornerSpeed *= 1 - .45 * THREE.MathUtils.smoothstep(edgeRisk, 4.8, 7);
        // Match the actual clear distance until the pass is physically alongside.
        // Equal-speed followers still leave a bumper gap instead of rubbing forever.
        for (const other of traffic) {
            if (other.along <= 0 || Math.abs(other.lane - lane) >= 2.75)
                continue;
            // A car already alongside needs lateral space, not a sudden braking
            // command as its centre moves a few centimetres ahead of ours.
            if (other.along < 6.5 && Math.abs(other.lane - lane) > 1.2)
                continue;
            // Preserve clearance around the 6.3 m contact capsule at rest.
            const desiredGap = 6.5 + speed * THREE.MathUtils.lerp(.18, .14, difficulty);
            const clearPassLane = minLane <= maxLane && Math.abs(aimLane - lane) > .35 &&
                !traffic.some(neighbour => Math.abs(neighbour.along) < 10 && Math.abs(neighbour.lane - aimLane) < 2.75);
            // Keep enough rolling speed to turn around a stopped obstruction when a
            // clear passing corridor exists. A boxed-in car waits instead of pushing.
            const crawl = clearPassLane && speed < 4 && other.speed < 2 ? 2.5 : 0;
            const followingSpeed = Math.max(crawl, other.speed + (other.along - desiredGap) * THREE.MathUtils.lerp(1.05, 1.3, difficulty));
            cornerSpeed = Math.min(cornerSpeed, followingSpeed);
        }
        const throttle = THREE.MathUtils.clamp((cornerSpeed - speed) / THREE.MathUtils.lerp(2, 1.65, difficulty), 0, 1)
            * Math.min(1, this.launchElapsed / THREE.MathUtils.lerp(1.1, .3, difficulty));
        const brake = THREE.MathUtils.clamp((speed - cornerSpeed) / 6, 0, 1);
        // This controller is tuned in physical wheel angle. Extra low-speed lock
        // for the driver must not multiply the AI's existing steering demands.
        const normalizedSteer = steer * steerLimit / car.physics.getSteeringLimit();
        return { throttle, brake, steer: THREE.MathUtils.clamp(normalizedSteer, -1, 1), handbrake: false };
    }
}
