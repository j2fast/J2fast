// Shared area types.

import type * as THREE from 'three';
import type { AreaId } from '../data/areaIds';
import type { Cond } from '../data/dialogue';
import type { AmbientConfig } from '../render/effects';
import type { Collider } from './terrain';

export interface SpawnPoint {
  x: number;
  z: number;
  yaw: number;
}

export interface Marker {
  x: number;
  z: number;
  r: number;
}

export interface ExitDef {
  id: string;
  x: number;
  z: number;
  r: number;
  to: AreaId;
  spawn: string;
  label: string;
  requires?: Cond;
  lockedText?: string;
}

export type InteractKind = 'chest' | 'brazier' | 'wayshrine' | 'seal' | 'lantern';

export interface InteractDef {
  id: string;
  kind: InteractKind;
  x: number;
  z: number;
  yaw?: number;
  /** Chest contents. */
  loot?: { coins?: number; items?: { id: string; qty?: number }[]; equipmentTier?: number; rarityLuck?: number };
  /** Only interactable when this condition passes. */
  requires?: Cond;
}

export interface NpcPlace {
  id: string;
  x: number;
  z: number;
  yaw: number;
  showIf?: Cond;
}

export interface EnemySpawnDef {
  id: string;
  enemy: string;
  x: number;
  z: number;
  level: number;
  /** Seconds before respawning (training dummies). */
  respawn?: number;
}

export interface BossPlacement {
  enemy: string;
  x: number;
  z: number;
  yaw: number;
  arena: Marker;
  /** Entering this circle starts the fight. */
  trigger: Marker;
  /** Barrier closing the arena entrance during the fight. */
  gate: { x: number; z: number; width: number; yaw: number };
  /** Only spawn when this passes (e.g. quest stage reached). */
  requires?: Cond;
}

export interface EnvDef {
  skyTop: number;
  skyBottom: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** Strength of the player's hip-lantern light. */
  lanternIntensity: number;
  stars?: boolean;
  moon?: boolean;
}

export interface AreaBuild {
  id: AreaId;
  name: string;
  size: number;
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  walkable?: (x: number, z: number) => boolean;
  /** Indoor areas pull the camera in when it would leave walkable space. */
  indoor?: boolean;
  colliders: Collider[];
  spawns: Record<string, SpawnPoint>;
  markers: Record<string, Marker>;
  exits: ExitDef[];
  interactables: InteractDef[];
  npcs: NpcPlace[];
  enemies: EnemySpawnDef[];
  boss?: BossPlacement;
  ambient: AmbientConfig | null;
  env: EnvDef;
  music: string;
  tier: number;
  water?: { level: number; slow: number };
  /** Per-frame animation of scenery (flames, water, banners). */
  animate?: (t: number, dt: number) => void;
  /** Lights placed in the scene (managed by the world for quality settings). */
  lights: THREE.Light[];
}
