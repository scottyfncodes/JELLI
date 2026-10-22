import type { PathId } from './types';

export interface SkinDef {
  id: string;
  name: string;
  bell: string;
  rim: string;
  organ: string;
  tentacle: string;
  glow: string;
}

export const SKINS: SkinDef[] = [
  { id: 'moon', name: 'Moonlight', bell: '#bfe9ff', rim: '#e8f8ff', organ: '#e9b8ff', tentacle: '#a8dcff', glow: '#7fe3ff' },
  { id: 'coral', name: 'Coral Bloom', bell: '#ffc2c7', rim: '#fff0f1', organ: '#ff8fa3', tentacle: '#ffb0b8', glow: '#ff9fb0' },
  { id: 'aurora', name: 'Aurora', bell: '#a6ffd6', rim: '#efffff', organ: '#c59bff', tentacle: '#8ff0d4', glow: '#7dffb9' },
  { id: 'nettle', name: 'Nettle', bell: '#d5c2ff', rim: '#f6f0ff', organ: '#ff8fe0', tentacle: '#b89cff', glow: '#b48bff' },
  { id: 'abyssal', name: 'Abyssal', bell: '#7f8cff', rim: '#c9d0ff', organ: '#5ee0d0', tentacle: '#7080e8', glow: '#6f7dff' },
  { id: 'gilded', name: 'Gilded', bell: '#ffe2a3', rim: '#fff8e6', organ: '#ffb347', tentacle: '#ffd98a', glow: '#ffd27a' },
];

export const SKINS_BY_ID: Record<string, SkinDef> = Object.fromEntries(SKINS.map((s) => [s.id, s]));

export interface TraitDef {
  id: string;
  name: string;
  path: PathId;
  desc: string;
}

/** Starting traits begin a run with tier 1 of a path already grown. */
export const TRAITS: TraitDef[] = [
  { id: 'seed-glow', name: 'Glow Seed', path: 'glow', desc: 'Start every run with Lumen Bloom.' },
  { id: 'seed-surge', name: 'Surge Seed', path: 'surge', desc: 'Start every run with Jet Bell.' },
  { id: 'seed-sting', name: 'Sting Seed', path: 'sting', desc: 'Start every run with Nettle Fringe.' },
];

export const TRAITS_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

/** Unlock ids look like `skin:coral` or `trait:seed-glow`. */
export type UnlockId = `skin:${string}` | `trait:${string}`;

export const DEFAULT_UNLOCKS: UnlockId[] = ['skin:moon'];
