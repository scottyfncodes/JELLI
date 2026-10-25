import type { PlayerStats } from './types';

/**
 * Forms: what Jelli takes from remarkable meals. Swallow a hunter or a rare creature
 * and part of it grows onto your bell for the rest of the run, the way a sea slug keeps
 * the stinging cells of what it eats. One form can pass on to the next Jelli.
 */
export type FormId = 'razor' | 'needle' | 'moray' | 'lantern' | 'lure' | 'maw' | 'prism' | 'gilded' | 'aurora';

export interface FormDef {
  id: FormId;
  name: string;
  /** The species that has to be eaten. */
  source: string;
  /** What it does, in a few words. */
  desc: string;
  /** Field notes shown while the form is still unknown. */
  hint: string;
  color: string;
  add?: Partial<PlayerStats>;
  mul?: Partial<PlayerStats>;
}

export const FORMS: Record<FormId, FormDef> = {
  razor: {
    id: 'razor',
    name: 'Razor Fringe',
    source: 'razorfin',
    desc: 'One more arm hunts at once.',
    hint: 'Small red hunters run in packs. Grow, then bite back.',
    color: '#ff8f8f',
    add: { extraArms: 1 },
  },
  needle: {
    id: 'needle',
    name: 'Needle Crown',
    source: 'needlefin',
    desc: 'Bursts fling your arms much further.',
    hint: 'A living spear. What if you swallowed one?',
    color: '#e8f1ff',
    add: { burstMaw: 0.3 },
    mul: { burstPower: 1.12 },
  },
  moray: {
    id: 'moray',
    name: 'Moray Mottle',
    source: 'coral-moray',
    desc: 'Your arms snake through coral.',
    hint: 'Something lives in the reef. Pull it out.',
    color: '#d9ff6b',
    add: { coralReach: 1 },
  },
  lantern: {
    id: 'lantern',
    name: 'Lantern Belt',
    source: 'lanternshark',
    desc: 'Your light reaches much further in the dark.',
    hint: 'A ring of lights circles in the deep.',
    color: '#7fe3ff',
    add: { lightRadius: 110 },
  },
  lure: {
    id: 'lure',
    name: 'Angler Lure',
    source: 'lure-angler',
    desc: 'Small prey swim toward your lure.',
    hint: 'A warm light waits in the Abyss. Turn the tables on it.',
    color: '#ffe07a',
    add: { magnet: 80 },
  },
  maw: {
    id: 'maw',
    name: 'Gulper Maw',
    source: 'gulper-eel',
    desc: 'Every meal feeds you a third more.',
    hint: 'Mostly mouth. Only a swollen jelly could swallow one.',
    color: '#ff7a9c',
    mul: { foodMult: 1.3 },
  },
  prism: {
    id: 'prism',
    name: 'Prism Bell',
    source: 'prism-seahorse',
    desc: 'Catch chains last longer.',
    hint: 'Every color at once, clinging to the shallow reef.',
    color: '#ff9ff3',
    add: { comboBonus: 1.5 },
  },
  gilded: {
    id: 'gilded',
    name: 'Gilded Spiral',
    source: 'golden-nautilus',
    desc: 'Pearls drift to you.',
    hint: 'A gilded shell rises when the night is old.',
    color: '#ffd27a',
    add: { pearlMagnet: 170 },
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora Curtain',
    source: 'aurora-jelly',
    desc: 'Hunters notice you later.',
    hint: 'A cousin who only answers a bright glow.',
    color: '#7dffb9',
    mul: { detectMult: 0.85 },
  },
};

export const FORM_ORDER: FormId[] = ['razor', 'needle', 'moray', 'prism', 'lantern', 'gilded', 'aurora', 'lure', 'maw'];

/** The form a species grants when eaten, if any. */
export const FORM_BY_SOURCE: Record<string, FormId> = Object.fromEntries(FORM_ORDER.map((id) => [FORMS[id].source, id]));

export function isFormId(v: unknown): v is FormId {
  return typeof v === 'string' && v in FORMS;
}
