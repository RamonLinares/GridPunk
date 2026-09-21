import * as THREE from 'three';
import { createNeonEnvironment } from './NeonEnvironment';
import type { TrackBuilder } from './track/TrackBuilder';
import type { PylonEntry } from './ScoringPylon';
import type { SunLighting } from '../systems/SunLighting';

export interface EnvironmentHandles {
  ready?: Promise<void>;
  koiHolograms?: import('../systems/HologramAudio').HologramAudioScene;
  billboardAudio?: import('../systems/HologramAudio').HologramAudioScene;
  holograms?: import('../systems/HologramAudio').HologramAudioScene;
  group: THREE.Group;
  disposeExtraResources?(): void;
  sun: THREE.DirectionalLight;
  sunLighting: SunLighting;
  sky: THREE.Mesh;
  update(focus?: THREE.Vector3, seconds?: number): void;
  /** A scene holding only the sky dome, for baking the reflection environment. */
  createSkyProbeScene(): THREE.Scene;
  /** Fits the shadow cascades to the camera; call after the camera moves, before rendering. */
  updateShadows(): void;
  /** Registers every lit material below `root` with the cascade shadow shader. */
  prepareShadowMaterials(root: THREE.Object3D): void;
  setShadows(enabled: boolean): void;
  setShadowMapSize(size: number): void;
  /** Cinematic tier: flat blue fill lighting, self-lit signage glitches and extra street clutter. */
  setCinematic?(enabled: boolean): void;
  updateStandings(lap: number, seconds: number, entries: PylonEntry[]): void;
}

export function createEnvironment(scene: THREE.Scene, builder: TrackBuilder, camera: THREE.PerspectiveCamera): EnvironmentHandles {
  return createNeonEnvironment(scene, builder, camera);
}
