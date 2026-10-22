import { TAU, rgba } from '../core/math';
import { drawGlow } from './sprites';

export const enum PKind {
  Spark,
  Ring,
  Bubble,
  Ink,
}

interface Particle {
  active: boolean;
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  drag: number;
}

/** Fixed-size particle pool: no allocation during play. */
export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;
  scale = 1;

  constructor(size = 420) {
    for (let i = 0; i < size; i++) {
      this.pool.push({ active: false, kind: PKind.Spark, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, grow: 0, color: '#fff', drag: 1 });
    }
  }

  emit(kind: PKind, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, grow = 0, drag = 1.5): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.grow = grow;
    p.color = color;
    p.drag = drag;
  }

  burst(x: number, y: number, count: number, speed: number, size: number, color: string, life = 0.7): void {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emit(PKind.Spark, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), color);
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      if (p.kind === PKind.Bubble) p.vy -= 40 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number, w: number, h: number): void {
    const prevOp = ctx.globalCompositeOperation;
    for (const p of this.pool) {
      if (!p.active) continue;
      const sx = (p.x - camX) * zoom + w / 2;
      const sy = (p.y - camY) * zoom + h / 2;
      const s = p.size * zoom;
      if (sx < -s - 20 || sy < -s - 20 || sx > w + s + 20 || sy > h + s + 20) continue;
      const f = p.life / p.max;
      switch (p.kind) {
        case PKind.Spark:
          ctx.globalCompositeOperation = 'lighter';
          drawGlow(ctx, p.color, sx, sy, s * 2.2, f);
          break;
        case PKind.Ring:
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = rgba(p.color, 0.6 * f);
          ctx.lineWidth = Math.max(1, 3 * f * zoom);
          ctx.beginPath();
          ctx.arc(sx, sy, s, 0, TAU);
          ctx.stroke();
          break;
        case PKind.Bubble:
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = rgba('#d8f6ff', 0.45 * Math.min(1, f * 2));
          ctx.lineWidth = Math.max(0.8, 0.12 * s);
          ctx.beginPath();
          ctx.arc(sx, sy, s, 0, TAU);
          ctx.stroke();
          break;
        case PKind.Ink:
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = rgba(p.color, 0.35 * f);
          ctx.beginPath();
          ctx.arc(sx, sy, s, 0, TAU);
          ctx.fill();
          break;
      }
    }
    ctx.globalCompositeOperation = prevOp;
  }
}
