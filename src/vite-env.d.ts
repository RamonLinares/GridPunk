/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  circuit: 'neon';
  trackLength: number;
  frame: number;
  elapsed: number;
  fps: number;
  frameStats: { samples: number; p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number; over33Ms: number };
  audio: { state: string; muted: boolean; paused: boolean; engineSample: string; loopSources: number; transientSources: number; roomMix: number };
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
    rpm: number;
    gear: number;
    yaw: number;
  };
  camera: string;
  rivalsAhead: number;
  rivalSpeeds: number[];
  playerRace: number;
  sceneChildren: number;
  heapMB: number;
  rivalRaces: number[];
  playerCarContacts: number;
  playerContactEvents: number;
  playerContactSeconds: number;
  contactResidualMetres: number;
  rivalPositions: { x: number; z: number; yaw: number }[];
  cameraPosition: { x: number; y: number; z: number };
  sunIntensity: number;
  lap: number;
  started: boolean;
  countdown: number;
  assistLevel: 'easy' | 'normal' | 'hard';
  opponentDifficulty: 'easy' | 'normal' | 'hard';
  quality: {
    preset: 'auto' | 'performance' | 'quality' | 'extreme' | 'cinematic';
    level: number;
    lastSampleFps: number;
    dprCap: number;
    shadows: boolean;
    post: boolean;
  };
  mapMode: boolean;
  lapTime: number;
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
}
