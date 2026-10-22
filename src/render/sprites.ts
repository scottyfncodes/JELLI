import { hexToRgb } from '../core/math';

const glowCache = new Map<string, HTMLCanvasElement>();

/** A soft radial glow, pre-rendered once per color and blitted with additive blending (no shadowBlur). */
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  const size = 64;
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  grad.addColorStop(0.25, `rgba(${r},${gg},${b},0.55)`);
  grad.addColorStop(0.6, `rgba(${r},${gg},${b},0.14)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(color, c);
  return c;
}

export function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, radius: number, alpha: number): void {
  if (alpha <= 0.01 || radius <= 0.5) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = prev;
}
