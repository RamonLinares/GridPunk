import './styles.css';
import './selection.css';
import { CIRCUIT_TITLES, LAYOUT_CHOICES, SELECTION_CIRCUITS, STAGE_CHOICES, type SelectionLayout, type SelectionStage } from './game/track/selectionCatalog';
import { SELECTION_MAPS } from './game/track/selectionMaps';

const body = document.body;
const menu = document.querySelector<HTMLElement>('#stage-select')!;
const stages = document.querySelector<HTMLElement>('#select-stages')!;
const circuits = document.querySelector<HTMLElement>('#select-circuits')!;
const selectedName = document.querySelector<HTMLElement>('#selection-name')!;
const launch = document.querySelector<HTMLButtonElement>('#selection-launch')!;
const stageDescription = document.querySelector<HTMLElement>('#selection-stage-description')!;
const scene = document.querySelector<HTMLElement>('#selection-scene')!;
const title = document.querySelector<HTMLElement>('#selection-title')!;
const soundToggle = document.querySelector<HTMLButtonElement>('#selection-sound')!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const params = new URLSearchParams(location.search);
const linkedCircuit = params.get('circuit');
const linkedStage = params.get('stage');
const match = Object.entries(SELECTION_CIRCUITS).flatMap(([stage, layouts]) =>
  Object.entries(layouts).map(([layout, id]) => ({ stage: stage as SelectionStage, layout: layout as SelectionLayout, id }))
).find(option => option.id === linkedCircuit);
let stage: SelectionStage = STAGE_CHOICES.some(option => option.id === linkedStage)
  ? linkedStage as SelectionStage : match?.stage ?? 'cyberpunk';
let layout: SelectionLayout = match?.layout ?? 'neon';
let started = false;
let loadFailed = false;
let sceneStage: SelectionStage | undefined;

// ---------------------------------------------------------------------------
// Menu sound: a few synthesised UI cues, no audio files to download.
// ---------------------------------------------------------------------------
const SOUND_KEY = 'gridpunk:menu-sound';
let soundOn = true;
try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch { /* storage blocked */ }
let audio: AudioContext | undefined;

function audioContext(): AudioContext | undefined {
  if (!soundOn) return undefined;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return undefined;
  audio ??= new Context();
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

function tone(type: OscillatorType, from: number, to: number, duration: number, level: number, delay = 0): void {
  const ctx = audioContext();
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function whoosh(duration: number, from: number, to: number, level: number): void {
  const ctx = audioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  noise.buffer = buffer;
  filter.type = 'bandpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + duration * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(t);
}

const sfx = {
  move: () => { tone('square', 1500, 1100, 0.045, 0.025); },
  stage: () => { whoosh(0.34, 420, 3200, 0.11); tone('sine', 110, 55, 0.22, 0.12); },
  launch: () => {
    whoosh(0.6, 300, 5200, 0.16);
    tone('sawtooth', 90, 480, 0.5, 0.05);
    tone('sine', 70, 38, 0.45, 0.22, 0.08);
    tone('triangle', 880, 1760, 0.18, 0.05, 0.05);
  },
};

function setSound(on: boolean): void {
  soundOn = on;
  soundToggle.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
}
setSound(soundOn);
soundToggle.addEventListener('click', () => { setSound(!soundOn); sfx.move(); });

// ---------------------------------------------------------------------------
// Backdrop art, atmosphere and parallax.
// ---------------------------------------------------------------------------
async function showScene(nextStage: SelectionStage): Promise<void> {
  if (sceneStage === nextStage) return;
  sceneStage = nextStage;
  const picture = new Image();
  picture.alt = '';
  picture.className = 'selection-scene-image';
  picture.decoding = 'async';
  picture.fetchPriority = 'high';
  picture.sizes = '(max-width: 900px) 960px, 100vw';
  picture.srcset = `/menu/${nextStage}-small.webp 960w, /menu/${nextStage}.webp 1920w`;
  picture.src = `/menu/${nextStage}.webp`;
  try { await picture.decode(); } catch { return; }
  if (sceneStage !== nextStage) return;
  const previous = [...scene.children];
  scene.append(picture);
  requestAnimationFrame(() => picture.classList.add('is-visible'));
  window.setTimeout(() => previous.forEach(node => node.remove()), 900);
}

type Particle = { x: number; y: number; vx: number; vy: number; size: number; life: number; seed: number };
const fx = document.querySelector<HTMLCanvasElement>('#selection-fx')!;
const fxContext = fx.getContext('2d');
let particles: Particle[] = [];
let particleStage: SelectionStage | undefined;
let fxFrame = 0;
let lastFx = 0;

function spawn(kind: SelectionStage, width: number, height: number, anywhere: boolean): Particle {
  const seed = Math.random();
  if (kind === 'cyberpunk') {
    return { x: Math.random() * width * 1.2, y: anywhere ? Math.random() * height : -40, vx: -140, vy: 900 + seed * 700, size: 10 + seed * 22, life: 1, seed };
  }
  if (kind === 'solarpunk') {
    return { x: Math.random() * width, y: anywhere ? Math.random() * height : height + 10, vx: 8 + seed * 14, vy: -(10 + seed * 22), size: seed < .12 ? 5 + seed * 40 : 1 + seed * 2.4, life: 1, seed };
  }
  return { x: Math.random() * width, y: anywhere ? Math.random() * height : height + 10, vx: 18 + seed * 30, vy: -(40 + seed * 90), size: .8 + seed * 2.2, life: anywhere ? Math.random() : 1, seed };
}

function drawFx(now: number): void {
  fxFrame = requestAnimationFrame(drawFx);
  if (!fxContext || document.hidden) return;
  const dt = Math.min(0.05, (now - (lastFx || now)) / 1000);
  lastFx = now;
  const ratio = Math.min(devicePixelRatio || 1, 1.5);
  const width = fx.clientWidth, height = fx.clientHeight;
  if (fx.width !== Math.round(width * ratio) || fx.height !== Math.round(height * ratio)) {
    fx.width = Math.round(width * ratio);
    fx.height = Math.round(height * ratio);
  }
  const kind = stage;
  const count = kind === 'cyberpunk' ? Math.round(width / 5) : kind === 'solarpunk' ? Math.round(width / 22) : Math.round(width / 16);
  if (particleStage !== kind) {
    particleStage = kind;
    particles = Array.from({ length: count }, () => spawn(kind, width, height, true));
  }
  const ctx = fxContext;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++) {
    let p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (kind === 'cyberpunk') {
      if (p.y > height + 40) p = particles[i] = spawn(kind, width, height, false);
      const alpha = 0.08 + p.seed * 0.22;
      ctx.strokeStyle = `rgba(170,215,255,${alpha})`;
      ctx.lineWidth = p.seed > .85 ? 1.4 : .8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.018 * (p.size / 20), p.y - p.size);
      ctx.stroke();
    } else if (kind === 'solarpunk') {
      p.x += Math.sin(now / 1400 + p.seed * 40) * 12 * dt;
      if (p.y < -60 || p.x > width + 60) p = particles[i] = spawn(kind, width, height, false);
      const big = p.size > 4;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (big ? 1 : 3));
      glow.addColorStop(0, big ? 'rgba(255,244,200,.10)' : 'rgba(255,250,215,.7)');
      glow.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (big ? 1 : 3), 0, Math.PI * 2);
      ctx.fill();
    } else {
      p.life -= dt * (0.18 + p.seed * 0.2);
      p.x += Math.sin(now / 500 + p.seed * 30) * 20 * dt;
      if (p.life <= 0 || p.y < -20) p = particles[i] = spawn(kind, width, height, false);
      const flicker = 0.55 + 0.45 * Math.sin(now / 90 + p.seed * 60);
      const alpha = Math.max(0, Math.min(1, p.life * 1.4)) * flicker;
      ctx.fillStyle = `rgba(255,${150 + Math.round(p.seed * 70)},70,${alpha * 0.9})`;
      ctx.shadowColor = 'rgba(255,140,40,.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function startFx(): void {
  if (reducedMotion.matches || fxFrame) return;
  fxFrame = requestAnimationFrame(drawFx);
}
function stopFx(): void {
  cancelAnimationFrame(fxFrame);
  fxFrame = 0;
}

let parallaxFrame = 0;
menu.addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType !== 'mouse' || parallaxFrame) return;
  parallaxFrame = requestAnimationFrame(() => {
    parallaxFrame = 0;
    menu.style.setProperty('--px', ((event.clientX / innerWidth) * 2 - 1).toFixed(3));
    menu.style.setProperty('--py', ((event.clientY / innerHeight) * 2 - 1).toFixed(3));
  });
});

// ---------------------------------------------------------------------------
// Rendering the selection.
// ---------------------------------------------------------------------------
function countUp(element: HTMLElement, value: string): void {
  const target = Number(value), decimals = value.split('.')[1]?.length ?? 0;
  if (reducedMotion.matches || !Number.isFinite(target)) { element.textContent = value; return; }
  const begin = performance.now(), duration = 520;
  const step = (now: number) => {
    const t = Math.min(1, (now - begin) / duration), eased = 1 - Math.pow(1 - t, 3);
    element.textContent = t < 1 ? (target * eased).toFixed(decimals) : value;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function replay(element: Element, className: string): void {
  element.classList.remove(className);
  void (element as HTMLElement).offsetWidth;
  element.classList.add(className);
}

let renderedStage: SelectionStage | undefined;
let renderedLayout: SelectionLayout | undefined;

function render(): void {
  body.dataset.selectedStage = stage;
  const currentStage = STAGE_CHOICES.find(option => option.id === stage)!;
  const selectedLayout = LAYOUT_CHOICES.find(option => option.id === layout)!;

  if (renderedStage !== stage) {
    stages.innerHTML = STAGE_CHOICES.map(option => `
      <button type="button" class="selection-stage ${option.id === stage ? 'is-selected' : ''}" data-select-stage="${option.id}" aria-pressed="${option.id === stage}" aria-label="${option.name}: ${option.description}">
        <span class="selection-stage-art"><img src="/menu/${option.id}-thumb.webp" alt="" width="480" height="270" decoding="async" /></span>
        <span class="selection-stage-code">${option.code}</span>
        <span class="selection-stage-caption"><strong>${option.name}</strong><small>${option.tagline}</small></span>
        <span class="selection-stage-check" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="m2 6.5 2.6 2.5L10 3.5"/></svg></span>
      </button>`).join('');
    document.querySelector('#selection-stage-prefix')!.textContent = currentStage.prefix;
    document.querySelector('#selection-stage-number')!.textContent = currentStage.code;
    document.querySelector('#selection-ghost-number')!.textContent = currentStage.code;
    stageDescription.textContent = currentStage.description;
    document.querySelector('#selection-conditions')!.innerHTML = [
      ['TIME', currentStage.time], ['WEATHER', currentStage.weather], ['SURFACE', currentStage.surface],
    ].map(([label, value]) => `<li><span>${label}</span><b>${value}</b></li>`).join('');
    if (renderedStage) {
      replay(title, 'is-entering');
      replay(menu, 'is-switching');
    }
    renderedStage = stage;
  }

  if (renderedLayout !== layout) {
    circuits.innerHTML = LAYOUT_CHOICES.map(option => {
      const map = SELECTION_MAPS[option.id];
      return `
      <button type="button" class="selection-circuit ${option.id === layout ? 'is-selected' : ''}" data-select-layout="${option.id}" aria-pressed="${option.id === layout}">
        <svg class="selection-circuit-icon" viewBox="0 0 280 180" aria-hidden="true"><path d="${map.path}"/></svg>
        <span class="selection-circuit-copy"><strong>${option.name}</strong><small>${option.length} KM · ${option.corners} T</small></span>
      </button>`;
    }).join('');
    const map = SELECTION_MAPS[layout];
    const lapSeconds = 6.5 * Number(selectedLayout.length) / 3.744;
    document.querySelector('#selection-map')!.innerHTML = `
      <svg viewBox="0 0 280 180" role="img" aria-label="${selectedLayout.name} circuit layout">
        <path id="selection-map-line" class="selection-map-shadow" d="${map.path}"/>
        <path class="selection-map-road" d="${map.path}" pathLength="1"/>
        <path class="selection-map-glow" d="${map.path}" pathLength="1"/>
        <g class="selection-map-start" transform="translate(${map.start[0]} ${map.start[1]})"><rect x="-6" y="-2.5" width="12" height="5"/><path d="M-6-2.5h3v2.5h-3zm6 0h3v2.5h-3zm-3 2.5h3v2.5h-3zm6 0h3v2.5h-3z"/></g>
        <g class="selection-map-car"><circle r="7" class="selection-map-car-halo"/><circle r="3.2"/>
          <animateMotion dur="${lapSeconds}s" repeatCount="indefinite" rotate="auto"><mpath href="#selection-map-line"/></animateMotion></g>
      </svg>
      <span class="selection-map-caption"><i></i> START / FINISH</span>
      <span class="selection-map-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
    countUp(document.querySelector('#selection-length')!, selectedLayout.length);
    countUp(document.querySelector('#selection-corners')!, String(selectedLayout.corners));
    document.querySelector('#selection-route-description')!.textContent = selectedLayout.description;
    renderedLayout = layout;
  }
  selectedName.textContent = `${currentStage.name} · ${selectedLayout.name}`;
}

function selectStage(next: SelectionStage, focus = true): void {
  if (started) return;
  if (next !== stage) {
    stage = next;
    sfx.stage();
    render();
    void showScene(stage);
  }
  if (focus) stages.querySelector<HTMLButtonElement>(`[data-select-stage="${stage}"]`)?.focus({ preventScroll: true });
}
function selectLayout(next: SelectionLayout, focus = true): void {
  if (started) return;
  if (next !== layout) {
    layout = next;
    sfx.move();
    render();
  }
  if (focus) circuits.querySelector<HTMLButtonElement>(`[data-select-layout="${layout}"]`)?.focus({ preventScroll: true });
}
function stepStage(direction: number): void {
  const index = STAGE_CHOICES.findIndex(option => option.id === stage);
  selectStage(STAGE_CHOICES[(index + direction + STAGE_CHOICES.length) % STAGE_CHOICES.length].id);
}
function stepLayout(direction: number): void {
  const index = LAYOUT_CHOICES.findIndex(option => option.id === layout);
  selectLayout(LAYOUT_CHOICES[(index + direction + LAYOUT_CHOICES.length) % LAYOUT_CHOICES.length].id);
}

// ---------------------------------------------------------------------------
// Launch.
// ---------------------------------------------------------------------------
const LOADING_TIPS = [
  'Press C to change camera. R puts you back on the track.',
  'Brake in a straight line, then turn in. Carry the speed out of the corner.',
  'Controllers work everywhere: triggers for throttle and brake, Start to pause.',
  'Esc pauses the race. The pause menu also holds graphics quality and rival difficulty.',
  'Watch the lap delta under your time: green means you are gaining.',
  'Watch Last Lap replays your lap with cinematic cameras, and saves it as a GIF or MP4.',
];

// Fill the loading card from menu data, before any race code is fetched.
function prepareLoading(id: string): void {
  const currentStage = STAGE_CHOICES.find(option => option.id === stage)!;
  const selectedLayout = LAYOUT_CHOICES.find(option => option.id === layout)!;
  const map = SELECTION_MAPS[layout];
  body.dataset.selectedStage = stage;
  document.querySelector('#loading-world')!.textContent = `${currentStage.name.toUpperCase()} · WORLD ${currentStage.code}`;
  document.querySelector('#loading-conditions')!.textContent = `${currentStage.time} · ${currentStage.weather}`;
  document.querySelector('#loading-title')!.textContent = CIRCUIT_TITLES[id] ?? selectedLayout.name;
  document.querySelector('#loading-specs')!.textContent = `${selectedLayout.length} KM · ${selectedLayout.corners} CORNERS · 3 LAPS · 6 CARS`;
  document.querySelector('#loading-tip')!.textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
  document.querySelector('#loading-map')!.innerHTML = `<svg viewBox="0 0 280 180"><path id="loading-map-line" class="map-base" d="${map.path}"/><path class="map-line" d="${map.path}" pathLength="1"/><g><circle class="map-halo" r="7"/><circle class="map-car" r="3.2"/><animateMotion dur="${6.5 * Number(selectedLayout.length) / 3.744}s" repeatCount="indefinite"><mpath href="#loading-map-line"/></animateMotion></g></svg>`;
  const art = document.querySelector<HTMLImageElement>('#loading-art')!;
  art.onload = () => art.classList.add('is-ready');
  art.sizes = '(max-width: 900px) 960px, 100vw';
  art.srcset = `/menu/${stage}-small.webp 960w, /menu/${stage}.webp 1920w`;
  art.src = `/menu/${stage}.webp`;
}

async function startGame(fromMenu = true): Promise<void> {
  if (started) return;
  started = true;
  launch.disabled = true;
  const id = SELECTION_CIRCUITS[stage][layout];
  const url = new URL(location.href);
  url.searchParams.set('stage', stage);
  url.searchParams.set('circuit', id);
  history.replaceState(null, '', url);
  // A failed ES module import stays failed in the browser's module cache.
  // Reloading resolves a fresh entry bundle after a deployment or interruption.
  if (loadFailed) { location.reload(); return; }
  if (fromMenu) {
    sfx.launch();
    menu.classList.add('is-launching');
    if (!reducedMotion.matches) await new Promise(resolve => window.setTimeout(resolve, 620));
  }
  stopFx();
  stopPad();
  prepareLoading(id);
  body.dataset.boot = 'loading';
  try {
    await import('./main');
  } catch (error) {
    console.error('Could not load the race', error);
    menu.classList.remove('is-launching');
    body.dataset.boot = 'select';
    render();
    void showScene(stage);
    startFx();
    startPad();
    started = false;
    loadFailed = true;
    launch.disabled = false;
    document.querySelector<HTMLElement>('#selection-error')!.textContent = 'The race could not load. Reload to try again.';
    launch.querySelector('span')!.textContent = 'RELOAD RACE';
    launch.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------------------
// Input: pointer, keyboard and standard gamepads.
// ---------------------------------------------------------------------------
const inputLabel = document.querySelector<HTMLElement>('#selection-input')!;
function setInputMode(mode: 'keys' | 'pad', name = ''): void {
  if (body.dataset.menuInput === mode) return;
  body.dataset.menuInput = mode;
  document.querySelectorAll<HTMLElement>('.key-hint').forEach(hint => { hint.textContent = mode === 'pad' ? hint.dataset.pad! : hint.dataset.key!; });
  inputLabel.textContent = mode === 'pad' ? `CONTROLLER${name ? ' CONNECTED' : ''}` : '';
}

stages.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-select-stage]');
  if (button) selectStage(button.dataset.selectStage as SelectionStage);
});
circuits.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-select-layout]');
  if (button) selectLayout(button.dataset.selectLayout as SelectionLayout);
});
launch.addEventListener('click', () => void startGame());
menu.addEventListener('pointerover', event => {
  const target = (event.target as HTMLElement).closest('button:not(:disabled)');
  const from = (event.relatedTarget as HTMLElement | null)?.closest?.('button');
  if (target && target !== from && event.pointerType === 'mouse') sfx.move();
});

document.addEventListener('keydown', event => {
  if (body.dataset.boot !== 'select' || event.metaKey || event.ctrlKey || event.altKey) return;
  setInputMode('keys');
  const key = event.key.toLowerCase();
  const onLink = (event.target as HTMLElement).closest('a, #selection-sound');
  if (key === 'q' || key === 'arrowleft') { event.preventDefault(); stepStage(-1); }
  else if (key === 'e' || key === 'arrowright') { event.preventDefault(); stepStage(1); }
  else if (key === 'arrowup' || key === 'w') { event.preventDefault(); stepLayout(-1); }
  else if (key === 'arrowdown' || key === 's') { event.preventDefault(); stepLayout(1); }
  else if (key === 'enter' && !onLink && !event.repeat) { event.preventDefault(); void startGame(); }
});

let padFrame = 0;
const padHeld = new Map<string, number>();
function padPoll(now: number): void {
  padFrame = requestAnimationFrame(padPoll);
  const pad = [...(navigator.getGamepads?.() ?? [])].find((candidate): candidate is Gamepad => !!candidate && candidate.connected);
  if (!pad) return;
  const pressed = (index: number) => !!pad.buttons[index]?.pressed;
  const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
  const actions: Record<string, [boolean, () => void, boolean]> = {
    prevStage: [pressed(4) || pressed(14) || x < -0.6, () => stepStage(-1), true],
    nextStage: [pressed(5) || pressed(15) || x > 0.6, () => stepStage(1), true],
    prevLayout: [pressed(12) || y < -0.6, () => stepLayout(-1), true],
    nextLayout: [pressed(13) || y > 0.6, () => stepLayout(1), true],
    launch: [pressed(0) || pressed(9), () => void startGame(), false],
  };
  for (const [name, [down, run, repeats]] of Object.entries(actions)) {
    const since = padHeld.get(name);
    if (!down) { padHeld.delete(name); continue; }
    if (since === undefined) {
      padHeld.set(name, now);
      setInputMode('pad', pad.id);
      run();
    } else if (repeats && now - since > 420) {
      padHeld.set(name, now - 420 + 170);
      run();
    }
  }
}
function startPad(): void { if (!padFrame) padFrame = requestAnimationFrame(padPoll); }
function stopPad(): void { cancelAnimationFrame(padFrame); padFrame = 0; }
addEventListener('gamepadconnected', event => { if (!started) setInputMode('pad', (event as GamepadEvent).gamepad.id); });
addEventListener('gamepaddisconnected', () => setInputMode('keys'));

// Circuit links already contain a race decision and remain shareable entry
// points. The plain home page waits for a deliberate stage/layout choice.
if (linkedCircuit !== null) {
  void startGame(false);
} else {
  setInputMode('keys');
  render();
  document.title = 'GridPunk — Choose your race';
  body.dataset.boot = 'select';
  menu.classList.add('is-intro');
  window.setTimeout(() => menu.classList.remove('is-intro'), 2200);
  void showScene(stage);
  startFx();
  startPad();
}
