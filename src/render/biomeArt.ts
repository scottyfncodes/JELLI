import { ZONES, zoneAt } from '../content/world';
import type { ZoneId } from '../content/types';
import { clamp, hexToRgb, lerp } from '../core/math';

export type RGB = [number, number, number];

/**
 * Each biome's color language. Sunlit turquoise in the shallows, cobalt in the gardens, indigo
 * and violet in the twilight, jade-lit navy among the ruins, near-black in the abyss, and the
 * unexplained red of the Hadal Dream. Every layer of the backdrop takes its colors from here.
 */
export interface BiomeArt {
  /** Water at the top and bottom of the biome. */
  top: string;
  bottom: string;
  /** What distant shapes fade into. */
  haze: string;
  /** Far formations, and the light catching their upper edges. */
  far: string;
  farLit: string;
  /** Midground silhouettes and their rim light. */
  mid: string;
  midLit: string;
  /** Near-black foreground framing. */
  fore: string;
  /** Color of sunlight shafts, and how strong they are (0 in the dark). */
  sun: string;
  sunK: number;
  /** Strength of caustic light on the reef. */
  caustics: number;
  /** Bioluminescent accents of this biome's life and scenery. */
  accents: string[];
  /** Marine snow tint. */
  snow: string;
}

export const BIOME_ART: Record<ZoneId, BiomeArt> = {
  shallows: {
    top: '#47c9d3',
    bottom: '#1f84b2',
    haze: '#5ccbdc',
    far: '#2c94b4',
    farLit: '#a8f1ee',
    mid: '#16618a',
    midLit: '#7fe6e0',
    fore: '#0a3149',
    sun: '#eafff6',
    sunK: 1,
    caustics: 1,
    accents: ['#ff9a76', '#ffc46b', '#ff7aa2'],
    snow: '#e8fbff',
  },
  gardens: {
    top: '#1b6cb6',
    bottom: '#183f92',
    haze: '#2a63ae',
    far: '#1c4a92',
    farLit: '#46c3c8',
    mid: '#10336e',
    midLit: '#46e8b4',
    fore: '#071b45',
    sun: '#bfeaff',
    sunK: 0.45,
    caustics: 0.3,
    accents: ['#7dffb9', '#ff7fd0', '#ffd27a'],
    snow: '#cfe9ff',
  },
  twilight: {
    top: '#1c368c',
    bottom: '#1d1f63',
    haze: '#283286',
    far: '#1b2470',
    farLit: '#6a72e0',
    mid: '#12174e',
    midLit: '#a99aff',
    fore: '#090b30',
    sun: '#9fb4ff',
    sunK: 0.14,
    caustics: 0,
    accents: ['#8fb4ff', '#c59bff', '#7fe3ff'],
    snow: '#c9d2ff',
  },
  forgotten: {
    top: '#14295a',
    bottom: '#0b1c38',
    haze: '#173a50',
    far: '#143246',
    farLit: '#3f9a8a',
    mid: '#0d2434',
    midLit: '#5ee0b0',
    fore: '#05111c',
    sun: '#7fe0c0',
    sunK: 0,
    caustics: 0,
    accents: ['#5ee0b0', '#ffd27a', '#7fe3ff'],
    snow: '#bfe6dc',
  },
  abyss: {
    top: '#0a1230',
    bottom: '#04061a',
    haze: '#0b1230',
    far: '#0a0f28',
    farLit: '#2c3a78',
    mid: '#070b1e',
    midLit: '#7fe3ff',
    fore: '#02040f',
    sun: '#7fe3ff',
    sunK: 0,
    caustics: 0,
    accents: ['#7fe3ff', '#ff6fd8', '#9dff8a'],
    snow: '#b8c8ff',
  },
  hadal: {
    top: '#1c0628',
    bottom: '#34081c',
    haze: '#3c0c2e',
    far: '#2c0a2c',
    farLit: '#b0306e',
    mid: '#1e0620',
    midLit: '#ff6fae',
    fore: '#0e020c',
    sun: '#ff6fae',
    sunK: 0,
    caustics: 0,
    accents: ['#ff6fae', '#ffb38a', '#c59bff'],
    snow: '#ffb0d6',
  },
};

/** Blended palette for one depth: every color as RGB so layers can mix them cheaply. */
export interface Palette {
  zone: ZoneId;
  water: RGB;
  haze: RGB;
  far: RGB;
  farLit: RGB;
  mid: RGB;
  midLit: RGB;
  fore: RGB;
  sun: RGB;
  sunK: number;
  caustics: number;
  snow: RGB;
  accents: string[];
}

const RGB_CACHE = new Map<string, RGB>();
function rgb(hex: string): RGB {
  let v = RGB_CACHE.get(hex);
  if (!v) RGB_CACHE.set(hex, (v = hexToRgb(hex)));
  return v;
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function css(c: RGB, a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

/** Blends across this far either side of a biome border, so arriving somewhere new is gradual. */
const BLEND = 700;

/** Water color at a depth: each biome shades from its top color to its bottom color. */
export function waterColor(y: number): RGB {
  const z = zoneAt(y);
  const art = BIOME_ART[z.id];
  const span = Number.isFinite(z.bottom) ? z.bottom - z.top : 5000;
  const k = clamp((y - z.top) / span, 0, 1);
  const own = mixRGB(rgb(art.top), rgb(art.bottom), k);
  // Ease into the next biome's top color over the last stretch, so borders never show as a line.
  const i = ZONES.indexOf(z);
  const next = ZONES[i + 1];
  if (next && y > z.bottom - BLEND) {
    const t = clamp((y - (z.bottom - BLEND)) / BLEND, 0, 1);
    return mixRGB(own, rgb(BIOME_ART[next.id].top), t * 0.5);
  }
  const prev = ZONES[i - 1];
  if (prev && y < z.top + BLEND) {
    const t = clamp((y - z.top) / BLEND, 0, 1);
    return mixRGB(mixRGB(rgb(BIOME_ART[prev.id].bottom), own, 0.5), own, t);
  }
  return own;
}

/** The palette at a depth, blended between neighbouring biomes near their borders. */
export function paletteAt(y: number): Palette {
  const z = zoneAt(y);
  const i = ZONES.indexOf(z);
  let other = z;
  let t = 0;
  if (ZONES[i + 1] && y > z.bottom - BLEND) {
    other = ZONES[i + 1];
    t = clamp((y - (z.bottom - BLEND)) / (BLEND * 2), 0, 0.5);
  } else if (ZONES[i - 1] && y < z.top + BLEND) {
    other = ZONES[i - 1];
    t = clamp(0.5 - (y - z.top) / (BLEND * 2), 0, 0.5);
  }
  const a = BIOME_ART[z.id];
  const b = BIOME_ART[other.id];
  const m = (k: keyof BiomeArt) => mixRGB(rgb(a[k] as string), rgb(b[k] as string), t);
  return {
    zone: z.id,
    water: waterColor(y),
    haze: m('haze'),
    far: m('far'),
    farLit: m('farLit'),
    mid: m('mid'),
    midLit: m('midLit'),
    fore: m('fore'),
    sun: m('sun'),
    sunK: lerp(a.sunK, b.sunK, t),
    caustics: lerp(a.caustics, b.caustics, t),
    snow: m('snow'),
    accents: a.accents,
  };
}
