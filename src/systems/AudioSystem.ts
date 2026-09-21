import { RainAudio } from './RainAudio';
import { HologramAudio, type HologramAudioScene } from './HologramAudio';
import type { Telemetry } from './VehiclePhysics';
import engineLoopUrl from '../assets/audio/engine-load-loop.mp3';

interface EngineVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  ratio: number;
  level: number;
}

export interface RivalAudioState {
  id: number;
  distance: number;
  /** -1 is to the driver's left, +1 to the right. */
  pan: number;
  rpm: number;
  throttle: number;
  /** 0 when heard in the same space, 1 when a tunnel portal blocks it. */
  occlusion?: number;
}

interface RivalVoice {
  oscillator: OscillatorNode;
  harmonic: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  id: number;
  distance: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Procedural race-car mix; it does not reproduce a specific real recording. */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private rain:RainAudio|null=null;
  private hologram: HologramAudio | null = null;
  private koi: HologramAudio | null = null;
  private billboard: HologramAudio | null = null;
  private master: GainNode | null = null;
  private spatialBus: GainNode | null = null;
  private roomGain: GainNode | null = null;
  private engineRoomInput: GainNode | null = null;
  private roomFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private combustionGain: GainNode | null = null;
  private combustionFilter: BiquadFilterNode | null = null;
  private combustionPulse: OscillatorNode | null = null;
  private intakeGain: GainNode | null = null;
  private intakeFilter: BiquadFilterNode | null = null;
  private turboWhine: OscillatorNode | null = null;
  private tyreGain: GainNode | null = null;
  private tyreFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private crowdGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly engineVoices: EngineVoice[] = [];
  private readonly rivalVoices: RivalVoice[] = [];
  private engineSample: AudioBufferSourceNode | null = null;
  private engineSampleGain: GainNode | null = null;
  private sampleStatus: 'waiting' | 'loading' | 'ready' | 'fallback' = 'waiting';
  private rivalAccum = 0;
  private readonly loopSources = new Set<AudioScheduledSourceNode>();
  private readonly transientSources = new Set<AudioScheduledSourceNode>();
  private readonly transientNodes = new Set<AudioNode>();
  private started = false;
  private disposed = false;
  private tyreLevel = 0;
  private muted = false;
  private paused = false;
  private audioAccum = 0;
  private previousGear: number | null = null;
  private previousThrottle = 0;
  private liftCooldown = 0;
  private collisionCooldown = 0;
  private shiftDuck = 1;
  private roomMix = 0;

  private readonly unlock = () => { this.ensure(); };

  constructor(private readonly soundscape: 'race' | 'rain' = 'race') {
    window.addEventListener('pointerdown', this.unlock);
    window.addEventListener('keydown', this.unlock);
    window.addEventListener('touchstart', this.unlock, { passive: true });
  }

  /** Build the silent graph during loading; a user gesture still unlocks playback. */
  prepare(): void {
    this.setPaused(true);
    this.ensure();
  }

  private removeUnlockListeners(): void {
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    window.removeEventListener('touchstart', this.unlock);
  }

  private ensure(): void {
    if (this.disposed) return;
    if (this.started) {
      if (!this.paused) void this.ctx?.resume().catch(() => undefined);
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try { ctx = new Ctor(); } catch {
      // Some browsers defer context creation until a gesture. Keep the unlock
      // listeners so that optional audio never prevents the circuit loading.
      return;
    }
    this.started = true;
    this.ctx = ctx;

    // Conservative gain plus compression keeps simultaneous transients safe.
    this.master = ctx.createGain();
    this.master.gain.value = this.muted || this.paused ? 0 : 0.68;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    this.master.connect(compressor).connect(ctx.destination);

    // Keep direct engine sound intact. A separate, engine-only send supplies
    // early wall echoes and a stereo decay in covered sections.
    this.spatialBus = ctx.createGain();
    this.spatialBus.connect(this.master);
    const room = ctx.createConvolver();
    room.normalize = false;
    room.buffer = this.makeTunnelImpulse(ctx);
    this.roomFilter = ctx.createBiquadFilter();
    this.roomFilter.type = 'lowpass';
    this.roomFilter.frequency.value = 3900;
    this.roomFilter.Q.value = .45;
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0;
    this.engineRoomInput=ctx.createGain();this.engineRoomInput.gain.value=0;
    const lowCut=ctx.createBiquadFilter();lowCut.type='highpass';lowCut.frequency.value=170;
    this.engineRoomInput.connect(lowCut).connect(room).connect(this.roomFilter).connect(this.roomGain).connect(this.master);

    this.noiseBuffer = this.makeNoiseBuffer(ctx, 3);
    this.buildEngine(ctx);
    this.buildAirAndTrackBeds(ctx);
    this.buildRivals(ctx);
    void this.loadEngineSample(ctx);
  }

  private async loadEngineSample(ctx: AudioContext): Promise<void> {
    this.sampleStatus = 'loading';
    try {
      const response = await fetch(engineLoopUrl);
      if (!response.ok) throw new Error('Engine sample unavailable');
      const original = await ctx.decodeAudioData(await response.arrayBuffer());
      if (this.disposed || this.ctx !== ctx || !this.engineGain) return;
      // Overlap the tail with the head once at load time. This leaves both
      // ends continuous when playbackRate changes with RPM.
      const fade = Math.min(Math.floor(original.sampleRate * .12), Math.floor(original.length / 4));
      const length = original.length - fade;
      const buffer = ctx.createBuffer(original.numberOfChannels, length, original.sampleRate);
      for (let channel = 0; channel < original.numberOfChannels; channel++) {
        const input = original.getChannelData(channel), output = buffer.getChannelData(channel);
        output.set(input.subarray(0, length));
        for (let i = 0; i < fade; i++) {
          const phase = i / fade * Math.PI / 2;
          output[i] = input[length + i] * Math.cos(phase) + input[i] * Math.sin(phase);
        }
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = .5;
      const gain = ctx.createGain(); gain.gain.value = 0;
      source.connect(gain).connect(this.engineGain);
      source.start();
      this.loopSources.add(source);
      this.engineSample = source;
      this.engineSampleGain = gain;
      this.sampleStatus = 'ready';
    } catch {
      this.sampleStatus = 'fallback';
    }
  }

  updateHolograms(scene:HologramAudioScene|undefined,position:{x:number;y:number;z:number},velocity:{x:number;y:number;z:number},rightX:number,rightZ:number,kind:'geisha'|'koi'|'billboard'='geisha'):void {
    if(!scene||!this.ctx||!this.master||this.ctx.state!=='running'||this.paused)return;
    const key=kind==='billboard'?'billboard':kind==='koi'?'koi':'hologram';
    this[key]??=new HologramAudio(this.ctx,this.master,scene);
    this[key].update(position,velocity,rightX,rightZ);
  }

  updateRain(exposure:number):void {
    if(!this.ctx||!this.master||this.ctx.state!=='running'||this.paused)return;
    this.rain??=new RainAudio(this.ctx,this.master);this.rain.update(exposure);
  }

  getDiagnostics() {
    return { billboard:this.billboard?.getDiagnostics()??null, koi:this.koi?.getDiagnostics()??null, rain:this.rain?.getDiagnostics()??null, hologram:this.hologram?.getDiagnostics()??null, state: this.ctx?.state ?? 'locked', muted: this.muted, paused: this.paused,
      engineSample: this.sampleStatus, loopSources: this.loopSources.size,
      transientSources: this.transientSources.size, tunnelWetGain:this.roomGain?.gain.value??0, tunnelSend:this.engineRoomInput?.gain.value??0, tunnelImpulseSeconds:1.35, roomMix: Number(this.roomMix.toFixed(3)) };
  }

  private makeTunnelImpulse(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 1.35);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed=0x4e454f4e;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0xffffffff*2-1;};
    for(let channel=0;channel<2;channel++){
      const data=impulse.getChannelData(channel);let smooth=0;
      for(let i=0;i<length;i++){
        const time=i/ctx.sampleRate;
        smooth=smooth*.62+random()*.38;
        // A delayed, damped tail avoids adding constant hiss to the dry engine.
        const onset=clamp01((time-.035)/.035);
        data[i]=smooth*.028*Math.exp(-time*5.2)*onset;
      }
      for(const [delay,level]of [[.052,.52],[.107,.34],[.176,.22],[.263,.12]]){
        data[Math.floor(ctx.sampleRate*(delay+channel*.009))]+=level;
      }
    }
    return impulse;
  }

  private buildRivals(ctx: AudioContext): void {
    if (!this.master) return;
    // A fixed pool keeps a crowded grid from multiplying audio graph cost.
    for (let i = 0; i < 3; i += 1) {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 240;
      const harmonic = ctx.createOscillator();
      harmonic.type = 'sine';
      harmonic.frequency.value = 486;
      const harmonicGain = ctx.createGain();
      harmonicGain.gain.value = 0.28;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createStereoPanner();
      oscillator.connect(filter).connect(gain).connect(panner).connect(this.spatialBus!);
      harmonic.connect(harmonicGain).connect(filter);
      oscillator.start();
      harmonic.start();
      this.loopSources.add(oscillator);
      this.loopSources.add(harmonic);
      this.rivalVoices.push({ oscillator, harmonic, filter, gain, panner, id: -1, distance: 0 });
    }
  }

  updateRivals(rivals: readonly RivalAudioState[], dt: number, tunnelMix = 0): void {
    if (!this.ctx) return;
    this.rivalAccum += dt;
    if (this.rivalAccum < 0.05) return;
    const step = this.rivalAccum;
    this.rivalAccum = 0;
    const nearby = rivals.filter(rival => rival.distance < 90)
      .sort((a, b) => a.distance - b.distance).slice(0, 3);
    const alpha = 1 - Math.exp(-step * 12);
    // Preserve voice identity when two nearby cars exchange distance ranking.
    const assigned = new Set<number>();
    for (const voice of this.rivalVoices) {
      if (nearby.some(rival => rival.id === voice.id)) assigned.add(voice.id);
      else voice.id = -1;
    }
    for (const voice of this.rivalVoices) {
      let rival = nearby.find(candidate => candidate.id === voice.id);
      const continuing = Boolean(rival);
      if (!rival) rival = nearby.find(candidate => !assigned.has(candidate.id));
      let level = 0;
      if (rival) {
        voice.id = rival.id;
        assigned.add(rival.id);
        const closingSpeed = continuing ? (voice.distance - rival.distance) / step : 0;
        const doppler = Math.min(1.16, Math.max(0.86, 343 / (343 - closingSpeed)));
        voice.distance = rival.distance;
        const frequency = Math.max(70, rival.rpm / 20) * doppler;
        voice.oscillator.frequency.value += (frequency - voice.oscillator.frequency.value) * alpha;
        const harmonic = frequency * (2.015 + clamp01(rival.throttle) * 0.018);
        voice.harmonic.frequency.value += (harmonic - voice.harmonic.frequency.value) * alpha;
        voice.panner.pan.value += (Math.max(-1, Math.min(1, rival.pan)) - voice.panner.pan.value) * alpha;
        const proximity = Math.max(0, 1 - rival.distance / 90);
        const passEnergy = clamp01(Math.abs(closingSpeed) / 38);
        const occlusion = clamp01(rival.occlusion ?? 0);
        level = (0.002 + 0.032 * proximity * proximity) * (0.5 + clamp01(rival.throttle) * 0.42 + passEnergy * 0.08)
          * (1 - occlusion * .52) * (1 + clamp01(tunnelMix) * .08);
        const cutoff = (700 + proximity * 3300 + clamp01(rival.throttle) * 900) * (1 - occlusion * .62);
        voice.filter.frequency.value += (cutoff - voice.filter.frequency.value) * alpha;
      }
      voice.gain.gain.value += (level - voice.gain.gain.value) * alpha;
    }
  }

  private makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.985 + white * 0.015;
      data[i] = white * 0.72 + brown * 1.8;
    }
    return buffer;
  }

  private buildEngine(ctx: AudioContext): void {
    if (!this.master || !this.noiseBuffer) return;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 2300;
    this.engineFilter.Q.value = 0.48;
    const saturator = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2);
    }
    saturator.curve = curve;
    saturator.oversample = '2x';
    this.engineGain.connect(this.engineFilter).connect(saturator).connect(this.spatialBus!);
    saturator.connect(this.engineRoomInput!);

    // Four-stroke six-cylinder firing rate is rpm / 20.
    const voices: Array<[number, OscillatorType, number]> = [
      [0.5, 'triangle', 0.22], [1, 'triangle', 0.17],
      [1.5, 'sine', 0.105], [2, 'triangle', 0.052],
      [3.02, 'sine', 0.026], [4.03, 'sine', 0.014],
    ];
    for (const [ratio, type, level] of voices) {
      const oscillator = ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = 180 * ratio;
      const gain = ctx.createGain();
      gain.gain.value = level;
      oscillator.connect(gain).connect(this.engineGain);
      oscillator.start();
      this.engineVoices.push({ oscillator, gain, ratio, level });
      this.loopSources.add(oscillator);
    }

    // Ring-gated noise adds combustion texture at the firing frequency.
    const combustionNoise = this.createLoopingNoise(ctx, 0.37);
    const pulseVca = ctx.createGain();
    pulseVca.gain.value = 0.5;
    this.combustionPulse = ctx.createOscillator();
    this.combustionPulse.type = 'sine';
    this.combustionPulse.frequency.value = 180;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.3;
    this.combustionPulse.connect(pulseDepth).connect(pulseVca.gain);
    this.combustionPulse.start();
    this.loopSources.add(this.combustionPulse);
    this.combustionFilter = ctx.createBiquadFilter();
    this.combustionFilter.type = 'bandpass';
    this.combustionFilter.frequency.value = 1450;
    this.combustionFilter.Q.value = 0.85;
    this.combustionGain = ctx.createGain();
    this.combustionGain.gain.value = 0;
    combustionNoise.connect(pulseVca).connect(this.combustionFilter).connect(this.combustionGain).connect(this.engineGain);
  }

  private buildAirAndTrackBeds(ctx: AudioContext): void {
    if (!this.master) return;
    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    this.intakeFilter = ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 2100;
    this.intakeFilter.Q.value = 0.58;
    const intakePan = ctx.createStereoPanner();
    intakePan.pan.value = 0.12;
    this.intakeGain.connect(this.intakeFilter).connect(intakePan).connect(this.spatialBus!);
    this.createLoopingNoise(ctx, 1.11).connect(this.intakeGain);
    this.turboWhine = ctx.createOscillator();
    this.turboWhine.type = 'sine';
    this.turboWhine.frequency.value = 900;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.007;
    this.turboWhine.connect(whineGain).connect(this.intakeGain);
    this.turboWhine.start();
    this.loopSources.add(this.turboWhine);

    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0;
    this.tyreFilter = ctx.createBiquadFilter();
    this.tyreFilter.type = 'bandpass';
    this.tyreFilter.frequency.value = 1250;
    this.tyreFilter.Q.value = 0.9;
    const tyrePan = ctx.createStereoPanner();
    tyrePan.pan.value = -0.08;
    this.createLoopingNoise(ctx, 1.83).connect(this.tyreFilter).connect(this.tyreGain).connect(tyrePan).connect(this.spatialBus!);

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windFilter = ctx.createBiquadFilter();
    // Keep rain transients distinct from the car's continuous air noise.
    this.windFilter.type = this.soundscape === 'rain' ? 'lowpass' : 'highpass';
    this.windFilter.frequency.value = this.soundscape === 'rain' ? 650 : 760;
    if (this.soundscape === 'rain') this.windFilter.Q.value = 0.5;
    this.createLoopingNoise(ctx, 2.29).connect(this.windFilter).connect(this.windGain).connect(this.spatialBus!);

    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.007;
    const crowdBand = ctx.createBiquadFilter();
    crowdBand.type = 'bandpass';
    crowdBand.frequency.value = 520;
    crowdBand.Q.value = 0.32;
    this.createLoopingNoise(ctx, 0.73).connect(crowdBand).connect(this.crowdGain).connect(this.spatialBus!);
  }

  private createLoopingNoise(ctx: AudioContext, offset: number): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.start(0, Math.min(offset, Math.max(0, (this.noiseBuffer?.duration ?? 0) - 0.01)));
    this.loopSources.add(source);
    return source;
  }

  update(telemetry: Telemetry, dt: number, tunnelMix = 0): void {
    if (!this.ctx || !this.engineGain || !this.engineFilter) return;
    // Numerical smoothing at 20 Hz avoids an unbounded automation timeline.
    this.audioAccum += dt;
    this.liftCooldown = Math.max(0, this.liftCooldown - dt);
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    if (this.audioAccum < 0.05) return;
    const step = this.audioAccum;
    this.audioAccum = 0;
    const now = this.ctx.currentTime;
    const rpm = Math.max(1000, telemetry.rpm);
    const firing = rpm / 20;
    const throttle = clamp01(telemetry.throttle);
    const speedFactor = clamp01(telemetry.speed / 82);
    const revFactor = clamp01((rpm - 3500) / 11500);
    const load = 0.36 + throttle * 0.64;
    const alpha = Math.min(1, step / 0.09);
    this.roomMix += (clamp01(tunnelMix) - this.roomMix) * Math.min(1, step / .28);
    // Audio-rate ramps prevent zipper noise at portals. The send closes on
    // exit while the return fades more slowly, preserving a brief natural tail.
    this.engineRoomInput?.gain.setTargetAtTime(this.roomMix,now,.075);
    this.roomGain?.gain.setTargetAtTime(this.roomMix*.32,now,.18);
    if (this.roomFilter) this.roomFilter.frequency.value += (3900 - this.roomFilter.frequency.value) * alpha;
    this.shiftDuck += (1 - this.shiftDuck) * Math.min(1, step / 0.11);

    this.engineVoices.forEach((voice, index) => {
      const flutter = Math.sin(now * (5.1 + index * 0.31)) * (1.2 + throttle * 2.4);
      const target = Math.max(25, firing * voice.ratio + flutter);
      voice.oscillator.frequency.value += (target - voice.oscillator.frequency.value) * alpha;
      const colour = (index < 2 ? 0.82 + throttle * 0.18 : 0.62 + throttle * 0.38)
        * (this.engineSample ? .22 : 1);
      voice.gain.gain.value += (voice.level * colour - voice.gain.gain.value) * alpha;
    });
    if (this.combustionPulse) this.combustionPulse.frequency.value += (firing - this.combustionPulse.frequency.value) * alpha;
    const engineTarget = (0.068 + revFactor * 0.052) * load * this.shiftDuck;
    this.engineGain.gain.value += (engineTarget - this.engineGain.gain.value) * alpha;
    if (this.engineSample && this.engineSampleGain) {
      const rate = Math.max(.42, Math.min(1.7, rpm / 9000)) * (1 + Math.sin(now * 7.1) * 0.0025);
      this.engineSample.playbackRate.value += (rate - this.engineSample.playbackRate.value) * alpha;
      const sampleLevel = .78 * (0.72 + throttle * .28);
      this.engineSampleGain.gain.value += (sampleLevel - this.engineSampleGain.gain.value) * alpha;
    }
    const engineCutoff = (1450 + revFactor * 3300 + throttle * 1850) * (1 - this.roomMix * .08);
    this.engineFilter.frequency.value += (engineCutoff - this.engineFilter.frequency.value) * alpha;

    if (this.combustionGain && this.combustionFilter) {
      this.combustionGain.gain.value += (0.045 + throttle * 0.09 - this.combustionGain.gain.value) * alpha;
      this.combustionFilter.frequency.value += (900 + revFactor * 2100 - this.combustionFilter.frequency.value) * alpha;
    }
    if (this.intakeGain && this.intakeFilter && this.turboWhine) {
      const boost = throttle * (0.3 + revFactor * 0.7);
      this.intakeGain.gain.value += ((0.006 + boost * 0.026) * (this.soundscape === 'rain' ? .45 : 1) - this.intakeGain.gain.value) * alpha;
      this.intakeFilter.frequency.value += (1550 + revFactor * 2500 - this.intakeFilter.frequency.value) * alpha;
      this.turboWhine.frequency.value += (720 + revFactor * 1250 + throttle * 260 - this.turboWhine.frequency.value) * alpha;
    }
    if (this.tyreGain && this.tyreFilter) {
      const surface = telemetry.onTrack ? 0 : 0.42 + speedFactor * 0.4;
      const braking = clamp01(telemetry.brake) * speedFactor * 0.18;
      const slip = Math.max(this.tyreLevel, clamp01(telemetry.wheelSlip), surface, braking);
      this.tyreGain.gain.value += (slip * (0.055 + speedFactor * 0.065) - this.tyreGain.gain.value) * alpha;
      this.tyreFilter.frequency.value += ((telemetry.onTrack ? 1350 : 720) + speedFactor * 820 - this.tyreFilter.frequency.value) * alpha;
    }
    if (this.windGain && this.windFilter) {
      this.windGain.gain.value += (speedFactor * speedFactor * 0.07 * (this.soundscape === 'rain' ? .28 : 1) * (1 - this.roomMix * .35) - this.windGain.gain.value) * alpha;
      const cutoff = this.soundscape === 'rain' ? 500 + speedFactor * 550 : 620 + speedFactor * 1100;
      this.windFilter.frequency.value += (cutoff - this.windFilter.frequency.value) * alpha;
    }
    if (this.crowdGain) {
      const bed = (0.006 + (Math.sin(now * 0.41) * 0.5 + 0.5) * 0.003) * (1 - this.roomMix * .72);
      this.crowdGain.gain.value += (bed - this.crowdGain.gain.value) * Math.min(1, step * 2);
    }

    if (this.previousGear !== null && telemetry.gear !== this.previousGear && telemetry.gear > 0 && rpm > 5000 && telemetry.speed > 2) {
      this.playShiftTransient(telemetry.gear > this.previousGear);
    }
    const throttleDrop = this.previousThrottle - throttle;
    if (throttleDrop > 0.38 && throttle < 0.3 && rpm > 6000 && this.liftCooldown <= 0) {
      this.playLiftTransient(Math.min(1, throttleDrop + revFactor * 0.3));
      this.liftCooldown = 0.28;
    }
    this.previousGear = telemetry.gear;
    this.previousThrottle = throttle;
  }

  setTyreSlip(level: number): void { this.tyreLevel = clamp01(level); }

  private playShiftTransient(upshift: boolean): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    this.shiftDuck = upshift ? 0.42 : 0.68;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = upshift ? 2500 : 1850;
    filter.Q.value = 0.75;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.connect(filter).connect(gain).connect(this.spatialBus!);
    this.playTransient(noise, now, now + 0.12, [filter, gain]);

    const thump = this.ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(upshift ? 105 : 82, now);
    thump.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.001, now);
    thumpGain.gain.exponentialRampToValueAtTime(upshift ? 0.05 : 0.038, now + 0.01);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    thump.connect(thumpGain).connect(this.spatialBus!);
    this.playTransient(thump, now, now + 0.13, [thumpGain]);
  }

  private playLiftTransient(intensity: number): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const air = this.ctx.createBufferSource();
    air.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3100, now);
    filter.frequency.exponentialRampToValueAtTime(1250, now + 0.19);
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.016 + intensity * 0.03, now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    air.connect(filter).connect(gain).connect(this.spatialBus!);
    this.playTransient(air, now, now + 0.22, [filter, gain]);
  }

  collision(impulse: number): void {
    if (!this.ctx || !this.master || this.collisionCooldown > 0) return;
    this.collisionCooldown = 0.08;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(155, now);
    oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.24, 0.055 + impulse * 0.012), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    oscillator.connect(gain).connect(this.spatialBus!);
    this.playTransient(oscillator, now, now + 0.27, [gain]);
  }

  lapTone(): void { this.beep(880, 0.14, 0.12); }
  sectorTone(): void { this.beep(660, 0.1, 0.075); }

  private beep(frequency: number, duration: number, level: number): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    this.playTransient(oscillator, now, now + duration + 0.02, [gain]);
  }

  private playTransient(source: AudioScheduledSourceNode, start: number, stop: number, nodes: AudioNode[]): void {
    this.transientSources.add(source);
    nodes.forEach((node) => this.transientNodes.add(node));
    source.onended = () => {
      this.transientSources.delete(source);
      source.disconnect();
      for (const node of nodes) {
        node.disconnect();
        this.transientNodes.delete(node);
      }
    };
    source.start(start);
    source.stop(stop);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.hologram?.setPaused(paused);
    this.koi?.setPaused(paused);
    this.billboard?.setPaused(paused);
    if (!paused) void this.ctx?.resume().catch(() => undefined);
    this.applyMasterLevel();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyMasterLevel();
    return this.muted;
  }

  private applyMasterLevel(): void {
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : 0.68, now, 0.018);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeUnlockListeners();
    this.hologram?.dispose();
    this.koi?.dispose();
    this.billboard?.dispose();
    this.rain?.dispose();
    for (const source of [...this.loopSources, ...this.transientSources]) {
      try { source.stop(); } catch { /* The source may already have ended. */ }
      source.disconnect();
    }
    this.loopSources.clear();
    this.transientSources.clear();
    for (const node of this.transientNodes) node.disconnect();
    this.transientNodes.clear();
    this.master?.disconnect();
    this.spatialBus?.disconnect();
    this.roomGain?.disconnect();
    this.engineRoomInput?.disconnect();
    this.roomFilter?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
