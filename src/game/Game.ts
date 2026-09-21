import { NEON_TUNNEL, neonRainExposure } from './track/NeonProfile';
import { createKairoCityBridge } from './KairoCityBridge';
import { selectedCircuit } from './track/circuits';
import * as THREE from 'three';
import { disposeObject3D } from '../utils/dispose';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Car } from '../entities/Car';
import { preloadNeonCarModel } from '../entities/NeonCarModel';
import { preloadShinseiCarModel } from '../entities/ShinseiCarModel';
import { selectedNeonVehicle } from '../entities/NeonVehicleChoice';
import { createEnvironment, type EnvironmentHandles } from './Environment';
import { createTrackside } from './track/Trackside';
import { createMaterials, type MaterialLibrary } from './Materials';
import { TrackBuilder } from './track/TrackBuilder';
import { TrackSpline } from './track/TrackSpline';
import { CameraRig } from '../systems/CameraRig';
import { LapReplayRecorder, capturePoses, applyPoses, replayMotion } from '../systems/LapReplay';
import { ReplayDirector } from '../systems/ReplayDirector';
import { Hud } from '../systems/Hud';
import { Timing } from '../systems/Timing';
import { readPersonalBest, savePersonalBest } from '../systems/PersonalBests';
import { AudioSystem } from '../systems/AudioSystem';
import { AiDriver, AI_DIFFICULTY_PACE, type OpponentDifficulty } from '../systems/AiDriver';
import { CarContacts } from '../systems/CarContacts';
import type { VehicleInput } from '../systems/VehiclePhysics';
import { PostProcessing } from '../systems/PostProcessing';
import { MapOverlay } from '../systems/MapOverlay';
import { DrivingGuide } from '../systems/DrivingGuide';
import { VfxSystem } from '../systems/Vfx';
import { QualityController, type QualityPreset } from '../systems/QualityController';
export class Game {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera: THREE.PerspectiveCamera;
    private materials!: MaterialLibrary;
    private spline!: TrackSpline;
    private builder!: TrackBuilder;
    private environment!: EnvironmentHandles;
    private tracksideGroup!: THREE.Group;
    private car!: Car;
    private readonly input = new InputController();
    private cameraRig!: CameraRig;
    private hud!: Hud;
    private timing!: Timing;
    private readonly audio = new AudioSystem('rain');
    private post!: PostProcessing;
    private vfx!: VfxSystem;
    private guide!: DrivingGuide;
    private environmentMap?: THREE.WebGLRenderTarget;
    private readonly progressCache = { index: 0 };
    private readonly contactShadows: {
        mesh: THREE.Mesh;
        car: Car;
    }[] = [];
    private readonly rivals: {
        car: Car;
        number: number;
        ai: AiDriver;
        race: number;
        prev: number;
        progCache: {
            index: number;
        };
    }[] = [];
    private playerRace = 0;
    private readonly contacts = new CarContacts();
    private simulationAccumulator = 0;
    private simulationCars: Car[] = [];
    private simulationBodies: Car['physics'][] = [];
    private simulationTraffic: {
        position: THREE.Vector3;
        speed: number;
    }[] = [];
    private simulationOpponents: {
        position: THREE.Vector3;
        speed: number;
    }[][] = [];
    private readonly simulationInputs: VehicleInput[] = [];
    private readonly heldInput: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    private playerPrev = 0;
    private position = 1;
    private opponentDifficulty: OpponentDifficulty = 'normal';
    private personalBest: number | null = null;
    private newPersonalBest = false;
    private readonly loop = new Loop((delta, elapsed) => this.update(delta, elapsed), () => this.render());
    private readonly devMode = import.meta.env.DEV;
    private readonly overview = typeof location !== 'undefined' && location.search.includes('overview');
    // True top-down camera for inspecting track and terrain geometry.
    private readonly mapCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 9000);
    private mapMode = false;
    private mapZoom = 1;
    private mapBounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    private mapOverlay?: MapOverlay;
    private mapGrid = true;
    // 0 = both, 1 = translucent procedural surfaces, 2 = procedural surfaces hidden.
    private mapSurface = 0;
    private readonly surfaceMatState = new Map<THREE.Material, {
        transparent: boolean;
        opacity: number;
        depthWrite: boolean;
    }>();
    private readonly startAt = typeof location !== 'undefined' && new URLSearchParams(location.search).has('at')
        ? Number(new URLSearchParams(location.search).get('at'))
        : NaN;
    private frame = 0;
    private elapsed = 0;
    private countdown = 3.999;
    private started = false;
    private paused = false;
    private readonly replayRecorder = new LapReplayRecorder();
    private replay?: {
        director: ReplayDirector;
        time: number;
        playing: boolean;
        exporting: boolean;
        saved: Float64Array;
        hidden: [
            THREE.Object3D,
            boolean
        ][];
        fov: number;
        cameraMode: CameraRig['mode'];
    };
    private exportSize?: {
        width: number;
        height: number;
    };
    private manualReplayRender = false;
    private driftTime = 0;
    private lastCollisionSound = 0;
    private finished = false;
    private measuredFps = 60;
    private lastFrameTime = 0;
    private lastPositionCallout = 0;
    private readonly frameTimes = new Float32Array(600);
    private frameTimeIndex = 0;
    private frameTimeCount = 0;
    private frameStats = { samples: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, over33Ms: 0 };
    private readonly onResize = () => this.syncSize();
    private readonly onVisibility = () => {
        if (document.hidden)
            this.setPaused(true);
    };
    private offTrackTime = 0;
    constructor(private readonly canvas: HTMLCanvasElement) {
        this.renderer = createRenderer(canvas);
        this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 5000);
        this.renderer.info.autoReset = false;
        const forceQuality = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hq');
        this.qualityController = new QualityController(forceQuality ? 'quality' : this.loadQualityPreset());
        resizeRenderer(this.renderer, this.camera, 1.25);
    }
    /**
     * Builds the world in stages, yielding to the browser between each so the page
     * stays responsive (the previous fully-synchronous build froze the tab).
     */
    async init(): Promise<void> {
        await yieldToBrowser();
        this.audio.prepare();
        await yieldToBrowser();
        this.materials = createMaterials();
        await yieldToBrowser();
        this.spline = new TrackSpline(selectedCircuit());
        {
            this.renderer.toneMapping = THREE.AgXToneMapping;
            this.materials.asphalt.color.setHex(0x8196a4);
            this.materials.asphalt.roughness = .48;
            this.materials.asphalt.metalness = .10;
            this.materials.runoffAsphalt.color.setHex(0x263644);
            this.materials.barrier.color.setHex(0x344754);
        }
        this.builder = new TrackBuilder(this.spline, this.materials);
        this.scene.add(this.builder.group);
        if (this.spline.circuitId === 'kairo') this.scene.add(createKairoCityBridge(this.builder, this.materials));
        await yieldToBrowser();
        this.environment = createEnvironment(this.scene, this.builder, this.camera);
        await this.environment.ready;
        const trackside = createTrackside(this.builder, this.materials);
        this.scene.add(trackside.group);
        this.tracksideGroup = trackside.group;
        this.cullTrackObstacles();
        this.snapGroundProps();
        this.scene.fog = this.overview ? null : this.sceneFog();
        await yieldToBrowser();
        const neonVehicle = selectedNeonVehicle();
        {
            // Both models are used by the mixed Neon grid, regardless of the player's choice.
            await Promise.all([preloadNeonCarModel(), preloadShinseiCarModel()]);
        }
        this.car = new Car(this.builder, {}, neonVehicle);
        // Human steering ergonomics (speed-weighted lock and time-to-lock). The
        // rivals' controller is tuned in raw wheel angle and keeps the default.
        this.car.physics.setDriverSteering(true);
        this.scene.add(this.car.group);
        const liveries = [
            { primary: 0x940b13, secondary: 0xffffff, accent: 0xffd400, number: 16 },
            { primary: 0x00a19c, secondary: 0x121212, accent: 0xffffff, number: 4 },
            { primary: 0xff6a00, secondary: 0x141414, accent: 0xffffff, number: 55 },
            { primary: 0x26262b, secondary: 0xd8d8d8, accent: 0xff2d2d, number: 77 },
            { primary: 0xf2f2f0, secondary: 0x0d2a6e, accent: 0xc8102e, number: 23 },
        ];
        liveries.forEach((livery, i) => {
            const rivalVehicle = i % 2 === 1 ? 'shinsei' : 'k89';
            const car = new Car(this.builder, livery, rivalVehicle);
            this.scene.add(car.group);
            const slot = this.builder.gridSlot(i);
            car.resetAt(slot.index, slot.lateral);
            const ai = new AiDriver(this.spline, slot.lateral, 15.2 + (i % 3) * 0.4, 92 + (i % 3) * 2);
            const startProg = this.spline.progressAt(car.physics.position, { index: slot.index });
            this.rivals.push({ car, number: livery.number, ai, race: 0, prev: startProg, progCache: { index: slot.index } });
        });
        await yieldToBrowser();
        const cameraObstructions: THREE.Object3D[] = [];
        this.scene.traverse(object => {
            if (object.name === 'neon-tunnel-shell' || object.name === 'kairo-flyover-deck')
                cameraObstructions.push(object);
        });
        this.cameraRig = new CameraRig(this.camera, cameraObstructions);
        this.hud = new Hud(this.spline);
        this.timing = new Timing(this.spline);
        this.resetCar();
        this.builder.updateStartLights(0, false); // Menu preview is not a start sequence.
        if (Number.isFinite(this.startAt)) {
            const index = Math.round((((this.startAt % 1) + 1) % 1) * this.spline.count);
            this.car.resetAt(index, -2.2);
            this.progressCache.index = index;
            this.playerPrev = this.spline.progressAt(this.car.physics.position, { index });
        }
        this.post = new PostProcessing(this.renderer, this.scene, this.camera);
        {
            const bounds = new THREE.Box3();
            for (const sample of this.spline.samples)
                bounds.expandByPoint(sample.position);
            bounds.expandByVector(new THREE.Vector3(420, 160, 420));
            bounds.min.y -= 60;
            this.post.setAmbientOcclusionBounds(bounds);
        }
        this.vfx = new VfxSystem(this.scene, (x, z, referenceY) => this.builder.surfaceHeightAt(x, z, referenceY));
        this.guide = new DrivingGuide(this.spline);
        this.scene.add(this.guide.group);
        // Every car gets the same ground contact treatment. The sun shadow can
        // extend away from the tyres, so retain a small soft occlusion beneath them.
        const contactMaterial = new THREE.MeshBasicMaterial({
            map: makeRadialShadow(), transparent: true, opacity: 0.55,
            depthWrite: false, color: 0x000000,
            // Asphalt uses -4/-4: without a matching decal bias it depth-occludes
            // this shadow at chase-camera angles, especially with sun shadows off.
            polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
        });
        for (const [index, car] of [this.car, ...this.rivals.map(rival => rival.car)].entries()) {
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 6.4, 4, 8), contactMaterial);
            mesh.name = `car-contact-shadow-${index}`;
            mesh.renderOrder = 2;
            this.contactShadows.push({ mesh, car });
            this.scene.add(mesh);
        }
        // Reflections come from the actual sky dome: one small cube render of the
        // sky shader through PMREM, so car paint, glass and wet-look asphalt
        // reflect the real sun, horizon glow and cloud deck of this circuit.
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const probe = this.environment.createSkyProbeScene();
        this.environmentMap = pmrem.fromScene(probe, 0, 0.1, 100);
        this.scene.environment = this.environmentMap.texture;
        probe.traverse(object => { (object as THREE.Mesh).geometry?.dispose(); });
        pmrem.dispose();
        await yieldToBrowser();
        this.setOpponentDifficulty(this.loadOpponentDifficulty(), false);
        this.input.onAction((action) => {
            if (this.replay) {
                if (action === 'pause')
                    document.dispatchEvent(new Event('replay:exit-request'));
                return;
            }
            if (action === 'reset')
                this.recoverCar();
            if (action === 'restart')
                this.restartSession();
            if (action === 'camera')
                this.cycleCamera();
            if (action === 'map' && this.devMode)
                this.toggleMap();
            if (action === 'grid' && this.devMode)
                this.toggleMapGrid();
            if (action === 'mapSurface' && this.devMode)
                this.cycleMapSurface();
            if (action === 'pause')
                this.togglePause();
        });
        if (this.devMode) {
            this.mapOverlay = new MapOverlay(this.canvas.parentElement ?? document.body);
        }
        // Every lit material is now in the scene; register them with the cascade
        // shadow shader before the first compile so no program is built twice.
        this.environment.prepareShadowMaterials(this.scene);
        // Small props and the cars only cast into the near cascades; the far map
        // covers most of the circuit and was drawing all of them for nothing.
        this.environment.sunLighting.installCasterTiers(this.renderer);
        this.environment.sunLighting.collectNearOnlyCasters(this.scene, [this.car.group, ...this.rivals.map(rival => rival.car.group)]);
        if (this.overview)
            this.environment.sunLighting.setRange(2800);
        this.applyQuality();
        this.dispatchQualityState();
        this.onResize();
        window.addEventListener('resize', this.onResize);
        document.addEventListener('visibilitychange', this.onVisibility);
        this.cameraRig.snap(this.car);
        // Prepare the actual grid, shadow map and enabled post passes while the
        // loading screen still owns readiness. A scene-only compile misses the
        // composer's target-specific programs and first texture/buffer uploads.
        // This render never advances physics, the countdown or adaptive sampling.
        this.environment.update(this.car.physics.position);
        this.environment.updateShadows();
        await this.post.prepare();
        await yieldToBrowser();
        this.publishDiagnostics();
        // Circuit bounds for the zenith map view.
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const s of this.spline.samples) {
            minX = Math.min(minX, s.position.x);
            maxX = Math.max(maxX, s.position.x);
            minZ = Math.min(minZ, s.position.z);
            maxZ = Math.max(maxZ, s.position.z);
        }
        this.mapBounds = { minX, maxX, minZ, maxZ };
        if (this.devMode) {
            this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
            if (typeof location !== 'undefined' && location.search.includes('map'))
                this.toggleMap();
            (window as unknown as {
                __game?: Game;
            }).__game = this;
        }
    }
    private readonly onWheel = (event: WheelEvent): void => {
        if (!this.mapMode)
            return;
        event.preventDefault();
        this.mapZoom = THREE.MathUtils.clamp(this.mapZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), 0.5, 16);
    };
    private toggleMap(): void {
        this.mapMode = !this.mapMode;
        this.mapZoom = 1;
        if (this.mapMode) {
            this.scene.fog = null;
            this.post.setCamera(this.mapCamera);
            this.captureSurfaceMats();
            this.applyMapSurface();
            this.hud.showMessage('ZENITH MAP  -  wheel zoom, T surfaces, M exit', 3);
        }
        else {
            this.scene.fog = this.overview ? null : this.sceneFog();
            this.post.setCamera(this.camera);
            this.mapOverlay?.clear();
            this.mapSurface = 0;
            this.applyMapSurface();
            this.cameraRig.snap(this.car);
        }
    }
    private toggleMapGrid(): void {
        this.mapGrid = !this.mapGrid;
        if (this.mapMode && !this.mapGrid)
            this.mapOverlay?.clear();
        if (this.mapMode)
            this.hud.showMessage(`GRID ${this.mapGrid ? 'ON' : 'OFF'}`, 1.5);
    }
    private captureSurfaceMats(): void {
        if (this.surfaceMatState.size > 0)
            return;
        for (const mesh of this.builder.surfaceMeshes) {
            const mat = mesh.material as THREE.Material;
            if (!this.surfaceMatState.has(mat)) {
                this.surfaceMatState.set(mat, {
                    transparent: mat.transparent,
                    opacity: mat.opacity,
                    depthWrite: mat.depthWrite,
                });
            }
        }
    }
    /** 0 = both, 1 = translucent procedural surfaces, 2 = procedural surfaces hidden. */
    private cycleMapSurface(): void {
        if (!this.mapMode)
            return;
        this.mapSurface = (this.mapSurface + 1) % 3;
        this.applyMapSurface();
        const labels = ['SURFACES: BOTH', 'SURFACES: TRANSLUCENT (terrain underneath)', 'SURFACES: HIDDEN (terrain only)'];
        this.hud.showMessage(labels[this.mapSurface], 2);
    }
    private applyMapSurface(): void {
        const hide = this.mapSurface === 2;
        const translucent = this.mapSurface === 1;
        // The grass base ribbon would cover the terrain, so only show it in "both".
        if (this.builder.groundMesh)
            this.builder.groundMesh.visible = this.mapSurface === 0;
        for (const mesh of this.builder.surfaceMeshes) {
            mesh.visible = !hide;
            const mat = mesh.material as THREE.Material;
            const original = this.surfaceMatState.get(mat);
            if (!original)
                continue;
            mat.transparent = translucent ? true : original.transparent;
            mat.opacity = translucent ? 0.4 : original.opacity;
            mat.depthWrite = translucent ? false : original.depthWrite;
            mat.needsUpdate = true;
        }
    }
    /** Fits the whole circuit into an orthographic top-down view. */
    private updateMapCamera(): void {
        const { minX, maxX, minZ, maxZ } = this.mapBounds;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const halfX = (maxX - minX) / 2 + 40;
        const halfZ = (maxZ - minZ) / 2 + 40;
        const aspect = Math.max(0.2, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
        const halfViewZ = Math.max(halfZ, halfX / aspect) / this.mapZoom;
        const halfViewX = halfViewZ * aspect;
        const cam = this.mapCamera;
        cam.left = -halfViewX;
        cam.right = halfViewX;
        cam.top = halfViewZ;
        cam.bottom = -halfViewZ;
        cam.near = 1;
        cam.far = 9000;
        cam.position.set(cx, 4000, cz);
        cam.up.set(0, 0, -1);
        cam.lookAt(cx, 0, cz);
        cam.updateProjectionMatrix();
        if (!this.mapOverlay)
            return;
        if (this.mapGrid)
            this.mapOverlay.draw(cx, cz, halfViewX, halfViewZ);
        else
            this.mapOverlay.clear();
    }
    start(): void {
        this.loop.start();
    }
    setTouchInput(partial: {
        steer?: number;
        throttle?: number;
        brake?: number;
        handbrake?: boolean;
        allowReverse?: boolean;
    }): void {
        this.input.setTouch(partial);
    }
    private postSized = false;
    private dprCap = 1.25;
    private readonly qualityController: QualityController;
    private get quality(): number { return this.qualityController.getState().level; }
    /** Keeps the renderer *and* the post-processing targets in sync with the canvas. */
    private syncSize(force = false): void {
        if (this.exportSize) {
            const { width, height } = this.exportSize;
            if (this.canvas.width !== width || this.canvas.height !== height || force) {
                this.renderer.setPixelRatio(1);
                this.renderer.setSize(width, height, false);
                this.camera.aspect = width / height;
                this.camera.updateProjectionMatrix();
                this.post.setSize(width, height, 1);
            }
            return;
        }
        const changed = resizeRenderer(this.renderer, this.camera, this.dprCap);
        if (changed || !this.postSized || force) {
            const width = Math.max(1, this.canvas.clientWidth);
            const height = Math.max(1, this.canvas.clientHeight);
            this.post.setSize(width, height, this.renderer.getPixelRatio());
            this.postSized = true;
        }
        if (this.mapOverlay) {
            this.mapOverlay.resize(Math.max(1, this.canvas.clientWidth), Math.max(1, this.canvas.clientHeight), this.renderer.getPixelRatio());
        }
    }
    private applyQuality(): void {
        if (this.quality >= 2) {
            this.dprCap = this.quality >= 3 ? 1.5 : 1.25;
            this.environment.setShadowMapSize(2048);
            this.environment.setShadows(true);
            this.post.setEnabled(true);
            this.post.setQuality(this.quality >= 2, this.quality >= 3, this.quality === 4);
        }
        else if (this.quality === 1) {
            this.dprCap = 1.0;
            this.environment.setShadowMapSize(1024);
            this.environment.setShadows(true);
            this.post.setEnabled(true);
            this.post.setQuality(false, false);
        }
        else {
            this.dprCap = 0.8;
            this.environment.setShadows(false);
            this.post.setQuality(false, false);
            this.post.setEnabled(false);
        }
        this.environment.setCinematic?.(this.quality === 4);
        if (this.scene.fog instanceof THREE.FogExp2)
            this.scene.fog = this.sceneFog();
        this.syncSize(true);
    }
    /**
     * Neon Signal fades the world to black with distance and lets its own mist
     * supply every colour, so the cinematic tier drops the teal material fog for
     * a thin black one and leaves the rest to the atmosphere pass.
     */
    private sceneFog(): THREE.FogExp2 {
        return this.quality === 4 ? new THREE.FogExp2(0x000000, .0009) : new THREE.FogExp2(0x1c3848, .0022);
    }
    /** Auto mode steps both ways with separate thresholds and sustained windows. */
    private updateAdaptiveQuality(delta: number): void {
        if (!this.qualityController.recordFrame(delta))
            return;
        this.applyQuality();
        this.dispatchQualityState();
    }
    dispose(): void {
        this.loop.stop();
        window.removeEventListener('resize', this.onResize);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.input.dispose();
        this.audio.dispose();
        this.hud.dispose();
        this.vfx.dispose();
        this.guide.dispose();
        this.post.dispose();
        this.environment.sunLighting.dispose();
        this.environment.disposeExtraResources?.();
        disposeObject3D(this.scene);
        this.environmentMap?.dispose();
        this.renderer.dispose();
        this.materials.dispose();
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.mapOverlay?.dispose();
        window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    }
    private resetCar(): void {
        this.replayRecorder.reset();
        const slot = this.builder.gridSlot(5);
        this.car.resetAt(slot.index, slot.lateral);
        this.timing.reset();
        this.personalBest = readPersonalBest(this.spline.circuitId);
        this.newPersonalBest = false;
        this.countdown = 3.999;
        this.started = false;
        this.builder.updateStartLights(this.countdown, this.started);
        this.finished = false;
        this.offTrackTime = 0;
        this.driftTime = 0;
        this.position = 6;
        this.lastPositionCallout = 0;
        this.rivals.forEach((rival, i) => {
            const rivalSlot = this.builder.gridSlot(i);
            rival.car.resetAt(rivalSlot.index, rivalSlot.lateral);
            rival.ai.reset(rivalSlot.index);
            rival.progCache.index = rivalSlot.index;
            rival.prev = this.spline.progressAt(rival.car.physics.position, rival.progCache);
            const playerStart = this.spline.progressAt(this.car.physics.position, { index: slot.index });
            rival.race = ((rival.prev - playerStart + this.spline.length * 1.5) % this.spline.length) - this.spline.length / 2;
        });
        this.progressCache.index = slot.index;
        this.guide?.reset(slot.index);
        this.playerRace = 0;
        this.updateScoringPylon();
        this.contacts.reset();
        this.simulationAccumulator = 0;
        this.playerPrev = this.spline.progressAt(this.car.physics.position, { index: slot.index });
        this.cameraRig.snap(this.car);
        if (!(typeof location !== 'undefined' && location.search.includes('go')))
            this.hud.showMessage('GET READY', 2);
    }
    private updateScoringPylon(): void {
        this.environment.updateStandings(this.timing.lap, this.timing.currentLapTime, [
            // Match the HUD's existing half-metre deadband for cars alongside us.
            // Stable sorting also keeps the player ahead at the exact threshold.
            { number: 10, race: this.playerRace + 0.5 },
            ...this.rivals.map(rival => ({ number: rival.number, race: rival.race })),
        ]);
    }
    /** Puts the car back on the nearest point of the track, facing forward. */
    recoverCar(): void {
        if (this.replay)
            return;
        if (this.finished)
            return;
        const probe = this.spline.probe(this.car.physics.position, { index: this.progressCache.index });
        const index = probe.sample.index;
        this.car.resetAt(index, 0);
        this.progressCache.index = index;
        this.guide?.reset(index);
        this.cameraRig.snap(this.car);
        this.playerPrev = this.spline.progressAt(this.car.physics.position, this.progressCache);
        this.timing.invalidateLap(this.playerPrev);
        this.hud.showMessage('RECOVERED · LAP INVALID', 1.8);
    }
    beginSession(): void {
        if (this.replay)
            return;
        this.resetCar();
        this.setPaused(false);
    }
    restartSession(): void { this.beginSession(); }
    getLastLapReplay() { const lap = this.replayRecorder.last; return lap ? { lap: lap.lap, duration: lap.duration, valid: lap.valid } : null; }
    getReplayState() { return this.replay ? { time: this.replay.time, playing: this.replay.playing, exporting: this.replay.exporting } : null; }
    getReplayAudioScene() {
        const lap = this.replayRecorder.last;
        if (!lap)
            throw new Error('No recorded lap');
        return { lap, holograms: [this.environment.holograms, this.environment.koiHolograms, this.environment.billboardAudio].filter((s): s is NonNullable<typeof s> => !!s),
            rain: true, exposure: (position: THREE.Vector3) => {
                const progress = this.spline.progressAt(position, { index: 0 });
                return { tunnel: this.tunnelMixAt(progress), rain: this.rainExposureAt(progress) };
            } };
    }
    beginReplay(): boolean {
        const lap = this.replayRecorder.last;
        if (!lap || !this.paused || this.replay)
            return false;
        const cars = [this.car, ...this.rivals.map(r => r.car)];
        const hidden: [
            THREE.Object3D,
            boolean
        ][] = [];
        for (const car of cars)
            for (const item of (car.group.userData.cockpitHidden ?? []) as THREE.Object3D[]) {
                hidden.push([item, item.visible]);
                item.visible = true;
            }
        const guide = this.scene.getObjectByName('driving-guide');
        if (guide) {
            hidden.push([guide, guide.visible]);
            guide.visible = false;
        }
        const obstructions: THREE.Object3D[] = [];
        this.scene.traverse(o => {
            if (/tunnel.*shell|escape.*barrier/.test(o.name))
                obstructions.push(o);
        });
        this.replay = { director: new ReplayDirector(lap, cars, this.camera, this.builder, obstructions), time: 0, playing: true, exporting: false,
            saved: capturePoses(cars, true), hidden, fov: this.camera.fov, cameraMode: this.cameraRig.mode };
        this.vfx.setVisible(false);
        this.post.setCamera(this.camera);
        this.post.setCinematic(true);
        this.post.resetMotionHistory();
        this.audio.setPaused(false);
        this.syncSize(true);
        this.drawReplay(0, 0);
        return true;
    }
    setReplayPlaying(playing: boolean) {
        if (this.replay) {
            this.replay.playing = playing;
            this.audio.setPaused(!playing || this.replay.exporting);
        }
    }
    seekReplay(time: number) {
        if (!this.replay)
            return;
        this.replay.time = THREE.MathUtils.clamp(time, 0, this.replayRecorder.last!.duration);
        this.post.resetMotionHistory();
        this.drawReplay(this.replay.time, 0);
    }
    private drawReplay(time: number, dt: number) {
        if (!this.replay)
            return;
        const frame = this.replay.director.renderAt(time);
        if (frame.cut)
            this.post.resetMotionHistory();
        this.environment.update(this.car.group.position, frame.worldTime);
        this.updateContactShadows(true);
        this.environment.updateShadows();
        this.post.setFocusDistance(this.camera.position.distanceTo(this.car.group.position));
        this.post.update(dt, frame.telemetry);
        if (this.replay.playing && !this.replay.exporting) {
            const motion = replayMotion(this.replayRecorder.last!, time), progress = this.spline.progressAt(motion.position, { index: 0 });
            this.audio.update(frame.telemetry, Math.max(.001, dt), this.tunnelMixAt(progress));
            this.audio.updateRain(this.rainExposureAt(progress));
            this.audio.updateHolograms(this.environment.holograms, motion.position, motion.velocity, motion.right.x, motion.right.z);
            this.audio.updateHolograms(this.environment.koiHolograms, motion.position, motion.velocity, motion.right.x, motion.right.z, 'koi');
            this.audio.updateHolograms(this.environment.billboardAudio, motion.position, motion.velocity, motion.right.x, motion.right.z, 'billboard');
        }
    }
    setReplayExporting(exporting: boolean) {
        if (!this.replay)
            return;
        this.replay.exporting = exporting;
        this.setReplayPlaying(false);
        if (!exporting) {
            this.exportSize = undefined;
            this.syncSize(true);
            this.post.resetMotionHistory();
        }
    }
    renderReplayFrame(time: number, dt: number, width: number, height: number): HTMLCanvasElement {
        if (!this.replay?.exporting)
            throw new Error('Replay export is not active');
        this.exportSize = { width, height };
        this.syncSize();
        this.drawReplay(time, dt);
        this.manualReplayRender = true;
        try {
            this.render();
        }
        finally {
            this.manualReplayRender = false;
        }
        return this.canvas;
    }
    endReplay() {
        if (!this.replay)
            return;
        const saved = this.replay;
        this.replay = undefined;
        this.exportSize = undefined;
        applyPoses([this.car, ...this.rivals.map(r => r.car)], saved.saved);
        for (const [o, visible] of saved.hidden)
            o.visible = visible;
        this.vfx.setVisible(true);
        this.audio.setPaused(true);
        this.post.setCinematic(false);
        this.cameraRig.mode = saved.cameraMode;
        this.camera.fov = saved.fov;
        this.cameraRig.snap(this.car);
        this.camera.updateProjectionMatrix();
        this.syncSize(true);
        this.post.setCamera(this.mapMode ? this.mapCamera : this.camera);
        this.environment.update(this.car.physics.position, this.elapsed);
        this.updateContactShadows();
        this.environment.updateShadows();
        const t = this.car.physics.telemetry;
        this.car.model.updateDisplay(t.speed, t.gear, t.rpm);
        this.post.resetMotionHistory();
    }
    cycleCamera(): void { this.cameraRig.cycleMode(); this.cameraRig.snap(this.car); this.post.resetMotionHistory(); }
    toggleMute(): boolean { return this.audio.toggleMute(); }
    getQualityPreset(): QualityPreset { return this.qualityController.getState().preset; }
    setQualityPreset(preset: QualityPreset, announce = true): void {
        if (preset === 'extreme' && false)
            preset = 'quality';
        this.qualityController.setPreset(preset);
        try {
            localStorage.setItem('gridpunk:graphics-quality', preset);
        }
        catch { /* ignore */ }
        if (this.post)
            this.applyQuality();
        this.dispatchQualityState();
        if (announce && this.hud)
            this.hud.showMessage(`GRAPHICS: ${preset.toUpperCase()}`, 1.4);
    }
    setPaused(paused: boolean): void {
        if (this.replay) {
            if (document.hidden)
                this.setReplayPlaying(false);
            return;
        }
        if (this.paused !== paused)
            this.post?.resetMotionHistory();
        this.paused = paused;
        this.audio.setPaused(paused);
        document.dispatchEvent(new CustomEvent('race:pause', { detail: { paused } }));
    }
    private togglePause(): void {
        if (!this.finished)
            this.setPaused(!this.paused);
    }
    private update(delta: number, elapsed: number): void {
        this.frame += 1;
        const now = performance.now();
        const wallDelta = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 1 / 60;
        this.lastFrameTime = now;
        if (!this.paused && this.frame > 180 && !document.hidden) {
            this.frameTimes[this.frameTimeIndex++ % this.frameTimes.length] = wallDelta * 1000;
            this.frameTimeCount = Math.min(this.frameTimes.length, this.frameTimeCount + 1);
            if (this.frame % 120 === 0) {
                const sorted = Array.from(this.frameTimes.subarray(0, this.frameTimeCount)).sort((a, b) => a - b);
                const percentile = (p: number) => Math.round(sorted[Math.floor((sorted.length - 1) * p)] * 100) / 100;
                this.frameStats = { samples: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: percentile(1), over33Ms: sorted.filter(ms => ms > 33.34).length };
            }
        }
        this.measuredFps += (1 / Math.max(wallDelta, 0.001) - this.measuredFps) * 0.04;
        this.elapsed = elapsed;
        this.syncSize();
        if (this.replay) {
            if (!this.replay.exporting) {
                if (this.replay.playing)
                    this.replay.time = Math.min(this.replayRecorder.last!.duration, this.replay.time + delta);
                if (this.replay.time >= this.replayRecorder.last!.duration)
                    this.setReplayPlaying(false);
                this.drawReplay(this.replay.time, this.replay.playing ? delta : 0);
            }
            return;
        }
        this.updateAdaptiveQuality(wallDelta);
        if (this.paused) {
            return;
        }
        // Countdown before the lights go out.
        const rawInput = this.input.read(delta);
        if (this.devMode && new URLSearchParams(location.search).has('go') && !this.started) {
            this.started = true;
            this.countdown = 0;
            this.timing.start(this.spline.progressAt(this.car.physics.position, this.progressCache));
        }
        if (!this.started) {
            this.countdown -= delta;
            if (this.countdown <= 0) {
                this.started = true;
                this.timing.start(this.spline.progressAt(this.car.physics.position, this.progressCache));
                this.hud.showMessage('LIGHTS OUT', 0.7, 'go');
            }
        }
        const input = this.started
            ? rawInput
            : { ...rawInput, throttle: 0, brake: 0, handbrake: true };
        const result = this.advanceCars(delta, input);
        const telemetry = this.car.physics.telemetry;
        this.environment.update(this.car.physics.position, this.elapsed);
        // Surface / off-track feedback.
        const offTrack = this.car.surfaceInfo.mu < 1.0;
        if (offTrack && (telemetry.speed > 8)) {
            this.offTrackTime += delta;
            this.vfx.spawnDust(this.car.group.position, telemetry.speed, delta);
        }
        else {
            this.offTrackTime = 0;
        }
        // Tyre smoke when sliding.
        const sliding = Math.abs(telemetry.slipAngleRear) > 0.16 || telemetry.wheelSlip > 0.5;
        if (sliding && telemetry.speed > 12) {
            this.driftTime += delta;
            this.vfx.spawnSmoke(this.car.group.position, this.car.group.quaternion, telemetry.speed, delta);
            this.audio.setTyreSlip(1);
        }
        else {
            this.driftTime = Math.max(0, this.driftTime - delta * 2);
            this.audio.setTyreSlip(0);
        }
        if (result.collided && telemetry.speed > 6 && this.elapsed - this.lastCollisionSound > 0.15) {
            this.audio.collision(result.collisionImpulse);
            this.cameraRig.addShake(0.5);
            this.lastCollisionSound = this.elapsed;
            this.vfx.spawnSparks(this.car.group.position, result.collisionImpulse);
        }
        this.cameraRig.addShake(this.car.surfaceInfo.rumble * 0.02 * Math.min(1, telemetry.speed / 40));
        // Timing.
        const progress = this.spline.progressAt(this.car.physics.position, this.progressCache);
        if (this.offTrackTime > 0.8)
            this.timing.invalidateLap();
        const timingResult = this.timing.update(this.started ? delta : 0, progress, this.progressCache);
        if (this.started)
            this.replayRecorder.record(this.timing.currentLapTime, this.elapsed, [this.car, ...this.rivals.map(r => r.car)], timingResult.lapCompleted !== null ? this.timing.getHistory().at(-1) : undefined);
        if (timingResult.lapCompleted !== null) {
            const last = this.timing.lastLap;
            const record = this.timing.getHistory().at(-1);
            const personalBest = record?.valid && last !== null && (this.personalBest === null || last < this.personalBest);
            if (personalBest && last !== null) {
                this.personalBest = last;
                this.newPersonalBest = true;
                savePersonalBest(last, this.spline.circuitId);
            }
            const lapLabel = record?.valid === false ? `LAP ${timingResult.lapCompleted} · INVALID`
                : personalBest ? 'PERSONAL BEST' : `LAP ${timingResult.lapCompleted}`;
            this.hud.showMessage(`${lapLabel}  ${last ? last.toFixed(3) : ''}`, 2.2, 'lap');
            this.audio.lapTone();
        }
        if (timingResult.sectorCompleted !== null)
            this.audio.sectorTone();
        // AI rivals race the same track.
        const L = this.spline.length;
        // Signed shortest-path delta avoids spurious lap jumps when a car sits on
        // the start/finish line (where arc length wraps 0 <-> length).
        let playerDelta = progress - this.playerPrev;
        if (playerDelta > L / 2)
            playerDelta -= L;
        else if (playerDelta < -L / 2)
            playerDelta += L;
        this.playerRace += playerDelta;
        this.playerPrev = progress;
        let ahead = 0;
        for (const rival of this.rivals) {
            if (!this.started)
                continue;
            const rp = this.spline.progressAt(rival.car.physics.position, rival.progCache);
            let rd = rp - rival.prev;
            if (rd > L / 2)
                rd -= L;
            else if (rd < -L / 2)
                rd += L;
            rival.race += rd;
            rival.prev = rp;
            if (rival.race > this.playerRace + 0.5)
                ahead += 1;
        }
        this.updateScoringPylon();
        const previousPosition = this.position;
        this.position = this.started ? 1 + ahead : 6;
        if (this.started && this.position < previousPosition && this.timing.currentLapTime > 5 && this.elapsed - this.lastPositionCallout > 5) {
            this.hud.showMessage(`UP TO P${this.position}`, 1.1, 'go');
            this.lastPositionCallout = this.elapsed;
        }
        if (timingResult.lapCompleted !== null && timingResult.lapCompleted >= 3) {
            this.finished = true;
            this.setPaused(true);
            document.dispatchEvent(new CustomEvent('race:finish', { detail: {
                    position: this.position, bestLap: this.timing.bestLap, lastLap: this.timing.lastLap, laps: 3,
                    history: this.timing.getHistory().map(record => ({ ...record })), newPersonalBest: this.newPersonalBest,
                } }));
        }
        this.builder.updateStartLights(this.countdown, this.started);
        // Audio + VFX tied to telemetry.
        const tunnelMix = this.tunnelMixAt(progress);
        this.audio.update(telemetry, delta, tunnelMix);
        this.audio.updateRain(this.rainExposureAt(progress));
        this.audio.updateHolograms(this.environment.holograms, this.car.physics.position, this.car.physics.velocity, this.camera.matrixWorld.elements[0], this.camera.matrixWorld.elements[2]);
        this.audio.updateHolograms(this.environment.koiHolograms, this.car.physics.position, this.car.physics.velocity, this.camera.matrixWorld.elements[0], this.camera.matrixWorld.elements[2], 'koi');
        this.audio.updateHolograms(this.environment.billboardAudio, this.car.physics.position, this.car.physics.velocity, this.camera.matrixWorld.elements[0], this.camera.matrixWorld.elements[2], 'billboard');
        this.audio.updateRivals(this.rivals.map((rival, id) => ({ rival, id })).filter(({}) => true).map(({ rival, id }) => {
            const dx = rival.car.physics.position.x - this.car.physics.position.x;
            const dz = rival.car.physics.position.z - this.car.physics.position.z;
            const distance = Math.hypot(dx, dz);
            // The car looks along local +Z; with +Y up, positive local X is
            // screen-left from the driving cameras (despite the physics basis name).
            const lateral = dx * Math.cos(this.car.physics.yaw) - dz * Math.sin(this.car.physics.yaw);
            const rivalTunnelMix = this.tunnelMixAt(rival.prev);
            return { id, distance, pan: -lateral / Math.max(3, distance),
                rpm: rival.car.physics.telemetry.rpm, throttle: rival.car.physics.telemetry.throttle,
                occlusion: Math.abs(tunnelMix - rivalTunnelMix) };
        }), delta, tunnelMix);
        this.vfx.spawnExhaust(this.car.group.position, this.car.group.quaternion, telemetry, delta);
        this.vfx.spawnTyreMarks(this.car, sliding, delta);
        this.vfx.update(delta);
        this.updateContactShadows();
        // Camera + HUD.
        if (this.mapMode) {
            this.updateMapCamera();
        }
        else if (this.overview) {
            const center = this.builder.spline.samples[0].position;
            this.camera.position.set(center.x + 40, 1450, center.z + 30);
            this.camera.lookAt(center.x, 0, center.z);
            this.camera.far = 6000;
            this.camera.updateProjectionMatrix();
        }
        else {
            this.cameraRig.update(delta, this.car);
        }
        this.environment.updateShadows();
        this.post.update(delta, telemetry);
        this.guide.enabled = !this.mapMode;
        const drivingCue = this.guide.update(this.car, {
            dt: delta,
            throttle: input.throttle,
            brake: input.brake,
            reversing: input.allowReverse === true || telemetry.gear < 0,
            contact: result.collided,
            progressDelta: playerDelta,
        });
        const cueLabel = drivingCue.cue === 'accelerate' ? 'build speed'
            : drivingCue.cue === 'recover' ? 'reverse · or tap recover' : drivingCue.cue;
        this.hud.setDrivingCue(this.guide.enabled ? cueLabel : '', drivingCue.targetSpeedKmh);
        const rpmFraction = telemetry.rpm / 15000;
        let leftClose = false, rightClose = false, gapAhead = Infinity;
        const sinHeading = Math.sin(this.car.physics.yaw), cosHeading = Math.cos(this.car.physics.yaw);
        for (const rival of this.rivals) {
            const dx = rival.car.physics.position.x - this.car.physics.position.x;
            const dz = rival.car.physics.position.z - this.car.physics.position.z;
            const along = dx * sinHeading + dz * cosHeading;
            const lateral = dx * cosHeading - dz * sinHeading;
            if (Math.abs(along) < 6 && Math.abs(lateral) > 1 && Math.abs(lateral) < 6) {
                if (lateral > 0)
                    leftClose = true;
                else
                    rightClose = true;
            }
            if (rival.race > this.playerRace)
                gapAhead = Math.min(gapAhead, rival.race - this.playerRace);
        }
        this.hud.update({
            speedKmh: telemetry.speed * 3.6,
            gear: telemetry.gear,
            rpm: telemetry.rpm,
            rpmFraction,
            throttle: telemetry.throttle,
            brake: telemetry.brake,
            aero: this.car.isStraightLineAeroActive,
            tc: this.car.physics.getAssists().tc,
            abs: this.car.physics.getAssists().abs,
            lap: Math.min(3, this.timing.lap),
            currentLap: this.timing.currentLapTime,
            lapValid: this.timing.lapValid,
            lastLapValid: this.timing.getHistory().at(-1)?.valid ?? null,
            lastLap: this.timing.lastLap,
            bestLap: this.personalBest,
            sectors: this.timing.sectors,
            bestSectors: this.timing.bestSectors,
            offTrack: this.offTrackTime > 0.4,
            position: this.position,
            gap: Number.isFinite(gapAhead) ? gapAhead : 0,
            countdown: this.started ? 0 : this.countdown,
            proximity: leftClose && rightClose ? 'both' : leftClose ? 'left' : rightClose ? 'right' : 'none',
        }, this.car.physics.position, this.car.physics.yaw, delta, this.rivals.map(rival => rival.car.physics.position));
    }
    private updateContactShadows(rendered = false): void {
        // Drape each contact shadow over the same rendered road/terrain surface
        // as the tyres, including yaw and kerbs, instead of following body heave.
        for (const { mesh, car } of this.contactShadows) {
            const position = rendered ? car.group.position : car.physics.position;
            mesh.position.copy(position);
            const vertices = mesh.geometry.getAttribute('position');
            const q = car.group.quaternion;
            const yaw = rendered ? Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)) : car.physics.yaw;
            const sinYaw = Math.sin(yaw), cosYaw = Math.cos(yaw);
            for (let i = 0; i < vertices.count; i++) {
                const x = ((i % 5) / 4 - 0.5) * 3, z = (Math.floor(i / 5) / 8 - 0.5) * 6.4;
                const dx = cosYaw * x + sinYaw * z, dz = -sinYaw * x + cosYaw * z;
                const y = this.builder.drivingSurface.heightAt(position.x + dx, position.z + dz, undefined, this.spline.circuit.gradeSeparated ? position.y : undefined) ?? position.y;
                vertices.setXYZ(i, dx, y + 0.012 - position.y, dz);
            }
            vertices.needsUpdate = true;
            mesh.geometry.computeBoundingSphere();
        }
    }
    private render(): void {
        if (this.replay?.exporting && !this.manualReplayRender)
            return;
        this.renderer.info.reset();
        this.post.render();
        this.publishDiagnostics();
    }
    /**
     * Safety net: hide any scenery object whose footprint reaches the racing
     * surface. Placement code offsets props from the centreline, but where the
     * circuit loops back on itself a prop anchored to one sample can land on
     * another part of the track. Instanced meshes are skipped (hiding one would
     * remove every instance; those are guarded at build time instead).
     */
    private cullTrackObstacles(): void {
        const samples = this.builder.spline.samples;
        const step = 4;
        const distTo = (x: number, z: number): number => {
            let best = Infinity;
            for (let i = 0; i < samples.length; i += step) {
                const dx = x - samples[i].position.x;
                const dz = z - samples[i].position.z;
                const d = dx * dx + dz * dz;
                if (d < best)
                    best = d;
            }
            return Math.sqrt(best);
        };
        const allow = /sky|sun|mountain|disc|ground|terrain|road|shoulder|gravel|kerb|astro|grid|start|finish|barrier|line|marking|backdrop|cloud|shadow|grandstand/i;
        const hits = new Set<THREE.Object3D>();
        for (const root of [this.environment.group, this.tracksideGroup]) {
            root.traverse((obj) => {
                const o = obj as THREE.Mesh;
                if (!o.isMesh || (o as {
                    isInstancedMesh?: boolean;
                }).isInstancedMesh)
                    return;
                if (!o.geometry)
                    return;
                const box = new THREE.Box3().setFromObject(o);
                if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x))
                    return;
                const w = box.max.x - box.min.x;
                const d = box.max.z - box.min.z;
                if (w > 250 || d > 250)
                    return;
                if (box.max.y < 0.4)
                    return;
                const cx = (box.min.x + box.max.x) / 2;
                const cz = (box.min.z + box.max.z) / 2;
                if (distTo(cx, cz) - Math.hypot(w, d) / 2 > 9)
                    return;
                let best = Infinity;
                for (let i = 0; i <= 4; i += 1) {
                    for (let j = 0; j <= 4; j += 1) {
                        const dd = distTo(box.min.x + (w * i) / 4, box.min.z + (d * j) / 4);
                        if (dd < best)
                            best = dd;
                    }
                }
                if (best >= 7.5)
                    return;
                // Hide the whole top-level object (e.g. an entire grandstand) so nothing
                // floats; skip when that object is explicitly allowed scenery.
                let top: THREE.Object3D = o;
                while (top.parent && top.parent !== root && !top.parent.userData.sceneryContainer)
                    top = top.parent;
                if (top.userData.roadClearanceVerified)
                    return;
                if (top.userData.intentionalOverpass || allow.test(top.name))
                    return;
                hits.add(top);
            });
        }
        for (const o of hits)
            o.visible = false;
    }
    /**
     * Drop scattered bushes and rocks onto the actual visible surface. These are
     * instanced meshes whose geometry is centred, so we translate each instance
     * so its lowest vertex touches the ground (terrain or run-off shelf). Tree
     * canopies share the icosahedron geometry but are offset (min.y > 0) and are
     * skipped.
     */
    private snapGroundProps(): void {
        // Use the track's shared surface sampler; raycasting every terrain triangle
        // for every rock previously blocked startup, and incorrectly grounded crowd heads.
        this.scene.updateMatrixWorld(true);
        const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
        for (const root of [this.environment.group, this.tracksideGroup])
            root.traverse(object => {
                const mesh = object as THREE.InstancedMesh;
                if (!mesh.isInstancedMesh || mesh.userData.preserveAuthoredElevation || /spectator|tree/i.test(mesh.name))
                    return;
                if (!['IcosahedronGeometry', 'DodecahedronGeometry'].includes(mesh.geometry.type))
                    return;
                mesh.geometry.computeBoundingBox();
                const bottom = mesh.geometry.boundingBox?.min.y ?? 0;
                if (bottom > -0.2)
                    return;
                for (let i = 0; i < mesh.count; i++) {
                    mesh.getMatrixAt(i, matrix);
                    matrix.decompose(position, quaternion, scale);
                    const world = position.clone().applyMatrix4(mesh.matrixWorld);
                    const target = this.builder.surfaceHeightAt(world.x, world.z) - bottom * scale.y;
                    world.y = target;
                    position.copy(mesh.worldToLocal(world));
                    matrix.compose(position, quaternion, scale);
                    mesh.setMatrixAt(i, matrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
            });
    }
    setOpponentDifficulty(level: OpponentDifficulty, announce = true): void {
        if (level !== this.opponentDifficulty) {
            if (this.started)
                this.timing.invalidateLap();
        }
        this.opponentDifficulty = level;
        const pace = AI_DIFFICULTY_PACE[level];
        for (const rival of this.rivals)
            rival.ai.setPace(pace);
        try {
            localStorage.setItem('gridpunk:opponent-difficulty', level);
        }
        catch { /* ignore */ }
        this.hud.setOpponentDifficulty(level);
        if (announce)
            this.hud.showMessage(`RIVALS: ${level.toUpperCase()}`, 1.4);
    }
    private loadOpponentDifficulty(): OpponentDifficulty {
        try {
            const saved = localStorage.getItem('gridpunk:opponent-difficulty');
            if (saved === 'easy' || saved === 'normal' || saved === 'hard')
                return saved;
        }
        catch { /* ignore */ }
        return 'normal';
    }
    private loadQualityPreset(): QualityPreset {
        try {
            const saved = localStorage.getItem('gridpunk:graphics-quality');
            if (saved === 'extreme' || saved === 'cinematic')
                return saved;
            if (saved === 'auto' || saved === 'performance' || saved === 'quality')
                return saved;
        }
        catch { /* ignore */ }
        return 'auto';
    }
    private dispatchQualityState(): void {
        const state = this.qualityController.getState();
        document.dispatchEvent(new CustomEvent('race:quality', { detail: {
                preset: state.preset,
                effectiveLevel: state.level,
                dprCap: this.dprCap,
                shadows: state.level > 0,
                post: state.level > 0,
            } }));
    }
    private rainExposureAt(progressMetres: number): number {
        return this.spline.circuitId === 'neon' ? neonRainExposure(progressMetres / this.spline.length, this.spline.length) : 1;
    }
    private tunnelMixAt(progressMetres: number): number {
        if (this.spline.circuitId !== 'neon') return 0;
        const entry = (NEON_TUNNEL.start) * this.spline.length;
        const exit = (NEON_TUNNEL.end) * this.spline.length;
        const enter = THREE.MathUtils.smoothstep(progressMetres, entry - 18, entry + 22);
        const leave = 1 - THREE.MathUtils.smoothstep(progressMetres, exit - 22, exit + 20);
        return enter * leave;
    }
    /** Advance the entire field together; render rate cannot change pack contacts. */
    private advanceCars(delta: number, playerInput: VehicleInput) {
        if (this.simulationCars.length === 0) {
            this.simulationCars = [this.car, ...this.rivals.map(r => r.car)];
            this.simulationBodies = this.simulationCars.map(car => car.physics);
            this.simulationTraffic = this.simulationBodies.map(body => ({ position: body.position, speed: 0 }));
            this.simulationOpponents = this.rivals.map((_, index) => this.simulationTraffic.filter((_, carIndex) => carIndex !== index + 1));
        }
        const cars = this.simulationCars;
        const bodies = this.simulationBodies;
        const fixed = 1 / 120;
        this.simulationAccumulator = Math.min(this.simulationAccumulator + Math.max(0, delta), .25);
        let collided = false, collisionImpulse = 0, contactImpulse = 0;
        while (this.simulationAccumulator >= fixed) {
            // Every opponent sees the same time slice, independent of array order.
            for (let i = 0; i < bodies.length; i++) {
                this.simulationTraffic[i].position = bodies[i].position;
                this.simulationTraffic[i].speed = bodies[i].telemetry.speed;
            }
            for (let i = 0; i < this.rivals.length; i++) {
                const rival = this.rivals[i];
                this.simulationInputs[i] = this.started
                    ? rival.ai.update(rival.car, this.simulationOpponents[i], fixed)
                    : this.heldInput;
            }
            const hit = this.car.update(fixed, playerInput, false);
            collided ||= hit.collided;
            collisionImpulse = Math.max(collisionImpulse, hit.collisionImpulse);
            for (let i = 0; i < this.rivals.length; i++)
                this.rivals[i].car.update(fixed, this.simulationInputs[i], false);
            contactImpulse = Math.max(contactImpulse, this.contacts.resolve(bodies, fixed, !!this.spline.circuit.gradeSeparated, (index, previousX, previousZ, previousYaw) => {
                const contactBarrier = cars[index].reconcileBarrier(previousX, previousZ, previousYaw);
                if (index === 0 && contactBarrier.collided) {
                    collided = true;
                    collisionImpulse = Math.max(collisionImpulse, contactBarrier.collisionImpulse);
                }
            }));
            this.simulationAccumulator -= fixed;
        }
        for (const car of cars)
            car.syncVisual(delta);
        if (contactImpulse > 1.5 && this.elapsed - this.lastCollisionSound > .15) {
            this.audio.collision(contactImpulse);
            this.cameraRig.addShake(Math.min(.5, contactImpulse * .035));
            this.vfx.spawnSparks(this.car.group.position, contactImpulse);
            this.lastCollisionSound = this.elapsed;
        }
        return { collided, collisionImpulse };
    }
    private readonly diagnosticSize = new THREE.Vector2();
    private publishDiagnostics(): void {
        const info = this.renderer.info;
        // syncSize already measured the canvas this frame. Reading DOM dimensions
        // again after HUD writes forces a second layout in the rendering hot path.
        this.renderer.getSize(this.diagnosticSize);
        window.__THREE_GAME_DIAGNOSTICS__ = {
            frame: this.frame,
            circuit: this.spline.circuitId,
            trackLength: this.spline.length,
            elapsed: this.elapsed,
            fps: Math.round(this.measuredFps),
            frameStats: this.frameStats,
            audio: this.audio.getDiagnostics(),
            player: {
                position: { x: this.car.physics.position.x, y: this.car.physics.position.y, z: this.car.physics.position.z },
                speed: this.car.physics.telemetry.speed,
                rpm: this.car.physics.telemetry.rpm,
                gear: this.car.physics.telemetry.gear,
                yaw: this.car.physics.yaw,
            },
            camera: this.cameraRig.mode,
            rivalsAhead: this.position - 1,
            rivalSpeeds: this.rivals.map((r) => Math.round(r.car.physics.telemetry.speed)),
            playerRace: Math.round(this.playerRace),
            playerCarContacts: this.contacts.playerResolutions,
            playerContactEvents: this.contacts.playerEvents,
            playerContactSeconds: this.contacts.playerContactSeconds,
            contactResidualMetres: this.contacts.maxResidualPenetration,
            rivalRaces: this.rivals.map((r) => Math.round(r.race)),
            rivalPositions: this.rivals.map((r) => ({ x: r.car.physics.position.x, z: r.car.physics.position.z, yaw: r.car.physics.yaw })),
            sunIntensity: this.environment.sun.intensity,
            cameraPosition: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
            lap: this.timing.lap,
            assistLevel: 'rookie',
            opponentDifficulty: this.opponentDifficulty,
            quality: {
                ...this.qualityController.getState(),
                dprCap: this.dprCap,
                shadows: this.quality > 0,
                post: this.quality > 0,
            },
            mapMode: this.mapMode,
            started: this.started,
            countdown: Math.max(0, this.countdown),
            lapTime: this.timing.currentLapTime,
            renderer: {
                calls: info.render.calls,
                triangles: info.render.triangles,
                geometries: info.memory.geometries,
                textures: info.memory.textures,
            },
            sceneChildren: this.scene.children.length,
            heapMB: typeof performance !== 'undefined' && (performance as unknown as {
                memory?: {
                    usedJSHeapSize: number;
                };
            }).memory
                ? Math.round((performance as unknown as {
                    memory: {
                        usedJSHeapSize: number;
                    };
                }).memory.usedJSHeapSize / 1048576)
                : -1,
            canvas: {
                clientWidth: this.diagnosticSize.x,
                clientHeight: this.diagnosticSize.y,
                width: this.canvas.width,
                height: this.canvas.height,
                dpr: this.renderer.getPixelRatio(),
            },
        };
    }
}
function makeRadialShadow(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.9)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}
function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
