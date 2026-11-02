import type { Landmark, Pod, Shelter, Vent } from '../sim/world';
import type { TreasureId } from '../content/landmarks';
import { TAU, rgba } from '../core/math';
import { drawGlow } from './sprites';

/**
 * Art for the world's features: glow pods, kelp and anemone shelters, hydrothermal vents,
 * and the landmarks with their treasures. Everything is drawn in world units around its own
 * origin; the renderer handles the camera transform.
 */

/** A glow pod: a translucent bulb on a short stalk, brightening and dimming as it breathes. */
export function drawPod(ctx: CanvasRenderingContext2D, pod: Pod, t: number, color: string): void {
  const r = pod.r;
  const ready = pod.regrow <= 0;
  const grown = ready ? 1 : Math.max(0.15, 1 - pod.regrow / 45);
  const breathe = 0.75 + 0.25 * Math.sin(t * 2 + pod.seed);
  ctx.strokeStyle = rgba('#2a4a5a', 0.9);
  ctx.lineWidth = r * 0.25;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, r * 1.1);
  ctx.quadraticCurveTo(Math.sin(t + pod.seed) * r * 0.2, r * 0.5, 0, 0);
  ctx.stroke();
  const rr = r * grown * (ready ? 1 + 0.05 * Math.sin(t * 2 + pod.seed) : 0.7);
  if (ready) drawGlow(ctx, color, 0, 0, rr * 3.2, 0.5 * breathe);
  const g = ctx.createRadialGradient(-rr * 0.3, -rr * 0.4, rr * 0.1, 0, 0, rr);
  g.addColorStop(0, rgba('#ffffff', ready ? 0.95 : 0.4));
  g.addColorStop(0.5, rgba(color, ready ? 0.8 * breathe : 0.25));
  g.addColorStop(1, rgba(color, ready ? 0.35 : 0.1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rr, rr * 1.15, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', ready ? 0.45 : 0.15);
  ctx.lineWidth = Math.max(0.5, r * 0.08);
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    ctx.moveTo(i * rr * 0.4, -rr * 1.05);
    ctx.quadraticCurveTo(i * rr * 0.75, 0, i * rr * 0.4, rr * 1.05);
  }
  ctx.stroke();
}

/**
 * A shelter's stalks or arms. `front` draws the layer that passes in front of the jelly, so a
 * hidden jelly is seen through the fronds.
 */
export function drawShelter(ctx: CanvasRenderingContext2D, sh: Shelter, t: number, front: boolean, lit: number): void {
  const n = Math.round(sh.r / 13);
  const seedRand = (i: number) => {
    const x = Math.sin((sh.seed + i) * 91.7) * 43758.5;
    return x - Math.floor(x);
  };
  if (sh.kind === 'kelp') {
    for (let i = 0; i < n; i++) {
      const isFront = seedRand(i) < 0.4;
      if (isFront !== front) continue;
      const bx = (seedRand(i + 50) - 0.5) * sh.r * 1.8;
      const base = sh.r * (0.85 + seedRand(i + 9) * 0.3);
      const h = sh.r * (1.4 + seedRand(i + 70) * 0.9);
      const w = 4 + seedRand(i + 30) * 4;
      const ph = seedRand(i + 11) * TAU;
      const green = front ? `rgba(30,${Math.round(90 + 50 * lit)},${Math.round(70 + 30 * lit)},0.78)` : `rgba(40,${Math.round(120 + 60 * lit)},${Math.round(90 + 40 * lit)},0.9)`;
      ctx.fillStyle = green;
      const segs = 10;
      ctx.beginPath();
      for (let j = 0; j <= segs; j++) {
        const q = j / segs;
        const x = bx + Math.sin(t * 0.8 + ph + q * 2.6) * 18 * q - w * (1 - q * 0.6);
        ctx[j === 0 ? 'moveTo' : 'lineTo'](x, base - h * q);
      }
      for (let j = segs; j >= 0; j--) {
        const q = j / segs;
        ctx.lineTo(bx + Math.sin(t * 0.8 + ph + q * 2.6) * 18 * q + w * (1 - q * 0.6), base - h * q);
      }
      ctx.fill();
      // Blades along the stalk, and a gas float near each top.
      for (let j = 2; j < segs; j += 2) {
        const q = j / segs;
        const x = bx + Math.sin(t * 0.8 + ph + q * 2.6) * 18 * q;
        const side = (j + i) % 4 ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(x + side * w * 2.4, base - h * q, w * 3, w * 0.9, side * 0.7 + Math.sin(t + j + i) * 0.2, 0, TAU);
        ctx.fill();
      }
      if (!front) {
        const q = 0.9;
        const x = bx + Math.sin(t * 0.8 + ph + q * 2.6) * 18 * q;
        ctx.fillStyle = `rgba(150,${Math.round(150 + 60 * lit)},90,0.85)`;
        ctx.beginPath();
        ctx.arc(x, base - h * q, w * 0.9, 0, TAU);
        ctx.fill();
      }
    }
  } else {
    // An anemone bed: soft columns crowned with waving, glowing tentacles.
    for (let i = 0; i < n; i++) {
      const isFront = seedRand(i) < 0.35;
      if (isFront !== front) continue;
      const bx = (seedRand(i + 50) - 0.5) * sh.r * 1.7;
      const by = (seedRand(i + 9) - 0.3) * sh.r * 0.9;
      const h = 22 + seedRand(i + 70) * 34;
      const color = ['#7dffb9', '#ff7fd0', '#ffd27a'][i % 3];
      ctx.fillStyle = rgba('#3a2a6a', front ? 0.75 : 0.95);
      ctx.beginPath();
      ctx.ellipse(bx, by, 9, h * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(color, front ? 0.6 : 0.85);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + (k - 4) * 0.32 + Math.sin(t * 1.4 + i + k) * 0.12;
        const len = h * 0.8;
        ctx.moveTo(bx, by - h * 0.45);
        ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.5, by - h * 0.45 + Math.sin(a) * len * 0.7, bx + Math.cos(a) * len, by - h * 0.45 + Math.sin(a) * len);
      }
      ctx.stroke();
      if (!front) drawGlow(ctx, color, bx, by - h, h * 0.9, 0.35 + 0.15 * Math.sin(t * 1.3 + i));
    }
  }
}

/** A black smoker: a lumpy chimney, its mouth glowing, heat shimmering in a column above. */
export function drawVent(ctx: CanvasRenderingContext2D, v: Vent, t: number): void {
  const h = v.h;
  // Plume of dark mineral smoke curling up and away.
  for (let i = 0; i < 9; i++) {
    const q = (t * 0.22 + i / 9 + v.seed) % 1;
    const r = 12 + q * 70;
    const x = Math.sin(t * 0.7 + i * 1.9 + v.seed) * q * 30;
    ctx.fillStyle = `rgba(20,18,28,${0.42 * (1 - q)})`;
    ctx.beginPath();
    ctx.arc(x, -h - q * 560, r, 0, TAU);
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, -h, 0, 40);
  g.addColorStop(0, '#3a2a30');
  g.addColorStop(0.5, '#1c1622');
  g.addColorStop(1, '#0a0812');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-40, 40);
  for (let j = 0; j <= 8; j++) {
    const q = j / 8;
    ctx.lineTo(-38 + q * 24 + Math.sin(j * 2.3 + v.seed) * 6, 30 - q * (h + 30));
  }
  for (let j = 8; j >= 0; j--) {
    const q = j / 8;
    ctx.lineTo(38 - q * 24 + Math.sin(j * 1.7 + v.seed) * 6, 30 - q * (h + 30));
  }
  ctx.closePath();
  ctx.fill();
  // Mineral crust: orange seams and a hot mouth.
  ctx.strokeStyle = 'rgba(255,140,70,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let j = 1; j < 6; j++) {
    const y = 30 - (j / 6) * (h + 30);
    ctx.moveTo(-26 + j * 2, y);
    ctx.lineTo(-8 + j * 3, y - 10);
  }
  ctx.stroke();
  drawGlow(ctx, '#ff8a3a', 0, -h, 46, 0.75 + 0.2 * Math.sin(t * 4 + v.seed));
  drawGlow(ctx, '#ffd27a', 0, -h + 4, 18, 0.9);
  // Tube worms clustered at the base, red plumes swaying.
  for (let i = 0; i < 6; i++) {
    const x = -50 + i * 20 + Math.sin(i * 7.1 + v.seed) * 6;
    const hh = 20 + ((i * 37 + v.seed) % 22);
    const bend = Math.sin(t * 0.9 + i) * 4;
    ctx.strokeStyle = 'rgba(225,225,215,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, 36);
    ctx.quadraticCurveTo(x, 36 - hh * 0.6, x + bend, 36 - hh);
    ctx.stroke();
    ctx.fillStyle = 'rgba(230,50,70,0.95)';
    ctx.beginPath();
    ctx.ellipse(x + bend, 36 - hh - 4, 3.6, 5.6, 0, 0, TAU);
    ctx.fill();
  }
}

/** Heat shimmer over a plume: faint wavering lines, the hint not to swim straight up it. */
export function drawPlumeShimmer(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, t: number, z: number): void {
  ctx.strokeStyle = 'rgba(255,190,140,0.12)';
  ctx.lineWidth = Math.max(1, 1.4 * z);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const ox = (i - 2) * 18 * z;
    for (let j = 0; j <= 14; j++) {
      const q = j / 14;
      const px = x + ox + Math.sin(q * 12 - t * 5 + i) * 5 * z;
      const py = y - q * h * z;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
}

// ------------------------------------------------------------------ landmarks

export function drawLandmark(ctx: CanvasRenderingContext2D, lm: Landmark, t: number): void {
  switch (lm.def.id) {
    case 'lantern-grove':
      drawGrove(ctx, t);
      break;
    case 'whale-fall':
      drawWhaleFall(ctx, lm, t);
      break;
    case 'drowned-gate':
      drawGate(ctx, lm, t);
      break;
    case 'vent-field':
      drawVentFieldBed(ctx, t);
      break;
    case 'crystal-heart':
      drawHeart(ctx, t, lm.taken);
      break;
    default:
      break;
  }
}

function drawGrove(ctx: CanvasRenderingContext2D, t: number): void {
  // A shallow bowl of glowing moss at the grove's heart, beneath the ring of pods.
  drawGlow(ctx, '#7dffb9', 0, 40, 260, 0.18 + 0.05 * Math.sin(t * 0.7));
  ctx.fillStyle = 'rgba(16,52,82,0.9)';
  ctx.beginPath();
  ctx.ellipse(0, 70, 170, 46, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    const rr = 60 + ((i * 53) % 100);
    const x = Math.cos(a) * rr;
    const y = 60 + Math.sin(a) * rr * 0.25;
    drawGlow(ctx, i % 3 ? '#7dffb9' : '#ffd27a', x, y, 7, 0.4 + 0.4 * Math.sin(t * 1.5 + i));
  }
}

function drawWhaleFall(ctx: CanvasRenderingContext2D, lm: Landmark, t: number): void {
  const d = lm.side;
  ctx.save();
  ctx.scale(d, 1);
  // The ledge it rests on.
  const g = ctx.createLinearGradient(0, 80, 0, 220);
  g.addColorStop(0, '#2a3470');
  g.addColorStop(1, 'rgba(14,18,56,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-420, 220);
  ctx.quadraticCurveTo(-380, 90, -200, 96);
  ctx.quadraticCurveTo(0, 82, 200, 96);
  ctx.quadraticCurveTo(380, 90, 420, 220);
  ctx.closePath();
  ctx.fill();
  const bone = '#d8dcef';
  // Skull.
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.moveTo(-270, 30);
  ctx.quadraticCurveTo(-330, -40, -400, 10);
  ctx.quadraticCurveTo(-440, 50, -380, 80);
  ctx.quadraticCurveTo(-320, 70, -270, 60);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a2050';
  ctx.beginPath();
  ctx.ellipse(-340, 30, 16, 11, 0.2, 0, TAU);
  ctx.fill();
  // Jaw bones lying open.
  ctx.strokeStyle = bone;
  ctx.lineCap = 'round';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-390, 76);
  ctx.quadraticCurveTo(-470, 110, -530, 92);
  ctx.stroke();
  // Spine.
  ctx.lineWidth = 9;
  for (let i = 0; i < 12; i++) {
    const x = -260 + i * 46;
    const y = 40 - Math.sin((i / 11) * Math.PI) * 12;
    ctx.fillStyle = bone;
    ctx.beginPath();
    ctx.ellipse(x, y, 16, 12, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 6, y - 30);
    ctx.stroke();
  }
  // Ribs arching up over the treasure.
  ctx.lineWidth = 9;
  for (let k = 0; k < 6; k++) {
    const bx = -170 + k * 62;
    ctx.beginPath();
    ctx.moveTo(bx, 30);
    for (let j = 1; j <= 5; j++) {
      const q = j / 5;
      ctx.lineTo(bx + Math.sin(q * 1.4) * 40, 30 - q * 150);
    }
    ctx.stroke();
  }
  // Bone-eating life: tiny glowing tufts all over the skeleton.
  for (let i = 0; i < 26; i++) {
    const x = -300 + ((i * 97) % 600);
    const y = 50 - ((i * 53) % 150);
    drawGlow(ctx, i % 2 ? '#ff9fd8' : '#9fe8ff', x, y, 6, 0.5 + 0.4 * Math.sin(t * 2 + i));
  }
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, lm: Landmark, t: number): void {
  const woke = lm.revealed ? Math.min(1, lm.wakeT / 1.2) : 0;
  const stone = '#4a6670';
  const stoneDark = '#22363e';
  const g = ctx.createLinearGradient(0, -340, 0, 120);
  g.addColorStop(0, '#6f8a8e');
  g.addColorStop(0.6, stone);
  g.addColorStop(1, stoneDark);
  ctx.fillStyle = g;
  // Plinth.
  ctx.beginPath();
  ctx.rect(-280, 40, 560, 60);
  ctx.rect(-240, 22, 480, 22);
  ctx.fill();
  // Columns.
  for (const x of [-150, 150]) {
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.rect(x - 40, -280, 80, 304);
    ctx.rect(x - 52, -300, 104, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,34,40,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x + i * 14, -270);
      ctx.lineTo(x + i * 14, 20);
    }
    ctx.stroke();
  }
  // Lintel.
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.rect(-200, -340, 400, 48);
  ctx.fill();
  // Glyphs: dim until something swims through, then they wake one by one.
  for (let i = 0; i < 9; i++) {
    const x = -160 + i * 40;
    const on = woke > i / 9 ? 1 : 0;
    const a = 0.2 + on * (0.6 + 0.2 * Math.sin(t * 3 + i));
    ctx.strokeStyle = rgba('#5ee0b0', a);
    ctx.lineWidth = 3;
    ctx.beginPath();
    const k = i % 4;
    if (k === 0) {
      ctx.arc(x, -316, 9, 0, TAU);
      ctx.moveTo(x, -325);
      ctx.lineTo(x, -307);
    } else if (k === 1) {
      ctx.moveTo(x - 9, -306);
      ctx.lineTo(x, -326);
      ctx.lineTo(x + 9, -306);
    } else if (k === 2) {
      ctx.moveTo(x - 9, -324);
      ctx.lineTo(x + 9, -324);
      ctx.moveTo(x - 9, -316);
      ctx.lineTo(x + 9, -316);
      ctx.moveTo(x, -308);
      ctx.lineTo(x, -324);
    } else {
      ctx.arc(x, -316, 9, Math.PI * 0.2, Math.PI * 1.8);
    }
    ctx.stroke();
    if (on) drawGlow(ctx, '#5ee0b0', x, -316, 22, 0.5);
  }
  for (const x of [-150, 150]) {
    for (let j = 0; j < 5; j++) {
      const on = woke > j / 5 ? 1 : 0;
      drawGlow(ctx, '#5ee0b0', x, -230 + j * 50, 12, 0.15 + on * 0.55);
    }
  }
  if (woke > 0) drawGlow(ctx, '#5ee0b0', 0, -150, 200 * woke, 0.12 * woke);
}

function drawVentFieldBed(ctx: CanvasRenderingContext2D, t: number): void {
  // A bed of cooled black rock and shimmering mineral around the smokers.
  ctx.fillStyle = '#0d0a14';
  ctx.beginPath();
  ctx.ellipse(0, 70, 330, 50, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 18; i++) {
    const x = -300 + i * 35;
    drawGlow(ctx, '#ff8a3a', x, 64 + Math.sin(i) * 10, 10, 0.25 + 0.2 * Math.sin(t * 1.7 + i));
  }
}

function drawHeart(ctx: CanvasRenderingContext2D, t: number, taken: boolean): void {
  const beat = Math.pow(Math.max(0, Math.sin(t * 1.4)), 6);
  drawGlow(ctx, '#ff6fae', 0, 0, 260 + beat * 80, 0.35 + beat * 0.35);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.2;
    const len = 90 + ((i * 41) % 60);
    ctx.save();
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, '#b0306e');
    g.addColorStop(1, '#ff9fd0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(30, -18);
    ctx.lineTo(len, -6);
    ctx.lineTo(len + 22, 0);
    ctx.lineTo(len, 6);
    ctx.lineTo(30, 18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const g = ctx.createRadialGradient(-20, -24, 10, 0, 0, 96);
  g.addColorStop(0, '#ffd0e6');
  g.addColorStop(0.4, '#ff6fae');
  g.addColorStop(1, '#5a0e3a');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * TAU;
    const rr = 92 * (1 + beat * 0.04) * (k % 2 ? 0.92 : 1);
    if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,240,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  if (taken) {
    ctx.fillStyle = '#2a0618';
    ctx.beginPath();
    ctx.moveTo(30, -60);
    ctx.lineTo(56, -40);
    ctx.lineTo(40, -26);
    ctx.closePath();
    ctx.fill();
  }
}

/** A treasure resting where it was hidden: a small object with a slow, inviting glint. */
export function drawTreasure(ctx: CanvasRenderingContext2D, id: TreasureId, color: string, t: number, woke: number): void {
  const bob = Math.sin(t * 1.6) * 3;
  const appear = Math.min(1, woke / 0.8);
  ctx.save();
  ctx.translate(0, bob);
  ctx.scale(appear, appear);
  drawGlow(ctx, color, 0, 0, 46, 0.55 + 0.25 * Math.sin(t * 2.4));
  // A slow twinkle crossing the object.
  const tw = Math.max(0, Math.sin(t * 1.1));
  ctx.strokeStyle = rgba('#ffffff', 0.7 * tw);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16 * tw, 0);
  ctx.lineTo(16 * tw, 0);
  ctx.moveTo(0, -16 * tw);
  ctx.lineTo(0, 16 * tw);
  ctx.stroke();
  switch (id) {
    case 'mother-pearl': {
      ctx.fillStyle = '#e9d8b8';
      ctx.beginPath();
      ctx.ellipse(0, 6, 22, 9, 0, 0, Math.PI);
      ctx.fill();
      const g = ctx.createRadialGradient(-4, -4, 1, 0, 0, 11);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, '#f4e8fa');
      g.addColorStop(1, '#b9a7cf');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fill();
      break;
    }
    case 'lantern-seed': {
      const g = ctx.createRadialGradient(0, -3, 1, 0, 0, 12);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#7dffb9');
      g.addColorStop(1, '#1f7a5a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(12, -2, 0, 12);
      ctx.quadraticCurveTo(-12, -2, 0, -14);
      ctx.fill();
      break;
    }
    case 'whalebone-flute': {
      ctx.save();
      ctx.rotate(-0.4);
      ctx.fillStyle = '#e6ecff';
      ctx.beginPath();
      ctx.rect(-20, -4, 40, 8);
      ctx.fill();
      ctx.fillStyle = '#5a6290';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-10 + i * 7, 0, 1.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'glyph-tablet': {
      ctx.fillStyle = '#4a6670';
      ctx.beginPath();
      ctx.rect(-13, -17, 26, 34);
      ctx.fill();
      ctx.strokeStyle = '#5ee0b0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -6, 5, 0, TAU);
      ctx.moveTo(-7, 6);
      ctx.lineTo(7, 6);
      ctx.moveTo(-5, 11);
      ctx.lineTo(5, 11);
      ctx.stroke();
      break;
    }
    case 'vent-opal': {
      const g = ctx.createLinearGradient(-10, -10, 10, 10);
      g.addColorStop(0, '#ffd27a');
      g.addColorStop(0.5, '#ff6fae');
      g.addColorStop(1, '#7fe3ff');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 9, 0.3, 0, TAU);
      ctx.fill();
      break;
    }
    case 'dream-shard': {
      ctx.fillStyle = '#ff9fd0';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 16);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** A bloom: thousands of points of living light drifting in the water around its heart. */
export function drawBloom(ctx: CanvasRenderingContext2D, cx: number, cy: number, z: number, t: number, k: number, w: number, h: number, camX: number, camY: number): void {
  if (k <= 0.01) return;
  const colors = ['#9dff8a', '#7fe3ff', '#c59bff'];
  for (let i = 0; i < 140; i++) {
    const a = ((i * 137.5) % 360) * (Math.PI / 180);
    const rr = 60 + ((i * 7919) % 900);
    const x = cx + Math.cos(a + t * 0.02 * ((i % 5) - 2)) * rr + Math.sin(t * 0.4 + i) * 20;
    const y = cy + Math.sin(a) * rr * 0.8 + Math.cos(t * 0.3 + i * 1.3) * 20;
    const sx = (x - camX) * z + w / 2;
    const sy = (y - camY) * z + h / 2;
    if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
    const tw = 0.5 + 0.5 * Math.sin(t * 2.5 + i * 2.1);
    drawGlow(ctx, colors[i % 3], sx, sy, (5 + (i % 4) * 2) * z, k * tw * 0.8);
  }
}
