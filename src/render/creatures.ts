import type { SpeciesDef } from '../content/types';
import type { SkinDef } from '../content/unlocks';
import type { Tiers } from '../content/evolutions';
import { TAU, rgba } from '../core/math';
import { drawGlow } from './sprites';

export interface Look {
  body: string;
  accent: string;
  glow: string;
  /** Silhouette mode: flat fill, no light. Used for undiscovered Field Guide entries. */
  flat: boolean;
}

export function lookFor(def: SpeciesDef, silhouette?: string): Look {
  if (silhouette) return { body: silhouette, accent: silhouette, glow: silhouette, flat: true };
  return { body: def.colors.body, accent: def.colors.accent, glow: def.colors.glow, flat: false };
}

export interface Pose {
  r: number;
  t: number;
  /** 0 calm, 1 alert/attacking. */
  alert: number;
  puffed: number;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

/**
 * Draws a creature centered at the origin facing +x, sized from its collision radius.
 * Jellies are handled by drawJelly.
 */
export function drawCreatureShape(ctx: CanvasRenderingContext2D, def: SpeciesDef, look: Look, pose: Pose): void {
  const { r, t } = pose;
  const a = (alpha: number) => (look.flat ? 1 : alpha);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (def.shape) {
    case 'krill': {
      ctx.fillStyle = rgba(look.body, a(0.9));
      ellipse(ctx, 0, 0, r * 1.5, r * 0.6, Math.sin(t * 6) * 0.1);
      ctx.fill();
      ctx.strokeStyle = rgba(look.accent, a(0.7));
      ctx.lineWidth = Math.max(0.6, r * 0.18);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const x = -r * 0.8 + i * r * 0.5;
        const k = Math.sin(t * 14 + i) * r * 0.3;
        ctx.moveTo(x, r * 0.3);
        ctx.lineTo(x - r * 0.2 + k * 0.3, r * 0.95);
      }
      ctx.stroke();
      if (!look.flat) {
        ctx.fillStyle = '#ffffff';
        ellipse(ctx, r * 1.05, -r * 0.1, r * 0.22, r * 0.22);
        ctx.fill();
      }
      break;
    }
    case 'shrimp': {
      const flick = Math.sin(t * 8) * 0.15;
      ctx.fillStyle = rgba(look.body, a(0.92));
      for (let i = 0; i < 4; i++) {
        const x = r * 0.7 - i * r * 0.55;
        const y = Math.sin(i * 0.8 + flick) * r * 0.18 + i * i * r * 0.04;
        ellipse(ctx, x, y, r * (0.62 - i * 0.08), r * (0.5 - i * 0.07));
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 1.25, r * 0.35);
      ctx.lineTo(-r * 1.9, r * 0.0 + flick * r);
      ctx.lineTo(-r * 1.8, r * 0.8 + flick * r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(look.accent, a(0.8));
      ctx.lineWidth = Math.max(0.5, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(r * 1.1, -r * 0.2);
      ctx.quadraticCurveTo(r * 2.4, -r * 1.2, r * 3.2, -r * 0.6 + Math.sin(t * 3) * r * 0.3);
      ctx.moveTo(r * 1.1, -r * 0.1);
      ctx.quadraticCurveTo(r * 2.2, -r * 0.4, r * 3, r * 0.2 + Math.sin(t * 3 + 1) * r * 0.3);
      ctx.stroke();
      if (!look.flat) {
        ctx.fillStyle = '#1a1030';
        ellipse(ctx, r * 0.95, -r * 0.15, r * 0.14, r * 0.14);
        ctx.fill();
      }
      break;
    }
    case 'butterfly': {
      const flap = Math.sin(t * 5);
      ctx.fillStyle = rgba(look.accent, a(0.45));
      ellipse(ctx, -r * 0.1, -r * 0.6, r * 0.6, r * (0.9 + flap * 0.35), -0.5 + flap * 0.3);
      ctx.fill();
      ellipse(ctx, -r * 0.1, r * 0.6, r * 0.6, r * (0.9 - flap * 0.35), 0.5 - flap * 0.3);
      ctx.fill();
      ctx.fillStyle = rgba(look.body, a(0.95));
      ellipse(ctx, r * 0.2, 0, r * 0.5, r * 0.5);
      ctx.fill();
      if (!look.flat) {
        ctx.strokeStyle = rgba('#ffffff', 0.6);
        ctx.lineWidth = Math.max(0.5, r * 0.08);
        ctx.beginPath();
        ctx.arc(r * 0.2, 0, r * 0.28, 0, Math.PI * 1.4);
        ctx.stroke();
      }
      break;
    }
    case 'fry':
    case 'minnow': {
      const long = def.shape === 'minnow' ? 1.25 : 1;
      const wag = Math.sin(t * (def.shape === 'minnow' ? 12 : 10)) * 0.35;
      ctx.fillStyle = rgba(look.body, a(0.92));
      ctx.beginPath();
      ctx.moveTo(r * 1.2 * long, 0);
      ctx.quadraticCurveTo(r * 0.4, -r * 0.62, -r * 0.8 * long, -r * 0.12);
      ctx.lineTo(-r * 1.5 * long, -r * 0.55 + wag * r * 0.4);
      ctx.lineTo(-r * 1.35 * long, wag * r * 0.3);
      ctx.lineTo(-r * 1.5 * long, r * 0.55 + wag * r * 0.4);
      ctx.lineTo(-r * 0.8 * long, r * 0.12);
      ctx.quadraticCurveTo(r * 0.4, r * 0.62, r * 1.2 * long, 0);
      ctx.fill();
      if (def.shape === 'minnow') {
        ctx.strokeStyle = rgba(look.accent, a(0.85));
        ctx.lineWidth = Math.max(0.6, r * 0.1);
        ctx.beginPath();
        ctx.moveTo(r * 1.0, 0);
        ctx.lineTo(-r * 0.9, 0);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(look.accent, a(0.95));
        for (let i = 0; i < 4; i++) {
          ellipse(ctx, r * 0.5 - i * r * 0.38, r * 0.22, r * 0.08, r * 0.08);
          ctx.fill();
        }
      }
      if (!look.flat) {
        ctx.fillStyle = '#0d1430';
        ellipse(ctx, r * 0.72 * long, -r * 0.12, r * 0.12, r * 0.12);
        ctx.fill();
      }
      break;
    }
    case 'puffer': {
      const pr = r * 0.95;
      ctx.strokeStyle = rgba(look.accent, a(0.9));
      ctx.lineWidth = Math.max(0.8, r * 0.07);
      ctx.beginPath();
      const spikes = 16;
      const len = r * (0.12 + pose.puffed * 0.22);
      for (let i = 0; i < spikes; i++) {
        const ang = (i / spikes) * TAU;
        ctx.moveTo(Math.cos(ang) * pr, Math.sin(ang) * pr);
        ctx.lineTo(Math.cos(ang) * (pr + len), Math.sin(ang) * (pr + len));
      }
      ctx.stroke();
      ctx.fillStyle = rgba(look.body, a(0.95));
      ellipse(ctx, 0, 0, pr, pr * (0.9 + pose.puffed * 0.1));
      ctx.fill();
      if (!look.flat) {
        ctx.fillStyle = rgba('#fff4d6', 0.75);
        ellipse(ctx, r * 0.1, r * 0.35, pr * 0.6, pr * 0.42);
        ctx.fill();
        ctx.fillStyle = rgba(look.accent, 0.5);
        for (let i = 0; i < 5; i++) {
          ellipse(ctx, -r * 0.4 + i * r * 0.2, -r * 0.35 + (i % 2) * r * 0.12, r * 0.07, r * 0.07);
          ctx.fill();
        }
        ctx.fillStyle = '#1a1030';
        ellipse(ctx, r * 0.55, -r * 0.2, r * 0.12, r * 0.12);
        ctx.fill();
      }
      ctx.fillStyle = rgba(look.accent, a(0.8));
      ellipse(ctx, -pr * 1.05, 0, r * 0.2, r * (0.3 + Math.sin(t * 9) * 0.08));
      ctx.fill();
      break;
    }
    case 'squid': {
      const pulse = Math.sin(t * 4);
      ctx.strokeStyle = rgba(look.body, a(0.5));
      ctx.lineWidth = Math.max(0.8, r * 0.07);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const y0 = (i - 2.5) * r * 0.12;
        ctx.moveTo(-r * 0.7, y0);
        ctx.quadraticCurveTo(-r * 1.4, y0 * 2 + Math.sin(t * 5 + i) * r * 0.2, -r * (1.9 + (i % 2) * 0.3), y0 * 2.6 + Math.sin(t * 4 + i) * r * 0.3);
      }
      ctx.stroke();
      ctx.fillStyle = rgba(look.body, a(0.35));
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.quadraticCurveTo(r * 0.6, -r * (0.55 + pulse * 0.05), -r * 0.75, -r * 0.32);
      ctx.lineTo(-r * 0.75, r * 0.32);
      ctx.quadraticCurveTo(r * 0.6, r * (0.55 + pulse * 0.05), r * 1.3, 0);
      ctx.fill();
      ctx.strokeStyle = rgba(look.accent, a(0.55));
      ctx.lineWidth = Math.max(0.6, r * 0.05);
      ctx.stroke();
      if (!look.flat) {
        ctx.fillStyle = rgba(look.glow, 0.95);
        ellipse(ctx, -r * 0.55, -r * 0.18, r * 0.13, r * 0.13);
        ctx.fill();
        ellipse(ctx, -r * 0.55, r * 0.18, r * 0.13, r * 0.13);
        ctx.fill();
      }
      break;
    }
    case 'needlefin': {
      const wag = Math.sin(t * 7) * 0.25 * (1 - pose.alert * 0.7);
      ctx.fillStyle = rgba(look.body, a(1));
      ctx.beginPath();
      ctx.moveTo(r * 1.9, 0);
      ctx.lineTo(r * 1.2, -r * 0.16);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.42, -r * 1.2, -r * 0.18);
      ctx.lineTo(-r * 1.7, -r * 0.5 + wag * r * 0.5);
      ctx.lineTo(-r * 1.5, wag * r * 0.3);
      ctx.lineTo(-r * 1.7, r * 0.5 + wag * r * 0.5);
      ctx.lineTo(-r * 1.2, r * 0.18);
      ctx.quadraticCurveTo(r * 0.2, r * 0.38, r * 1.2, r * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.34);
      ctx.lineTo(-r * 0.8, -r * 0.72);
      ctx.lineTo(-r * 0.75, -r * 0.24);
      ctx.fill();
      if (!look.flat) {
        ctx.fillStyle = rgba(look.accent, 0.55);
        ctx.beginPath();
        ctx.moveTo(r * 1.5, r * 0.02);
        ctx.quadraticCurveTo(r * 0.2, r * 0.3, -r * 1.2, r * 0.08);
        ctx.quadraticCurveTo(r * 0.2, r * 0.16, r * 1.5, r * 0.02);
        ctx.fill();
        ctx.strokeStyle = rgba('#ffffff', 0.35);
        ctx.lineWidth = Math.max(0.5, r * 0.03);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const x = r * 0.6 - i * r * 0.32;
          ctx.moveTo(x, -r * 0.3);
          ctx.lineTo(x - r * 0.1, -r * 0.02);
        }
        ctx.stroke();
        ctx.fillStyle = pose.alert > 0.1 ? '#ff5d5d' : '#f2f6ff';
        ellipse(ctx, r * 1.05, -r * 0.08, r * 0.08, r * 0.08);
        ctx.fill();
      }
      break;
    }
    case 'eel': {
      const open = 0.25 + pose.alert * 0.55 + Math.sin(t * 2) * 0.05;
      // Tail as a tapering sine ribbon.
      ctx.fillStyle = rgba(look.body, a(1));
      ctx.beginPath();
      const segs = 14;
      const len = r * 3.4;
      for (let i = 0; i <= segs; i++) {
        const k = i / segs;
        const x = -r * 0.4 - k * len;
        const y = Math.sin(t * 3 - k * 5) * r * 0.35 * k - r * 0.2 * (1 - k);
        if (i === 0) ctx.moveTo(x, y - r * 0.25);
        else ctx.lineTo(x, y - r * 0.25 * (1 - k) - 0.5);
      }
      for (let i = segs; i >= 0; i--) {
        const k = i / segs;
        const x = -r * 0.4 - k * len;
        const y = Math.sin(t * 3 - k * 5) * r * 0.35 * k + r * 0.2 * (1 - k);
        ctx.lineTo(x, y + r * 0.25 * (1 - k) + 0.5);
      }
      ctx.fill();
      // Head with a huge hinged jaw.
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.45);
      ctx.quadraticCurveTo(r * 0.4, -r * (0.7 + open * 0.3), r * 1.05, -r * (0.15 + open * 0.55));
      ctx.lineTo(r * 0.05, 0);
      ctx.lineTo(r * 1.0, r * (0.15 + open * 0.55));
      ctx.quadraticCurveTo(r * 0.4, r * (0.7 + open * 0.3), -r * 0.6, r * 0.45);
      ctx.closePath();
      ctx.fill();
      if (!look.flat) {
        ctx.fillStyle = rgba('#5a1f3f', 0.85);
        ctx.beginPath();
        ctx.moveTo(r * 0.95, -r * (0.12 + open * 0.5));
        ctx.lineTo(r * 0.1, 0);
        ctx.lineTo(r * 0.9, r * (0.12 + open * 0.5));
        ctx.quadraticCurveTo(r * 0.5, 0, r * 0.95, -r * (0.12 + open * 0.5));
        ctx.fill();
        // Needle teeth along both jaws.
        ctx.fillStyle = '#f2e8ff';
        for (const side of [-1, 1]) {
          for (let i = 1; i <= 4; i++) {
            const k = i / 5;
            const jx = r * 0.1 + k * r * 0.85;
            const jy = side * r * (0.12 + open * 0.5) * k;
            ctx.beginPath();
            ctx.moveTo(jx - r * 0.04, jy);
            ctx.lineTo(jx + r * 0.04, jy);
            ctx.lineTo(jx, jy - side * r * 0.1);
            ctx.fill();
          }
        }
        ctx.fillStyle = pose.alert > 0.1 ? '#ff6b8a' : '#b6c0ff';
        ellipse(ctx, r * 0.3, -r * 0.42, r * 0.07, r * 0.07);
        ctx.fill();
        ctx.fillStyle = rgba(look.glow, 0.9);
        ellipse(ctx, -len - r * 0.4, Math.sin(t * 3 - 5) * r * 0.35, r * 0.1, r * 0.1);
        ctx.fill();
      }
      break;
    }
    case 'angler': {
      const open = 0.15 + pose.alert * 0.5;
      ctx.fillStyle = rgba(look.body, a(1));
      ellipse(ctx, -r * 0.1, 0, r * 0.95, r * 0.85);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, 0);
      ctx.lineTo(-r * 1.5, -r * 0.45 + Math.sin(t * 4) * r * 0.1);
      ctx.lineTo(-r * 1.5, r * 0.45 + Math.sin(t * 4) * r * 0.1);
      ctx.fill();
      // Jaw
      ctx.fillStyle = rgba('#0b0816', a(1));
      ctx.beginPath();
      ctx.moveTo(r * 0.85, -r * 0.1 - open * r * 0.3);
      ctx.lineTo(r * 0.1, r * 0.1);
      ctx.lineTo(r * 0.85, r * 0.3 + open * r * 0.3);
      ctx.closePath();
      ctx.fill();
      if (!look.flat) {
        ctx.fillStyle = '#efe6ff';
        for (let i = 0; i < 5; i++) {
          const x = r * 0.35 + i * r * 0.12;
          ctx.beginPath();
          ctx.moveTo(x, -r * 0.02 - open * r * 0.2 * (i / 4));
          ctx.lineTo(x + r * 0.04, r * 0.12);
          ctx.lineTo(x + r * 0.08, -r * 0.02 - open * r * 0.2 * (i / 4));
          ctx.fill();
        }
        ctx.fillStyle = '#f7f2c8';
        ellipse(ctx, r * 0.3, -r * 0.45, r * 0.09, r * 0.09);
        ctx.fill();
      }
      // Lure stalk
      ctx.strokeStyle = rgba(look.body, a(1));
      ctx.lineWidth = Math.max(1, r * 0.05);
      const lx = r * 1.25 + Math.sin(t * 1.3) * r * 0.1;
      const ly = -r * 0.95 + Math.cos(t * 1.7) * r * 0.08;
      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 0.75);
      ctx.quadraticCurveTo(r * 0.6, -r * 1.6, lx, ly);
      ctx.stroke();
      ctx.fillStyle = rgba(look.accent, a(1));
      ellipse(ctx, lx, ly, r * 0.12, r * 0.12);
      ctx.fill();
      break;
    }
    case 'seahorse': {
      const hue = look.flat ? null : (t * 40) % 360;
      ctx.fillStyle = hue === null ? look.body : `hsla(${hue},95%,78%,0.95)`;
      ctx.strokeStyle = hue === null ? look.body : `hsla(${(hue + 120) % 360},95%,75%,0.9)`;
      ctx.lineWidth = Math.max(1, r * 0.3);
      ctx.save();
      ctx.rotate(-Math.PI / 2 + Math.sin(t * 1.5) * 0.1);
      // Curled tail
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, r * 0.2);
      ctx.quadraticCurveTo(-r * 0.6, r * 1.2, 0, r * 1.5);
      ctx.quadraticCurveTo(r * 0.5, r * 1.6, r * 0.35, r * 1.25);
      ctx.stroke();
      ellipse(ctx, 0, -r * 0.2, r * 0.42, r * 0.7, 0.2);
      ctx.fill();
      ellipse(ctx, r * 0.15, -r * 1.0, r * 0.35, r * 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.3, -r * 1.05);
      ctx.lineTo(r * 1.05, -r * 0.85);
      ctx.lineTo(r * 0.35, -r * 0.8);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.4);
      ctx.lineTo(-r * 0.8, -r * 0.2 + Math.sin(t * 12) * r * 0.1);
      ctx.lineTo(-r * 0.4, r * 0.05);
      ctx.fill();
      if (!look.flat) {
        ctx.fillStyle = '#1a1030';
        ellipse(ctx, r * 0.25, -r * 1.05, r * 0.08, r * 0.08);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'nautilus': {
      ctx.strokeStyle = rgba(look.accent, a(0.8));
      ctx.lineWidth = Math.max(0.6, r * 0.06);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const y0 = (i - 3.5) * r * 0.08;
        ctx.moveTo(r * 0.6, y0);
        ctx.quadraticCurveTo(r * 1.1, y0 * 2 + Math.sin(t * 3 + i) * r * 0.1, r * 1.35, y0 * 3);
      }
      ctx.stroke();
      ctx.fillStyle = rgba(look.body, a(1));
      ellipse(ctx, -r * 0.1, 0, r * 0.9, r * 0.9);
      ctx.fill();
      if (!look.flat) {
        ctx.strokeStyle = rgba('#8a5a1f', 0.65);
        ctx.lineWidth = Math.max(0.8, r * 0.1);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = -Math.PI / 2 + i * 0.5;
          ctx.moveTo(-r * 0.1 + Math.cos(ang) * r * 0.25, Math.sin(ang) * r * 0.25);
          ctx.lineTo(-r * 0.1 + Math.cos(ang) * r * 0.85, Math.sin(ang) * r * 0.85);
        }
        ctx.stroke();
        ctx.strokeStyle = rgba(look.accent, 0.9);
        ctx.lineWidth = Math.max(0.8, r * 0.08);
        ctx.beginPath();
        let rr = r * 0.12;
        let ang = 0;
        ctx.moveTo(-r * 0.1, 0);
        for (let i = 0; i < 30; i++) {
          ang += 0.35;
          rr *= 1.07;
          ctx.lineTo(-r * 0.1 + Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.stroke();
        ctx.fillStyle = '#2a1a08';
        ellipse(ctx, r * 0.55, -r * 0.25, r * 0.08, r * 0.08);
        ctx.fill();
      }
      break;
    }
    case 'ray': {
      const flap = Math.sin(t * 1.6);
      ctx.fillStyle = rgba(look.body, a(0.55));
      ctx.beginPath();
      ctx.moveTo(r * 0.9, 0);
      ctx.quadraticCurveTo(r * 0.3, -r * 0.3, -r * 0.1, -r * (1.3 + flap * 0.25));
      ctx.quadraticCurveTo(-r * 0.4, -r * 0.4, -r * 0.8, 0);
      ctx.quadraticCurveTo(-r * 0.4, r * 0.4, -r * 0.1, r * (1.3 - flap * 0.25));
      ctx.quadraticCurveTo(r * 0.3, r * 0.3, r * 0.9, 0);
      ctx.fill();
      ctx.strokeStyle = rgba(look.accent, a(0.6));
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, 0);
      ctx.quadraticCurveTo(-r * 1.5, Math.sin(t * 2) * r * 0.2, -r * 2.2, Math.sin(t * 2 + 1) * r * 0.3);
      ctx.stroke();
      if (!look.flat) {
        ctx.fillStyle = rgba(look.accent, 0.8);
        ellipse(ctx, r * 0.6, -r * 0.18, r * 0.05, r * 0.05);
        ctx.fill();
        ellipse(ctx, r * 0.6, r * 0.18, r * 0.05, r * 0.05);
        ctx.fill();
      }
      break;
    }
    case 'siphonophore': {
      // Portrait version; the world draws the full chain.
      for (let i = 0; i < 6; i++) {
        const x = r * 1.2 - i * r * 0.5;
        const y = Math.sin(t * 2 + i * 0.8) * r * 0.25;
        ctx.fillStyle = rgba(i % 2 ? look.accent : look.body, a(0.8));
        ellipse(ctx, x, y, r * 0.3, r * 0.22);
        ctx.fill();
      }
      break;
    }
    case 'moray': {
      // Thick spotted body trailing back into the reef, big hinged jaw up front.
      const open = 0.12 + pose.alert * 0.45 + Math.sin(t * 1.6) * 0.04;
      ctx.fillStyle = rgba(look.body, a(1));
      ctx.beginPath();
      const segs = 10;
      const len = r * 2.6;
      for (let i = 0; i <= segs; i++) {
        const k = i / segs;
        const x = -r * 0.2 - k * len;
        const y = Math.sin(t * 2 - k * 4) * r * 0.18 * k;
        if (i === 0) ctx.moveTo(x, y - r * 0.42);
        else ctx.lineTo(x, y - r * 0.42 * (1 - k * 0.5));
      }
      for (let i = segs; i >= 0; i--) {
        const k = i / segs;
        const x = -r * 0.2 - k * len;
        const y = Math.sin(t * 2 - k * 4) * r * 0.18 * k;
        ctx.lineTo(x, y + r * 0.42 * (1 - k * 0.5));
      }
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.45);
      ctx.quadraticCurveTo(r * 0.5, -r * 0.55, r * 1.05, -r * (0.08 + open * 0.4));
      ctx.lineTo(r * 0.25, r * 0.02);
      ctx.lineTo(r * 0.95, r * (0.12 + open * 0.35));
      ctx.quadraticCurveTo(r * 0.45, r * 0.5, -r * 0.3, r * 0.45);
      ctx.closePath();
      ctx.fill();
      if (!look.flat) {
        ctx.fillStyle = rgba(look.accent, 0.55);
        for (let i = 0; i < 9; i++) {
          const k = i / 9;
          ellipse(ctx, r * 0.4 - k * r * 2.6, ((i % 3) - 1) * r * 0.18 + Math.sin(t * 2 - k * 4) * r * 0.18 * k, r * 0.08, r * 0.06);
          ctx.fill();
        }
        ctx.fillStyle = '#3a1020';
        ctx.beginPath();
        ctx.moveTo(r * 1.0, -r * (0.06 + open * 0.38));
        ctx.lineTo(r * 0.3, r * 0.02);
        ctx.lineTo(r * 0.9, r * (0.1 + open * 0.33));
        ctx.fill();
        ctx.fillStyle = '#f7f2d0';
        for (let i = 1; i <= 3; i++) {
          const jx = r * 0.3 + i * r * 0.18;
          ctx.beginPath();
          ctx.moveTo(jx, -r * open * 0.3 * (i / 3) - r * 0.02);
          ctx.lineTo(jx + r * 0.05, r * 0.08);
          ctx.lineTo(jx + r * 0.1, -r * open * 0.3 * (i / 3) - r * 0.02);
          ctx.fill();
        }
        ctx.fillStyle = pose.alert > 0.1 ? '#ff5d5d' : '#f2f6c8';
        ellipse(ctx, r * 0.55, -r * 0.3, r * 0.08, r * 0.08);
        ctx.fill();
      }
      break;
    }
    case 'razorfin': {
      const wag = Math.sin(t * 13) * 0.3;
      ctx.fillStyle = rgba(look.body, a(1));
      ctx.beginPath();
      ctx.moveTo(r * 1.2, r * 0.05);
      ctx.lineTo(r * 0.7, -r * 0.4);
      ctx.lineTo(r * 0.3, -r * 0.85);
      ctx.lineTo(r * 0.1, -r * 0.45);
      ctx.lineTo(-r * 0.2, -r * 0.75);
      ctx.lineTo(-r * 0.4, -r * 0.35);
      ctx.lineTo(-r * 0.9, -r * 0.1);
      ctx.lineTo(-r * 1.4, -r * 0.55 + wag * r * 0.4);
      ctx.lineTo(-r * 1.25, wag * r * 0.2);
      ctx.lineTo(-r * 1.4, r * 0.55 + wag * r * 0.4);
      ctx.lineTo(-r * 0.9, r * 0.15);
      ctx.quadraticCurveTo(r * 0.1, r * 0.75, r * 1.2, r * 0.05);
      ctx.fill();
      if (!look.flat) {
        ctx.fillStyle = rgba(look.accent, 0.7);
        ctx.beginPath();
        ctx.moveTo(r * 1.05, r * 0.15);
        ctx.quadraticCurveTo(r * 0.2, r * 0.6, -r * 0.8, r * 0.18);
        ctx.quadraticCurveTo(r * 0.2, r * 0.3, r * 1.05, r * 0.15);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(r * 1.15, r * 0.08);
        ctx.lineTo(r * 1.0, r * 0.22);
        ctx.lineTo(r * 0.9, r * 0.1);
        ctx.fill();
        ctx.fillStyle = pose.alert > 0.1 ? '#ffe066' : '#1a1030';
        ellipse(ctx, r * 0.7, -r * 0.08, r * 0.1, r * 0.1);
        ctx.fill();
      }
      break;
    }
    case 'shark': {
      const wag = Math.sin(t * 5) * 0.2 * (1 - pose.alert * 0.6);
      ctx.fillStyle = rgba(look.body, a(1));
      ctx.beginPath();
      ctx.moveTo(r * 1.4, r * 0.05);
      ctx.quadraticCurveTo(r * 1.1, -r * 0.4, r * 0.2, -r * 0.42);
      ctx.lineTo(-r * 0.05, -r * 0.95);
      ctx.lineTo(-r * 0.35, -r * 0.4);
      ctx.quadraticCurveTo(-r * 1.0, -r * 0.3, -r * 1.3, -r * 0.08);
      ctx.lineTo(-r * 1.85, -r * 0.7 + wag * r);
      ctx.lineTo(-r * 1.65, r * 0.05 + wag * r * 0.5);
      ctx.lineTo(-r * 1.8, r * 0.45 + wag * r);
      ctx.lineTo(-r * 1.3, r * 0.12);
      ctx.quadraticCurveTo(-r * 0.4, r * 0.42, r * 0.1, r * 0.4);
      ctx.lineTo(-r * 0.2, r * 0.75);
      ctx.lineTo(r * 0.4, r * 0.38);
      ctx.quadraticCurveTo(r * 1.1, r * 0.35, r * 1.4, r * 0.05);
      ctx.fill();
      if (!look.flat) {
        // Belly photophores.
        ctx.fillStyle = rgba(look.accent, 0.95);
        for (let i = 0; i < 8; i++) {
          ellipse(ctx, r * 0.9 - i * r * 0.28, r * 0.28 - Math.abs(i - 3) * r * 0.02, r * 0.045, r * 0.045);
          ctx.fill();
        }
        ctx.strokeStyle = rgba('#000000', 0.35);
        ctx.lineWidth = Math.max(0.6, r * 0.03);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          ctx.moveTo(r * (0.55 - i * 0.1), -r * 0.2);
          ctx.lineTo(r * (0.5 - i * 0.1), r * 0.15);
        }
        ctx.stroke();
        ctx.fillStyle = pose.alert > 0.1 ? '#ff5d5d' : '#cfe8ff';
        ellipse(ctx, r * 0.9, -r * 0.14, r * 0.07, r * 0.07);
        ctx.fill();
      }
      break;
    }
    case 'jelly':
      break;
  }
}

export interface JellyStyle {
  bell: string;
  rim: string;
  organ: string;
  tentacle: string;
  glow: string;
}

export function jellyStyleForSpecies(def: SpeciesDef): JellyStyle {
  return { bell: def.colors.body, rim: '#ffffff', organ: def.colors.accent, tentacle: def.colors.body, glow: def.colors.glow };
}

export function jellyStyleForSkin(skin: SkinDef): JellyStyle {
  return skin;
}

/**
 * Draws a jellyfish with its bell facing local -y (callers rotate so the bell leads).
 * `contraction` 0..1 squeezes the bell; `tiers` add evolution features.
 */
export function drawJelly(
  ctx: CanvasRenderingContext2D,
  r: number,
  t: number,
  contraction: number,
  style: JellyStyle,
  tiers: Tiers | null,
  flat: boolean,
  sway = 0,
): void {
  const w = r * (1.02 - 0.16 * contraction);
  const h = r * (0.82 + 0.16 * contraction);
  const rimY = r * 0.2;
  const glow = tiers?.glow ?? 0;
  const surge = tiers?.surge ?? 0;
  const sting = tiers?.sting ?? 0;
  const al = (v: number) => (flat ? 1 : v);

  if (!flat) {
    drawGlow(ctx, style.glow, 0, -r * 0.2, r * (2.6 + glow * 0.5), 0.28 + glow * 0.08);
    if (glow >= 2) drawGlow(ctx, '#ffd27a', 0, -r * 0.2, r * 3.6, 0.12 + (glow - 2) * 0.08);
  }

  // Tentacles trail behind the bell.
  const count = 7 + sting * 2;
  const tentColor = sting > 0 && !flat ? '#c59bff' : style.tentacle;
  const lenBase = r * (1.9 + surge * 0.45);
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(tentColor, al(0.5));
  ctx.lineWidth = Math.max(0.6, r * (0.055 + sting * 0.008));
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const k = count === 1 ? 0.5 : i / (count - 1);
    const x0 = (k - 0.5) * w * 1.7;
    const len = lenBase * (0.75 + 0.25 * Math.sin(i * 2.3 + 1));
    const ph = t * 2.4 + i * 0.9;
    const s1 = Math.sin(ph) * r * 0.25 + sway * r * 0.4;
    const s2 = Math.sin(ph - 1.4) * r * 0.35 + sway * r * 0.9;
    const x1 = x0 * 0.9 + s1;
    const x2 = x0 * (0.7 - surge * 0.15) + s2;
    ctx.moveTo(x0, rimY);
    ctx.bezierCurveTo(x1, rimY + len * 0.35, x2, rimY + len * 0.7, x0 * 0.6 + s2 * 1.2, rimY + len);
  }
  ctx.stroke();

  if (sting > 0 && !flat) {
    // Barbed nettles along the tentacles.
    ctx.fillStyle = rgba('#e3ccff', 0.85);
    for (let i = 0; i < count; i += 2) {
      const k = i / (count - 1);
      const x0 = (k - 0.5) * w * 1.7;
      for (let j = 1; j <= 2 + sting; j++) {
        const f = j / (3 + sting);
        const ph = t * 2.4 + i * 0.9;
        const x = x0 * (1 - f * 0.4) + Math.sin(ph - f * 1.4) * r * 0.3 * f + sway * r * 0.8 * f;
        const y = rimY + lenBase * f * 0.85;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, r * 0.05), 0, TAU);
        ctx.fill();
      }
    }
  }

  // Oral arms: frilly ribbons under the bell.
  ctx.strokeStyle = rgba(style.organ, al(0.55));
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const x0 = (i - 1.5) * r * 0.18;
    const len = r * (0.9 + surge * 0.2);
    const s = Math.sin(t * 2 + i * 1.7) * r * 0.15 + sway * r * 0.3;
    ctx.moveTo(x0, rimY - r * 0.05);
    ctx.quadraticCurveTo(x0 + s, rimY + len * 0.5, x0 * 1.3 + s * 1.5, rimY + len);
  }
  ctx.stroke();

  if (surge > 0 && !flat) {
    // Streamlined side vanes.
    ctx.fillStyle = rgba('#5ee0d0', 0.35 + surge * 0.1);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * w * 0.9, rimY - r * 0.1);
      ctx.quadraticCurveTo(side * w * (1.4 + surge * 0.15), rimY + r * 0.2, side * w * (0.9 + surge * 0.1), rimY + r * (0.8 + surge * 0.25));
      ctx.quadraticCurveTo(side * w * 1.0, rimY + r * 0.3, side * w * 0.9, rimY - r * 0.1);
      ctx.fill();
    }
  }

  // Bell
  ctx.beginPath();
  ctx.moveTo(-w, rimY);
  ctx.bezierCurveTo(-w * 1.05, -h * 0.55, -w * 0.55, -h, 0, -h);
  ctx.bezierCurveTo(w * 0.55, -h, w * 1.05, -h * 0.55, w, rimY);
  // Scalloped margin
  const lobes = 8;
  for (let i = lobes - 1; i >= 0; i--) {
    const xa = -w + ((i + 0.5) / lobes) * w * 2;
    const xb = -w + (i / lobes) * w * 2;
    ctx.quadraticCurveTo(xa, rimY + r * 0.12, xb, rimY);
  }
  ctx.closePath();
  if (flat) {
    ctx.fillStyle = style.bell;
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(-w * 0.25, -h * 0.55, r * 0.05, 0, -h * 0.2, r * 1.2);
    g.addColorStop(0, rgba('#ffffff', 0.75));
    g.addColorStop(0.35, rgba(style.bell, 0.55));
    g.addColorStop(1, rgba(style.bell, 0.22));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(style.rim, 0.75);
    ctx.lineWidth = Math.max(0.8, r * 0.06);
    ctx.stroke();

    // Four-leaf gonads, the moon jelly signature.
    ctx.strokeStyle = rgba(style.organ, 0.8);
    ctx.lineWidth = Math.max(0.8, r * 0.09);
    const cy = -h * 0.38;
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + Math.PI / 4;
      const ox = Math.cos(ang) * r * 0.24;
      const oy = Math.sin(ang) * r * 0.16;
      ctx.beginPath();
      ctx.arc(ox, cy + oy, r * 0.15, ang + 0.6, ang + TAU - 0.6);
      ctx.stroke();
    }

    if (glow > 0) {
      // Bioluminescent rim spots.
      const spots = 6 + glow * 3;
      for (let i = 0; i < spots; i++) {
        const k = i / (spots - 1);
        const ang = Math.PI + k * Math.PI;
        const x = Math.cos(ang) * w * 0.88;
        const y = Math.sin(ang) * h * 0.9 + rimY * (1 - Math.abs(Math.sin(ang)));
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.3);
        drawGlow(ctx, '#ffd27a', x, y * 0.92, r * (0.22 + glow * 0.05), tw);
      }
    }

    // Specular highlight.
    ctx.strokeStyle = rgba('#ffffff', 0.55);
    ctx.lineWidth = Math.max(0.8, r * 0.07);
    ctx.beginPath();
    ctx.arc(-w * 0.1, -h * 0.25, r * 0.6, Math.PI * 1.15, Math.PI * 1.45);
    ctx.stroke();
  }
}
