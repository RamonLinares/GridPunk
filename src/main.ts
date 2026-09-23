import { installReplayPanel } from './systems/ReplayPanel';
import { STAGES, LAYOUT_NAMES, circuitsForStage, circuitFor, selectedCircuit, isDryCircuit, type CircuitId, type StageId } from './game/track/circuits';
import { GamepadActions } from './core/GamepadActions';
import { Game } from './game/Game';
import type { OpponentDifficulty } from './systems/AiDriver';
import type { QualityPreset } from './systems/QualityController';
import { formatTime } from './systems/Timing';
import { selectedNeonVehicle, type NeonVehicle } from './entities/NeonVehicleChoice';
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas)
    throw new Error('Missing #game-canvas element.');
const circuit = selectedCircuit();
const game = new Game(canvas);
const overlay = document.querySelector<HTMLElement>('#session-overlay')!;
const primary = document.querySelector<HTMLButtonElement>('#session-primary')!;
const restart = document.querySelector<HTMLButtonElement>('#session-restart')!;
const pauseButton = document.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
const cameraButton = document.querySelector<HTMLButtonElement>('[data-action="camera"]')!;
const recoverButton = document.querySelector<HTMLButtonElement>('[data-action="recover"]')!;
const title = document.querySelector<HTMLElement>('#session-title')!;
const kicker = document.querySelector<HTMLElement>('#session-kicker')!;
const description = document.querySelector<HTMLElement>('#session-description')!;
const result = document.querySelector<HTMLElement>('#session-result')!;
overlay.setAttribute('aria-describedby', 'session-description');
result.setAttribute('aria-live', 'polite');
let session: 'welcome' | 'race' | 'pause' | 'finish' = 'welcome';
let ready = false;
let muted = false;
const events = new AbortController();
const signal = events.signal;
installReplayPanel(game, circuit.id, signal);
document.title = `GridPunk — ${circuit.shortName}`;
canvas.setAttribute('aria-label', `${circuit.name} driving game`);
document.querySelector('.session-eyebrow')!.innerHTML = '<span class="circuit-mark">///</span> GRIDPUNK';
document.querySelector('#circuit-corners')!.textContent = String(circuit.cornerCount);
const daylight = isDryCircuit(circuit.id);
document.body.classList.toggle('solar-race', circuit.stage === 'solarpunk');
document.body.classList.toggle('steam-race', circuit.stage === 'steampunk');
document.querySelector('.session-location')!.innerHTML = `<span>${circuit.lengthLabel} KM · ${circuit.stage === 'steampunk' ? 'SUNSET' : daylight ? 'DAY' : 'NIGHT'} STREET RACE</span>`;
{
    document.body.classList.add('neon-race');
    document.querySelector('.session-specs > div:last-child b')!.textContent = daylight ? 'SUN' : 'RAIN';
    title.textContent = circuit.shortName;
    document.querySelector('.session-home')!.textContent = circuit.shortName.toUpperCase();
    document.querySelector('.loading-log > span')!.textContent = `> ${circuit.shortName.toUpperCase()}  ${circuit.lengthLabel} KM`;
    kicker.textContent = '';
    description.textContent = '';
    document.querySelector('.course-credit')!.innerHTML = '<a href="/credits.html">Credits &amp; licences</a>';
}
// Stage changes keep the road layout; every stage/layout pair has its own race identity.
const navigateCircuit = (id: CircuitId, stage: StageId) => {
    if (id === circuit.id) return;
    const url = new URL(location.href);
    url.searchParams.set('stage', stage);
    url.searchParams.set('circuit', id);
    location.assign(url.href);
};
const stagePicker = document.createElement('div');
stagePicker.className = 'assist-setting stage-picker';
stagePicker.innerHTML = `<span class="hud-label">STAGE</span><div class="assist-row" role="group" aria-label="Stage">${Object.values(STAGES).map(stage => `<button type="button" data-stage="${stage.id}" aria-pressed="${stage.id === circuit.stage}" class="${stage.id === circuit.stage ? 'active' : ''}">${stage.name.toUpperCase()}</button>`).join('')}</div><p>${STAGES[circuit.stage].description}</p>`;
document.querySelector('.session-specs')!.insertAdjacentElement('afterend', stagePicker);
stagePicker.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button => {
    button.addEventListener('click', () => {
        const stage = button.dataset.stage as StageId;
        navigateCircuit(circuitFor(stage, circuit.layout).id, stage);
    }, { signal });
});
const circuitPicker = document.createElement('div');
circuitPicker.className = 'assist-setting circuit-picker';
circuitPicker.innerHTML = `<span class="hud-label">CIRCUIT · ${STAGES[circuit.stage].name.toUpperCase()}</span><div class="assist-row" role="group" aria-label="Circuit">${circuitsForStage(circuit.stage).map(option => `<button type="button" data-circuit="${option.id}" aria-pressed="${option.id === circuit.id}" class="${option.id === circuit.id ? 'active' : ''}"><span>${LAYOUT_NAMES[option.layout].toUpperCase()}</span><small>${option.lengthLabel} KM · ${option.cornerCount} CORNERS</small></button>`).join('')}</div><p>Changing stage or circuit starts a new sprint.</p>`;
stagePicker.insertAdjacentElement('afterend', circuitPicker);
circuitPicker.querySelectorAll<HTMLButtonElement>('[data-circuit]').forEach(button => {
    button.addEventListener('click', () => navigateCircuit(button.dataset.circuit as CircuitId, circuit.stage), { signal });
});
const activeSteers = new Map<number, number>();
{
    const garage = document.createElement('div');
    garage.className = 'assist-setting neon-garage';
    garage.innerHTML = '<span class="hud-label">YOUR CAR</span><div class="assist-row" role="group" aria-label="Neon car"><button type="button" data-car="shinsei">SHINSEI ND-01</button><button type="button" data-car="k89">KUROGANE K89-R</button></div><p>Shinsei: armoured prototype. K89-R: open cockpit. Changing car starts a new sprint.</p>';
    circuitPicker.insertAdjacentElement('afterend', garage);
    garage.querySelectorAll<HTMLButtonElement>('[data-car]').forEach(button => {
        const selected = button.dataset.car === selectedNeonVehicle();
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.addEventListener('click', () => {
            const car = button.dataset.car as NeonVehicle;
            if (car === selectedNeonVehicle())
                return;
            try {
                localStorage.setItem('gridpunk:neon-car', car);
            }
            catch { /* Optional preference. */ }
            const url = new URL(location.href);
            url.searchParams.set('car', car);
            location.assign(url.href);
        }, { signal });
    });
}
let reverseHeld = false;
let brakeHeld = false;
// Game owns the input state; keeping this adapter local lets the mobile
// reverse affordance send its extra intent while older builds remain callable.
type TouchInputPatch = {
    steer?: number;
    throttle?: number;
    brake?: number;
    handbrake?: boolean;
    allowReverse?: boolean;
};
function setTouchInput(partial: TouchInputPatch): void {
    game.setTouchInput(partial as Parameters<Game['setTouchInput']>[0]);
}
function hideLoading(): void {
    const loading = document.querySelector<HTMLElement>('#loading');
    if (!loading)
        return;
    loading.classList.add('hidden');
    // Remove the completed loading layer after its background has faded.
    window.setTimeout(() => { loading.hidden = true; }, 420);
}
function clearTouch(): void {
    activeSteers.clear();
    reverseHeld = false;
    brakeHeld = false;
    setTouchInput({ steer: 0, throttle: 0, brake: 0, handbrake: false, allowReverse: false });
    document.querySelectorAll('.touch-btn.pressed').forEach(el => el.classList.remove('pressed'));
}
function showSession(next: typeof session): void {
    session = next;
    document.body.dataset.session = next;
    overlay.dataset.state = next;
    overlay.hidden = next === 'race';
    document.querySelector('#touch-controls')?.setAttribute('aria-hidden', String(next !== 'race'));
    if (next === 'race') {
        canvas!.focus({ preventScroll: true });
        return;
    }
    clearTouch();
    restart.hidden = next !== 'pause';
    result.hidden = next !== 'finish';
    if (next === 'pause') {
        kicker.textContent = '';
        title.innerHTML = '<span>Paused</span>';
        description.textContent = '';
        primary.innerHTML = 'RESUME <span>↗</span>';
    }
    else if (next === 'finish') {
        kicker.textContent = '';
        title.innerHTML = '<span>Finished</span>';
        primary.innerHTML = 'RACE AGAIN <span>↗</span>';
    }
    if (ready)
        primary.focus({ preventScroll: true });
}
primary.addEventListener('click', () => {
    if (!ready || game.getReplayState())
        return;
    if (session === 'pause') {
        showSession('race');
        game.setPaused(false);
    }
    else {
        showSession('race');
        game.beginSession();
    }
}, { signal });
restart.addEventListener('click', () => { if (game.getReplayState())
    return; showSession('race'); game.restartSession(); }, { signal });
document.addEventListener('race:pause', (event) => {
    const paused = (event as CustomEvent<{
        paused: boolean;
    }>).detail.paused;
    if (session === 'welcome' || session === 'finish') {
        if (!paused)
            game.setPaused(true);
        return;
    }
    showSession(paused ? 'pause' : 'race');
}, { signal });
document.addEventListener('race:finish', (event) => {
    const finish = (event as CustomEvent<{
        position: number;
        bestLap: number | null;
        lastLap: number | null;
        laps: number;
        history?: {
            lap: number;
            time: number;
            valid: boolean;
        }[];
        newPersonalBest?: boolean;
    }>).detail;
    showSession('finish');
    description.textContent = '';
    result.innerHTML = `<div><span>FINISH</span><b>P${finish.position}<small> / 6</small></b></div><div><span>BEST LAP</span><b>${formatTime(finish.bestLap)}</b></div>`;
    const laps = document.createElement('div');
    laps.className = 'result-laps';
    for (const record of finish.history ?? []) {
        const row = document.createElement('div');
        row.className = `result-lap${record.valid ? '' : ' invalid'}`;
        const label = document.createElement('span');
        label.textContent = `LAP ${record.lap}`;
        const time = document.createElement('b');
        time.textContent = formatTime(record.time);
        const status = document.createElement('small');
        status.textContent = record.valid ? 'CLEAN' : 'INVALID';
        row.append(label, time, status);
        laps.append(row);
    }
    if (finish.newPersonalBest) {
        const record = document.createElement('p');
        record.className = 'personal-best';
        record.textContent = 'NEW PERSONAL BEST · SAVED';
        laps.append(record);
    }
    if (laps.childElementCount)
        result.append(laps);
    result.dataset.outcome = finish.position === 1 ? 'winner' : 'classified';
    result.setAttribute('aria-label', `Finished in position ${finish.position}. Best lap ${formatTime(finish.bestLap)}.`);
    game.setPaused(true);
}, { signal });
const driverSetting = document.querySelector('#driver-assists')!;
const rivalDescriptions: Record<OpponentDifficulty, string> = {
    easy: 'Measured rivals leave a larger braking and traffic margin.',
    normal: 'Competitive rivals balance commitment with safe traffic gaps.',
    hard: 'Sharp launches, late braking and fast corner exits. Expect a fight for position.',
};
const rivalSetting = document.createElement('div');
rivalSetting.className = 'rival-setting assist-setting';
rivalSetting.innerHTML = '<span class="hud-label">RIVALS</span><div class="assist-row"><button type="button" data-difficulty="easy">ROOKIE</button><button type="button" data-difficulty="normal">SPORT</button><button type="button" data-difficulty="hard">EXPERT</button></div><p id="rival-description"></p>';
driverSetting.insertAdjacentElement('afterend', rivalSetting);
document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => {
    button.addEventListener('click', () => {
        if (!ready)
            return;
        const level = button.dataset.difficulty as OpponentDifficulty;
        game.setOpponentDifficulty(level, false);
        document.querySelector('#rival-description')!.textContent = rivalDescriptions[level];
    }, { signal });
});
const qualityDescriptions: Record<QualityPreset, string> = {
    auto: 'Balances detail and frame rate, then recovers detail after sustained headroom.',
    performance: '0.8 DPR cap · shadows and post processing off.',
    quality: 'Full shadows, bloom and smooth edges.',
    extreme: 'Volumetric fog, reflections, motion blur and VHS colour. Highest GPU demand.',
    cinematic: 'Extreme plus a graded look. Cyberpunk: black-sky mist, tape bleed and replay bokeh. Solarpunk: afternoon sun, aerial haze and a film-print grade. Steampunk: golden-hour sun shafts and lit gas lamps. Letterboxed replays.',
};
const qualitySetting = document.createElement('div');
qualitySetting.className = 'quality-setting assist-setting';
qualitySetting.innerHTML = '<span class="hud-label">GRAPHICS</span><div class="assist-row quality-row"><button type="button" data-quality="auto">AUTO</button><button type="button" data-quality="performance">PERFORMANCE</button><button type="button" data-quality="quality">QUALITY</button>' + ('<button type="button" data-quality="extreme">EXTREME</button><button type="button" data-quality="cinematic">CINEMATIC</button>') + '</div><p id="quality-description"></p>';
rivalSetting.insertAdjacentElement('afterend', qualitySetting);
const updateQualityUi = (preset: QualityPreset, effectiveLevel?: number) => {
    document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach(button => {
        const active = button.dataset.quality === preset;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    const effective = effectiveLevel === undefined || preset !== 'auto' ? ''
        : ` Current: ${['Performance', 'Balanced', 'Quality'][effectiveLevel]}.`;
    document.querySelector('#quality-description')!.textContent = qualityDescriptions[preset] + effective;
};
updateQualityUi(game.getQualityPreset());
document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach(button => {
    button.addEventListener('click', () => {
        if (!ready)
            return;
        game.setQualityPreset(button.dataset.quality as QualityPreset, false);
    }, { signal });
});
document.addEventListener('race:quality', event => {
    const detail = (event as CustomEvent<{
        preset: QualityPreset;
        effectiveLevel: number;
    }>).detail;
    updateQualityUi(detail.preset, detail.effectiveLevel);
}, { signal });

const controlsNote = document.querySelector<HTMLElement>('.controls-details > p:not(.course-credit)');
if (controlsNote)
    controlsNote.append(' Automatic arcade aero adjusts the rear-wing flap on suitable straights; it is not race DRS.');
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
    button.addEventListener('click', () => {
        if (!ready)
            return;
        const action = button.dataset.action;
        if (action === 'camera')
            game.cycleCamera();
        if (action === 'recover')
            game.recoverCar();
        if (action === 'pause')
            game.setPaused(true);
        if (action === 'mute') {
            muted = game.toggleMute();
            button.classList.toggle('muted', muted);
            button.setAttribute('aria-pressed', String(muted));
            button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
        }
        button.blur();
    }, { signal });
});
for (const button of document.querySelectorAll<HTMLButtonElement>('.touch-btn')) {
    const isReverse = button.hasAttribute('data-reverse');
    const key = isReverse ? 'reverse' : button.hasAttribute('data-gas') ? 'throttle' : button.hasAttribute('data-brake') ? 'brake' : 'steer';
    const value = key === 'steer' ? Number(button.dataset.steer) : 1;
    const release = (event: PointerEvent) => {
        activeSteers.delete(event.pointerId);
        if (isReverse) {
            reverseHeld = false;
            setTouchInput({ brake: brakeHeld ? 1 : 0, allowReverse: false });
        }
        else if (key === 'brake') {
            brakeHeld = false;
            setTouchInput({ brake: reverseHeld ? 1 : 0, allowReverse: reverseHeld });
        }
        else {
            setTouchInput({ [key]: key === 'steer' ? [...activeSteers.values()].reduce((a, b) => a + b, 0) : 0 });
        }
        button.classList.remove('pressed');
    };
    button.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (session !== 'race')
            return;
        button.setPointerCapture(event.pointerId);
        if (isReverse) {
            reverseHeld = true;
            setTouchInput({ brake: 1, allowReverse: true });
        }
        else {
            if (key === 'steer')
                activeSteers.set(event.pointerId, value);
            if (key === 'brake')
                brakeHeld = true;
            setTouchInput({ [key]: key === 'steer' ? [...activeSteers.values()].reduce((a, b) => a + b, 0) : value, ...(key === 'brake' ? { allowReverse: reverseHeld } : {}) });
        }
        button.classList.add('pressed');
    }, { signal });
    button.addEventListener('pointerup', release, { signal });
    button.addEventListener('pointercancel', release, { signal });
    button.addEventListener('lostpointercapture', release, { signal });
}
window.addEventListener('blur', () => { activeSteers.clear(); clearTouch(); if (ready && session === 'race')
    game.setPaused(true); }, { signal });
document.addEventListener('visibilitychange', () => { if (document.hidden) {
    activeSteers.clear();
    clearTouch();
    if (ready && session === 'race')
        game.setPaused(true);
} }, { signal });
const gamepadActions = new GamepadActions({
    getSession: () => session,
    isReady: () => ready,
    overlay,
    primary,
    pause: pauseButton,
    camera: cameraButton,
    recover: recoverButton,
    onActiveDisconnect: () => { if (ready && session === 'race')
        game.setPaused(true); },
});
// Keep keyboard navigation inside the visible session dialog.
overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab')
        return;
    const focusable = [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href]')].filter(el => !el.hidden);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
    }
}, { signal });
game.init().then(() => {
    if (signal.aborted)
        return;
    ready = true;
    game.setPaused(true);
    game.start();
    primary.disabled = false;
    primary.innerHTML = 'START RACE <span>↗</span>';
    hideLoading();
    const rivals = document.querySelector<HTMLButtonElement>('[data-difficulty].active')?.dataset.difficulty as OpponentDifficulty | undefined;
    if (rivals)
        document.querySelector('#rival-description')!.textContent = rivalDescriptions[rivals];
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('go')) {
        showSession('race');
        game.beginSession();
    }
    else
        primary.focus({ preventScroll: true });
}).catch(error => {
    if (signal.aborted)
        return;
    console.error(error);
    hideLoading();
    primary.textContent = 'RELOAD TO TRY AGAIN';
    primary.disabled = false;
    description.textContent = 'The circuit could not load. Reload the page to retry.';
    primary.addEventListener('click', () => location.reload(), { once: true, signal });
});
if (import.meta.hot)
    import.meta.hot.dispose(() => { events.abort(); gamepadActions.dispose(); game.dispose(); });
