import './styles.css';
import './selection.css';
import { LAYOUT_CHOICES, SELECTION_CIRCUITS, STAGE_CHOICES, type SelectionLayout, type SelectionStage } from './game/track/selectionCatalog';
import { SELECTION_MAPS } from './game/track/selectionMaps';

const body = document.body;
const stages = document.querySelector<HTMLElement>('#select-stages')!;
const circuits = document.querySelector<HTMLElement>('#select-circuits')!;
const selectedName = document.querySelector<HTMLElement>('#selection-name')!;
const launch = document.querySelector<HTMLButtonElement>('#selection-launch')!;
const stageDescription = document.querySelector<HTMLElement>('#selection-stage-description')!;
const scene = document.querySelector<HTMLElement>('#selection-scene')!;

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

async function showScene(nextStage: SelectionStage): Promise<void> {
  if (sceneStage === nextStage) return;
  sceneStage = nextStage;
  const picture = new Image();
  picture.alt = '';
  picture.className = 'selection-scene-image';
  picture.decoding = 'async';
  picture.fetchPriority = 'high';
  picture.sizes = '(max-width: 600px) 800px, (max-width: 900px) 1200px, 100vw';
  picture.srcset = `/menu/${nextStage}-small.webp 800w, /menu/${nextStage}.webp 1600w`;
  picture.src = `/menu/${nextStage}.webp`;
  try { await picture.decode(); } catch { return; }
  if (sceneStage !== nextStage) return;
  const previous = scene.lastElementChild;
  scene.append(picture);
  requestAnimationFrame(() => picture.classList.add('is-visible'));
  window.setTimeout(() => previous?.remove(), 450);
}

function render(): void {
  body.dataset.selectedStage = stage;
  stages.innerHTML = STAGE_CHOICES.map(option => `
    <button type="button" class="selection-stage ${option.id === stage ? 'is-selected' : ''}" data-select-stage="${option.id}" aria-pressed="${option.id === stage}">
      <img src="/menu/${option.id}-thumb.webp" alt="" width="320" height="200" decoding="async" />
      <span class="selection-stage-code">${option.code}</span>
      <span class="selection-stage-caption"><strong>${option.name}</strong><small>${option.tagline}</small></span>
      <span class="selection-stage-indicator" aria-hidden="true"></span>
    </button>`).join('');
  const currentStage = STAGE_CHOICES.find(option => option.id === stage)!;
  document.querySelector('#selection-stage-prefix')!.textContent = currentStage.prefix;
  document.querySelector('#selection-stage-number')!.textContent = currentStage.code;
  document.querySelector('#selection-conditions')!.textContent = currentStage.conditions;
  stageDescription.textContent = currentStage.description;
  circuits.innerHTML = LAYOUT_CHOICES.map((option, index) => `
    <button type="button" class="selection-circuit ${option.id === layout ? 'is-selected' : ''}" data-select-layout="${option.id}" aria-pressed="${option.id === layout}">
      <span class="selection-route-number">0${index + 1}</span><strong>${option.name}</strong><span class="selection-route-radio" aria-hidden="true"></span>
    </button>`).join('');
  const selectedLayout = LAYOUT_CHOICES.find(option => option.id === layout)!;
  const map = SELECTION_MAPS[layout];
  document.querySelector('#selection-map')!.innerHTML = `<svg viewBox="0 0 280 180" role="img" aria-label="${selectedLayout.name} circuit layout"><path class="selection-map-shadow" d="${map.path}"/><path class="selection-map-road" d="${map.path}"/><circle class="selection-map-start" cx="${map.start[0]}" cy="${map.start[1]}" r="4"/></svg><span class="selection-map-caption"><i></i> START / FINISH</span>`;
  document.querySelector('#selection-length')!.textContent = selectedLayout.length;
  document.querySelector('#selection-corners')!.textContent = String(selectedLayout.corners);
  document.querySelector('#selection-route-description')!.textContent = selectedLayout.description;
  selectedName.textContent = `${currentStage.name} · ${selectedLayout.name}`;
}

async function startGame(): Promise<void> {
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
  body.dataset.boot = 'loading';
  try {
    await import('./main');
  } catch (error) {
    console.error('Could not load the race', error);
    body.dataset.boot = 'select';
    render();
    void showScene(stage);
    started = false;
    loadFailed = true;
    launch.disabled = false;
    document.querySelector<HTMLElement>('#selection-error')!.textContent = 'The race could not load. Reload to try again.';
    launch.querySelector('span')!.textContent = 'RELOAD RACE';
    launch.focus({ preventScroll: true });
  }
}

stages.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-select-stage]');
  if (!button) return;
  stage = button.dataset.selectStage as SelectionStage;
  render();
  void showScene(stage);
  stages.querySelector<HTMLButtonElement>(`[data-select-stage="${stage}"]`)?.focus();
});
circuits.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-select-layout]');
  if (!button) return;
  layout = button.dataset.selectLayout as SelectionLayout;
  render();
  circuits.querySelector<HTMLButtonElement>(`[data-select-layout="${layout}"]`)?.focus();
});
launch.addEventListener('click', () => void startGame());

// Circuit links already contain a race decision and remain shareable entry
// points. The plain home page waits for a deliberate stage/layout choice.
if (linkedCircuit !== null) {
  void startGame();
} else {
  render();
  document.title = 'GridPunk — Choose your race';
  body.dataset.boot = 'select';
  void showScene(stage);
}
