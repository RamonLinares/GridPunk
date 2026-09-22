import type { TrackSpline } from '../game/track/TrackSpline';
import { formatTime } from './Timing';
import type { OpponentDifficulty } from './AiDriver';
export type HudProximity = 'left' | 'right' | 'both' | 'none';
export interface HudState {
    speedKmh: number;
    gear: number;
    rpm: number;
    rpmFraction: number;
    throttle: number;
    brake: number;
    aero: boolean;
    tc: boolean;
    abs: boolean;
    lap: number;
    currentLap: number;
    lastLap: number | null;
    bestLap: number | null;
    lapValid: boolean;
    lastLapValid: boolean | null;
    sectors: (number | null)[];
    bestSectors: (number | null)[];
    offTrack: boolean;
    position: number;
    gap: number;
    /** Seconds remaining before the race starts. Omit outside the start sequence. */
    countdown?: number;
    /** Side(s) occupied by a nearby rival, used for a glanceable edge cue. */
    proximity?: HudProximity;
}
export class Hud {
    private readonly root = document.createElement('div');
    private readonly els: Record<string, HTMLElement> = {};
    private readonly minimap: HTMLCanvasElement;
    private readonly minimapResizeObserver: ResizeObserver;
    private minimapWidth = 160;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly mapBase = document.createElement('canvas');
    private readonly path: {
        x: number;
        y: number;
    }[] = [];
    private readonly minX: number;
    private readonly minZ: number;
    private readonly scale: number;
    private readonly offsetX: number;
    private readonly offsetY: number;
    private messageTimer = 0;
    private mapTimer = 0;
    constructor(private readonly spline: TrackSpline) {
        this.root.id = 'hud-root';
        this.root.innerHTML = `
      <div class="race-identity"><span class="circuit-mark" aria-hidden="true">${spline.circuitId === 'solar' ? '◢' : '///'}</span><div><b>${spline.circuit.shortName.toUpperCase()}</b><span>${spline.circuitId === 'solar' ? 'CLEAN ENERGY. A BRIGHTER TOMORROW.' : spline.circuit.shortName.toUpperCase() + ' · SPRINT'}</span></div></div>
      <div class="race-standing"><div class="position-readout"><span class="hud-label">POSITION</span><strong><b id="hud-position">1</b><small>/ 6</small></strong><span id="hud-gap" class="rival-gap"></span></div><div class="lap-readout"><span class="hud-label">LAP</span><strong><b id="hud-lap">1</b><small>/ 3</small></strong></div></div>
      <div class="timing-tower"><div class="live-time"><span class="hud-label"><i></i><span id="hud-time-label" role="status">LAP TIME</span></span><strong id="hud-time">0:00.000</strong></div><div class="timing-row"><span>PERSONAL BEST</span><b id="hud-best">--:--.---</b></div><div class="timing-row"><span id="hud-last-label">LAST LAP</span><b id="hud-last">--:--.---</b></div><div class="sector-row"><span id="hud-sector-0">S1</span><span id="hud-sector-1">S2</span><span id="hud-sector-2">S3</span></div></div>
      <div class="start-lights" id="hud-start-lights" aria-label="Starting lights" aria-hidden="true">${Array.from({ length: 5 }, () => '<i></i>').join('')}</div>
      <div class="hud-proximity" id="hud-proximity" aria-hidden="true"><i class="proximity-left" aria-hidden="true"></i><i class="proximity-right" aria-hidden="true"></i></div>
      <div class="hud-warning" id="hud-warning">TRACK LIMITS <span>Ease off · rejoin safely</span></div>
      <div class="hud-message" id="hud-message" role="status" aria-live="polite"></div>
      <div class="hud-minimap"><div class="map-caption"><span>TRACK POSITION</span><b>${spline.circuit.mapCode}</b></div><canvas id="hud-minimap" width="320" height="280" role="img" aria-label="Live circuit map: red arrow is you, cyan dots are the five competitors, white square is start and finish"></canvas><div class="map-legend"><i></i> YOU <i class="rival-marker"></i> RIVALS <span>FINISH</span><b>▰</b></div></div>
      <div class="hud-telemetry"><div class="driving-cue" id="hud-driving-cue" role="status" aria-live="polite" hidden><i></i><b id="hud-cue-label"></b><span id="hud-cue-target"></span></div><div class="shift-lights" id="hud-rpm" aria-label="Engine revolutions">${Array.from({ length: 15 }, () => '<i></i>').join('')}</div><div class="telemetry-main"><div class="gear"><span class="hud-label">GEAR</span><b id="hud-gear">N</b></div><div class="speed"><b id="hud-speed">0</b><span>KM/H</span></div><div class="pedals"><div class="pedal brake"><i id="hud-brake"></i></div><div class="pedal"><i id="hud-throttle"></i></div></div></div><div class="telemetry-footer"><span id="hud-assist-name">ROOKIE ASSIST</span><div><b id="hud-tc" class="flag">TC</b><b id="hud-abs" class="flag">ABS</b><b id="hud-aero" class="flag">AUTO AERO</b></div></div></div>
      <div class="driving-hint"><span><kbd>W A S D</kbd> DRIVE</span><span><kbd>SPACE</kbd> BRAKE</span><span><kbd>C</kbd> CAMERA</span><span><kbd>R</kbd> RECOVER</span></div>`;
        document.querySelector('#app')?.appendChild(this.root);
        for (const el of this.root.querySelectorAll<HTMLElement>('[id]'))
            this.els[el.id] = el;
        this.root.setAttribute('aria-label', 'Race HUD');
        this.els['hud-position'].setAttribute('aria-live', 'polite');
        this.els['hud-lap'].setAttribute('aria-live', 'polite');
        this.els['hud-warning'].setAttribute('aria-hidden', 'true');
        this.els['hud-start-lights'].setAttribute('role', 'img');
        this.minimap = this.els['hud-minimap'] as HTMLCanvasElement;
        this.ctx = this.minimap.getContext('2d')!;
        this.minimapWidth = Math.max(1, this.minimap.clientWidth);
        // Keep responsive marker sizing without forcing layout after HUD writes.
        this.minimapResizeObserver = new ResizeObserver(([entry]) => {
            this.minimapWidth = Math.max(1, entry.contentRect.width);
        });
        this.minimapResizeObserver.observe(this.minimap);
        const xs = spline.samples.map(s => s.position.x);
        const zs = spline.samples.map(s => s.position.z);
        this.minX = Math.min(...xs);
        this.minZ = Math.min(...zs);
        const spanX = Math.max(...xs) - this.minX, spanZ = Math.max(...zs) - this.minZ;
        this.scale = Math.min(280 / spanX, 240 / spanZ);
        this.offsetX = (320 - spanX * this.scale) / 2;
        this.offsetY = (280 - spanZ * this.scale) / 2;
        this.path = spline.samples.map(s => this.project(s.position.x, s.position.z));
        this.mapBase.width = 320;
        this.mapBase.height = 280;
        const ctx = this.mapBase.getContext('2d')!;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        this.path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        ctx.strokeStyle = '#08151b';
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.strokeStyle = '#c3d0d3';
        ctx.lineWidth = 4;
        ctx.stroke();
        const start = this.path[0];
        ctx.fillStyle = '#fff';
        ctx.fillRect(start.x - 4, start.y - 4, 8, 8);
    }
    private project(x: number, z: number) {
        return { x: (x - this.minX) * this.scale + this.offsetX, y: (z - this.minZ) * this.scale + this.offsetY };
    }
    setOpponentDifficulty(level: OpponentDifficulty): void {
        document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(btn => {
            const active = btn.dataset.difficulty === level;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }
    update(state: HudState, carPos: {
        x: number;
        z: number;
    }, heading: number, dt: number, competitors: readonly {
        x: number;
        z: number;
    }[]): void {
        const e = this.els;
        e['hud-speed'].textContent = Math.round(Math.max(0, state.speedKmh)).toString();
        e['hud-gear'].textContent = state.gear < 0 ? 'R' : state.gear === 0 ? 'N' : state.gear.toString();
        const lights = e['hud-rpm'].children;
        for (let i = 0; i < lights.length; i++)
            lights[i].classList.toggle('lit', state.rpmFraction > 0.38 + i * 0.041);
        e['hud-rpm'].classList.toggle('redline', state.rpmFraction > 0.95);
        e['hud-throttle'].style.height = `${state.throttle * 100}%`;
        e['hud-brake'].style.height = `${state.brake * 100}%`;
        e['hud-time'].textContent = formatTime(state.currentLap);
        e['hud-last'].textContent = formatTime(state.lastLap);
        e['hud-best'].textContent = formatTime(state.bestLap);
        e['hud-lap'].textContent = Math.min(3, state.lap).toString();
        e['hud-position'].textContent = state.position.toString();
        const lapInvalid = state.lapValid === false;
        const lastInvalid = state.lastLapValid === false;
        const timeLabel = lapInvalid ? 'LAP TIME · INVALID' : 'LAP TIME';
        if (e['hud-time-label'].textContent !== timeLabel)
            e['hud-time-label'].textContent = timeLabel;
        const lastLabel = lastInvalid ? 'LAST · INVALID' : 'LAST LAP';
        if (e['hud-last-label'].textContent !== lastLabel)
            e['hud-last-label'].textContent = lastLabel;
        this.root.classList.toggle('lap-invalid', lapInvalid);
        e['hud-last'].classList.toggle('invalid', lastInvalid);
        e['hud-last-label'].classList.toggle('invalid', lastInvalid);
        const lapsBehind = Math.floor(state.gap / this.spline.length);
        const gapLabel = lapsBehind > 0 ? `${lapsBehind} LAP${lapsBehind > 1 ? 'S' : ''}`
            : state.gap >= 1000 ? `${(state.gap / 1000).toFixed(1)} km` : `${Math.round(state.gap)} m`;
        e['hud-gap'].textContent = state.position === 1 ? 'LEADING' : state.gap > 0 ? `AHEAD ${gapLabel}` : '';
        this.root.classList.toggle('experienced', state.currentLap > 5 || state.lap > 1);
        this.root.dataset.position = String(Math.max(1, Math.min(6, state.position)));
        this.root.dataset.gear = state.gear < 0 ? 'reverse' : state.gear === 0 ? 'neutral' : 'drive';
        this.root.classList.toggle('off-track', state.offTrack);
        this.updateStartLights(state.countdown);
        const proximity = state.proximity ?? 'none';
        e['hud-proximity'].dataset.proximity = proximity;
        e['hud-proximity'].setAttribute('aria-hidden', String(proximity === 'none'));
        for (let i = 0; i < 3; i++) {
            const value = state.sectors[i];
            const el = e[`hud-sector-${i}`];
            el.textContent = value != null ? `${value.toFixed(2)}` : `S${i + 1}`;
            el.classList.toggle('done', value != null);
            el.classList.toggle('best', !lapInvalid && value != null && (state.bestSectors[i] == null || value <= state.bestSectors[i]!));
        }
        e['hud-aero'].classList.toggle('on', state.aero);
        e['hud-tc'].classList.toggle('on', state.tc);
        e['hud-abs'].classList.toggle('on', state.abs);
        e['hud-warning'].classList.toggle('show', state.offTrack);
        e['hud-warning'].setAttribute('aria-hidden', String(!state.offTrack));
        this.mapTimer -= dt;
        if (this.mapTimer <= 0) {
            this.renderMinimap(carPos, heading, competitors);
            this.mapTimer = 1 / 20;
        }
        if (this.messageTimer > 0) {
            this.messageTimer -= dt;
            if (this.messageTimer <= 0)
                e['hud-message'].classList.remove('show');
        }
    }
    private updateStartLights(countdown: number | undefined): void {
        const el = this.els['hud-start-lights'];
        const running = Number.isFinite(countdown) && (countdown as number) > 0;
        el.classList.toggle('show', running);
        el.setAttribute('aria-hidden', String(!running));
        if (!running)
            return;
        // Countdown is time remaining (4 → 0). Five lamps fill at even intervals,
        // then the whole bank disappears for the existing LIGHTS OUT cue.
        const elapsed = 4 - Math.min(4, Math.max(0, countdown as number));
        const litCount = Math.min(5, Math.max(1, Math.ceil(elapsed * 1.25)));
        const lights = el.children;
        for (let i = 0; i < lights.length; i++)
            lights[i].classList.toggle('lit', i < litCount);
    }
    /** Contextual coaching, kept beside telemetry and outside the racing line. */
    setDrivingCue(cue: string, targetSpeedKmh: number): void {
        const el = this.els['hud-driving-cue'];
        const label = cue.trim().toUpperCase();
        el.hidden = !label;
        if (!label)
            return;
        el.dataset.cue = label.includes('RECOVER') || label.includes('REVERSE') ? 'recover'
            : label.includes('BRAKE') ? 'brake' : label.includes('LIFT') ? 'lift' : 'build';
        this.els['hud-cue-label'].textContent = label;
        this.els['hud-cue-target'].textContent = Number.isFinite(targetSpeedKmh) && targetSpeedKmh > 0
            && el.dataset.cue !== 'build' && el.dataset.cue !== 'recover'
            ? `${Math.round(targetSpeedKmh)} KM/H` : '';
    }
    showMessage(text: string, duration: number, kind = ''): void {
        const el = this.els['hud-message'];
        el.textContent = text;
        // Race feedback stays in a compact alert strip above the sightline. This
        // keeps LIGHTS OUT, lap and position calls glanceable without masking the
        // next corner on a phone or in cockpit view.
        const cueKind = kind || (text === 'LIGHTS OUT' || text === 'GET READY' ? 'go' : '');
        el.className = `hud-message show ${cueKind} compact`;
        this.messageTimer = duration;
    }
    private renderMinimap(carPos: {
        x: number;
        z: number;
    }, heading: number, competitors: readonly {
        x: number;
        z: number;
    }[]): void {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, 320, 280);
        ctx.drawImage(this.mapBase, 0, 0);
        // Keep markers readable on the compact phone map. Draw the player last so
        // the pack never covers its heading arrow when cars run close together.
        const markerScale = Math.max(1, Math.min(2, 160 / this.minimapWidth));
        ctx.fillStyle = '#70e0f2';
        ctx.strokeStyle = '#08151b';
        ctx.lineWidth = 2 * markerScale;
        for (const competitor of competitors) {
            const position = this.project(competitor.x, competitor.z);
            ctx.beginPath();
            ctx.arc(position.x, position.y, 4.5 * markerScale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        const p = this.project(carPos.x, carPos.z);
        ctx.fillStyle = 'rgba(255,72,56,.22)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI - heading);
        ctx.scale(markerScale, markerScale);
        ctx.fillStyle = '#ff513d';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    dispose(): void { this.minimapResizeObserver.disconnect(); this.root.remove(); }
}
