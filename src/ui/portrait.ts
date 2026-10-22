import type { SpeciesDef } from '../content/types';
import type { SkinDef } from '../content/unlocks';
import { drawCreatureShape, drawJelly, jellyStyleForSpecies, lookFor } from '../render/creatures';
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

export function renderSkin(canvas: HTMLCanvasElement, skin: SkinDef, cssSize: number): void {
  const ctx = prep(canvas, cssSize);
  ctx.clearRect(0, 0, cssSize, cssSize);
  ctx.save();
  ctx.translate(cssSize / 2, cssSize * 0.42);
  drawJelly(ctx, cssSize * 0.22, 1, 0.3, skin, null, false);
  ctx.restore();
}
