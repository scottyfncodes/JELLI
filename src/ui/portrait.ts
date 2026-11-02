import type { SpeciesDef } from '../content/types';
import type { SkinDef } from '../content/unlocks';
import type { MutationId } from '../content/mutations';
import type { PersonalityId } from '../content/personality';
import { drawOctopus, proceduralArms, type OctoLook } from '../render/octopus';
import type { OctoVariant } from '../content/octopus';
import type { FormId } from '../content/forms';
import { drawCreatureShape, drawJelly, jellyStyleForSpecies, lookFor, type JellyStyle } from '../render/creatures';
import { drawGlow } from '../render/sprites';

const SILHOUETTE = '#1b2a62';

/** Display radius per shape so every portrait fills its frame nicely. */
const FIT: Partial<Record<SpeciesDef['shape'], number>> = {
  needlefin: 0.22,
  eel: 0.15,
  minnow: 0.3,
  fry: 0.32,
  shrimp: 0.22,
  krill: 0.3,
  ray: 0.3,
  angler: 0.3,
  squid: 0.28,
  siphonophore: 0.34,
  seahorse: 0.28,
  jelly: 0.25,
  moray: 0.17,
  razorfin: 0.3,
  shark: 0.22,
  comb: 0.3,
  octopus: 0.17,
  crab: 0.3,
  clam: 0.28,
  whale: 0.2,
};

function prep(canvas: HTMLCanvasElement, cssSize: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function backdrop(ctx: CanvasRenderingContext2D, s: number, color: string | null): void {
  const g = ctx.createRadialGradient(s / 2, s * 0.45, 0, s / 2, s / 2, s * 0.7);
  g.addColorStop(0, '#163a72');
  g.addColorStop(1, '#070d2c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  if (color) {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, color, s / 2, s / 2, s * 0.5, 0.35);
    ctx.globalCompositeOperation = 'source-over';
  }
}

export function renderPortrait(canvas: HTMLCanvasElement, def: SpeciesDef, known: boolean, cssSize: number, t = 1.2): void {
  const ctx = prep(canvas, cssSize);
  const s = cssSize;
  backdrop(ctx, s, known ? def.colors.glow : null);
  const r = s * (FIT[def.shape] ?? 0.3);
  ctx.save();
  ctx.translate(s / 2, s / 2);
  if (def.shape === 'jelly') {
    ctx.translate(0, -r * 0.4);
    drawJelly(ctx, r, t, 0.3, known ? jellyStyleForSpecies(def) : { bell: SILHOUETTE, rim: SILHOUETTE, organ: SILHOUETTE, tentacle: SILHOUETTE, glow: SILHOUETTE }, null, !known);
  } else {
    const shift = def.shape === 'eel' ? r * 1.25 : def.shape === 'moray' ? r * 0.9 : def.shape === 'shark' ? r * 0.15 : def.shape === 'needlefin' ? 0 : def.shape === 'shrimp' ? -r * 0.4 : 0;
    ctx.translate(shift, 0);
    drawCreatureShape(ctx, def, lookFor(def, known ? undefined : SILHOUETTE), { r, t, alert: 0, puffed: 0 });
  }
  ctx.restore();
  if (!known) {
    ctx.fillStyle = 'rgba(234,246,255,0.5)';
    ctx.font = `600 ${Math.round(s * 0.22)}px Fraunces Variable, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', s / 2, s / 2 + s * 0.02);
  }
}

function octoLook(style: JellyStyle): OctoLook {
  return { skin: style.bell, spots: style.organ, arm: style.tentacle, rim: style.rim, glow: style.glow };
}

/** Draws a posed octopus centred in a portrait, with the given mutations, forms and character. */
function posedOctopus(ctx: CanvasRenderingContext2D, s: number, style: JellyStyle, mutations: readonly MutationId[], forms: readonly FormId[], maturity: number, personality: PersonalityId | null, flat = false, t = 1.2, variant?: OctoVariant): void {
  const r = s * 0.17 * (mutations.includes('gigantism') ? 1.12 : 1);
  ctx.save();
  ctx.translate(s / 2, s * 0.42);
  drawOctopus(
    ctx,
    flat ? { skin: SILHOUETTE, spots: SILHOUETTE, arm: SILHOUETTE, rim: SILHOUETTE, glow: SILHOUETTE } : octoLook(style),
    { r, t, squeeze: 0.2, mutations, forms, armsLost: 0, regrow: 1, lookX: 0.15, lookY: 0.25, open: 1, mood: 'calm', camo: 0, camoColor: '#000000', alarm: 0, lum: 0.3, personality, flat, variant },
    proceduralArms(r, t, mutations, maturity, personality),
  );
  ctx.restore();
}

export function renderSkin(canvas: HTMLCanvasElement, skin: SkinDef, cssSize: number): void {
  const ctx = prep(canvas, cssSize);
  ctx.clearRect(0, 0, cssSize, cssSize);
  posedOctopus(ctx, cssSize, skin, [], [], 0.2, null);
}

/** A particular octopus as it grew: its colors, mutations, forms, size and character. */
export function renderOctopus(canvas: HTMLCanvasElement, style: JellyStyle, mutations: readonly MutationId[], forms: readonly FormId[], maturity: number, cssSize: number, personality: PersonalityId | null = null, t = 1.2, variant?: OctoVariant): void {
  const ctx = prep(canvas, cssSize);
  backdrop(ctx, cssSize, style.glow);
  posedOctopus(ctx, cssSize, style, mutations, forms, maturity, personality, false, t, variant);
}

/** One form worn by a plain octopus, or its silhouette while still unknown. */
export function renderForm(canvas: HTMLCanvasElement, style: JellyStyle, form: FormId, known: boolean, cssSize: number): void {
  if (known) {
    renderOctopus(canvas, style, [], [form], 0.4, cssSize);
    return;
  }
  const ctx = prep(canvas, cssSize);
  const s = cssSize;
  backdrop(ctx, s, null);
  posedOctopus(ctx, s, style, [], [], 0.4, null, true);
  ctx.fillStyle = 'rgba(234,246,255,0.5)';
  ctx.font = `600 ${Math.round(s * 0.22)}px Fraunces Variable, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', s / 2, s * 0.44);
}
