import { TAU, hexToRgb, rgba } from '../core/math';
import { drawGlow } from './sprites';

/** Water-haze a color: the wreck sits deep enough to look blue-shifted. */
function haze(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [wr, wg, wb] = hexToRgb('#163a72');
  const m = (a: number, c: number) => Math.round(a + (c - a) * k);
  return `rgb(${m(r, wr)},${m(g, wg)},${m(b, wb)})`;
}

const WOOD_LIGHT = haze('#7a5638', 0.38);
const WOOD = haze('#553a26', 0.4);
const WOOD_DARK = haze('#2e2019', 0.35);
const ROCK = haze('#4c4a5e', 0.45);
const ROCK_DARK = haze('#262a44', 0.3);
const SAIL = '#d8ceb0';
const MOSS = '#5ec2a0';

/** Hull outline in ship-local units: bow (-x) curls up, the stern castle rises at +x. */
function hullPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(-305, -34);
  ctx.quadraticCurveTo(-250, -22, -160, -28);
  ctx.lineTo(150, -30);
  ctx.lineTo(178, -34);
  ctx.lineTo(186, -96);
  ctx.lineTo(262, -104);
  ctx.quadraticCurveTo(280, -60, 272, 0);
  ctx.quadraticCurveTo(250, 60, 150, 78);
  ctx.lineTo(-150, 80);
  ctx.quadraticCurveTo(-268, 66, -292, 10);
  ctx.quadraticCurveTo(-306, -14, -305, -34);
  ctx.closePath();
}

/**
 * The sunken pirate ship, drawn in ship-local units (callers translate, rotate by the tilt and scale).
 * A broken mainmast with a torn sail and flag, a holed hull, rigging and weed growing over it.
 */
export function drawShip(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Rock ledge underneath.
  const lg = ctx.createLinearGradient(0, 60, 0, 175);
  lg.addColorStop(0, ROCK);
  lg.addColorStop(1, ROCK_DARK);
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(-390, 120);
  ctx.bezierCurveTo(-360, 52, -200, 66, -60, 66);
  ctx.bezierCurveTo(100, 62, 300, 50, 372, 108);
  ctx.bezierCurveTo(330, 170, 120, 178, 0, 176);
  ctx.bezierCurveTo(-160, 178, -350, 168, -390, 120);
  ctx.fill();

  // Mainmast, snapped and leaning, with its yard and a torn sail.
  const sway = Math.sin(t * 0.7) * 6;
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(10, -30);
  ctx.lineTo(48, -262);
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-60, -196);
  ctx.lineTo(118, -222);
  ctx.stroke();
  ctx.fillStyle = rgba(SAIL, 0.42);
  ctx.beginPath();
  ctx.moveTo(-52, -194);
  ctx.lineTo(110, -218);
  ctx.quadraticCurveTo(116 + sway, -150, 98 + sway, -86);
  // Ragged lower edge.
  const rag = [
    [70, -98],
    [56, -76],
    [36, -102],
    [14, -84],
    [-6, -110],
    [-24, -92],
    [-40, -116],
  ];
  for (const [x, y] of rag) ctx.lineTo(x + sway * 0.8, y + Math.sin(t * 1.3 + x) * 3);
  ctx.quadraticCurveTo(-60 + sway * 0.5, -150, -52, -194);
  ctx.fill();
  // Holes worn through the canvas.
  ctx.fillStyle = 'rgba(22,58,114,0.55)';
  for (const [x, y, rx, ry] of [
    [22, -170, 14, 10],
    [70, -140, 9, 13],
    [-20, -140, 8, 6],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x + sway * 0.5, y, rx, ry, 0.3, 0, TAU);
    ctx.fill();
  }

  // Tattered flag at the masthead, with a pale skull.
  const fx = 48;
  const fy = -258;
  const flap = Math.sin(t * 2.4) * 5;
  ctx.fillStyle = haze('#1b1b22', 0.2);
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.quadraticCurveTo(fx + 30, fy - 6 + flap, fx + 58, fy + 2 + flap);
  ctx.lineTo(fx + 50, fy + 14 + flap);
  ctx.lineTo(fx + 58, fy + 24 + flap);
  ctx.quadraticCurveTo(fx + 30, fy + 30 + flap * 0.6, fx, fy + 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(230,226,210,0.75)';
  ctx.beginPath();
  ctx.arc(fx + 24, fy + 13 + flap * 0.5, 6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,226,210,0.75)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(fx + 15, fy + 18 + flap * 0.5);
  ctx.lineTo(fx + 33, fy + 28 + flap * 0.5);
  ctx.moveTo(fx + 33, fy + 18 + flap * 0.5);
  ctx.lineTo(fx + 15, fy + 28 + flap * 0.5);
  ctx.stroke();

  // Foremast stub.
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-160, -28);
  ctx.lineTo(-178, -118);
  ctx.stroke();

  // Slack rigging.
  ctx.strokeStyle = 'rgba(30,24,20,0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(44, -240);
  ctx.quadraticCurveTo(-120, -120, -300, -36);
  ctx.moveTo(46, -250);
  ctx.quadraticCurveTo(170, -150, 258, -100);
  ctx.moveTo(-178, -116);
  ctx.quadraticCurveTo(-250, -60, -300, -36);
  ctx.stroke();

  // Hull.
  const hg = ctx.createLinearGradient(0, -110, 0, 80);
  hg.addColorStop(0, WOOD_LIGHT);
  hg.addColorStop(0.45, WOOD);
  hg.addColorStop(1, WOOD_DARK);
  hullPath(ctx);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.save();
  hullPath(ctx);
  ctx.clip();
  // Planking follows the sheer of the hull.
  ctx.strokeStyle = 'rgba(20,14,12,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const y = -16 + k * 16;
    ctx.moveTo(-320, y - 8);
    ctx.quadraticCurveTo(0, y + 6, 300, y - 14);
  }
  ctx.stroke();
  // Stern castle windows.
  ctx.fillStyle = 'rgba(14,20,40,0.85)';
  for (let i = 0; i < 3; i++) ctx.fillRect(196 + i * 20, -82, 11, 14);
  // A splintered hole where the hull gave way.
  ctx.fillStyle = 'rgba(8,12,28,0.9)';
  ctx.beginPath();
  ctx.moveTo(-96, 6);
  ctx.lineTo(-74, -6);
  ctx.lineTo(-58, 4);
  ctx.lineTo(-38, -2);
  ctx.lineTo(-30, 22);
  ctx.lineTo(-44, 40);
  ctx.lineTo(-66, 34);
  ctx.lineTo(-90, 42);
  ctx.lineTo(-104, 24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 3;
  hullPath(ctx);
  ctx.stroke();

  // Deck rail with a few posts still standing.
  ctx.strokeStyle = WOOD_LIGHT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-250, -44);
  ctx.quadraticCurveTo(-120, -46, -40, -44);
  ctx.moveTo(10, -46);
  ctx.lineTo(160, -48);
  for (const x of [-230, -190, -150, -110, -70, 30, 70, 110, 150]) {
    ctx.moveTo(x, -30);
    ctx.lineTo(x, -45);
  }
  ctx.stroke();

  // Portholes, with a little life glowing inside.
  for (const [i, x] of [40, 90, 140].entries()) {
    ctx.fillStyle = 'rgba(10,16,34,0.9)';
    ctx.beginPath();
    ctx.arc(x, 2, 7, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = haze('#b38a4a', 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
    drawGlow(ctx, '#7ff0ff', x, 2, 10, 0.35 + 0.25 * Math.sin(t * 1.6 + i * 2));
  }

  // Weed and moss growing over the wreck.
  ctx.strokeStyle = rgba(MOSS, 0.55);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [i, x] of [-210, -120, -10, 120, 230].entries()) {
    const base = x > 180 ? -100 : -40;
    const h = 40 + (i % 3) * 18;
    const s = Math.sin(t * 0.9 + i * 1.7) * 8;
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + s, base - h * 0.5, x + s * 1.8, base - h);
  }
  ctx.stroke();
  ctx.fillStyle = rgba(MOSS, 0.3);
  for (const [x, y, rr] of [
    [-250, 30, 16],
    [-170, 56, 12],
    [60, 66, 18],
    [210, 40, 14],
    [250, -20, 10],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.fill();
  }
}

/** A small treasure chest, closed or burst open, in chest-local units (about 40 wide). */
export function drawChest(ctx: CanvasRenderingContext2D, t: number, open: boolean): void {
  const wood = haze('#6a4628', 0.3);
  const band = '#e6b84f';
  if (!open) drawGlow(ctx, '#ffd27a', 0, -8, 46, 0.3 + 0.12 * Math.sin(t * 2.5));
  ctx.fillStyle = wood;
  ctx.fillRect(-20, -14, 40, 22);
  ctx.strokeStyle = band;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-20, -14, 40, 22);
  ctx.beginPath();
  ctx.moveTo(-8, -14);
  ctx.lineTo(-8, 8);
  ctx.moveTo(8, -14);
  ctx.lineTo(8, 8);
  ctx.stroke();
  ctx.save();
  if (open) {
    // Lid flung back, gold heaped inside.
    ctx.fillStyle = '#ffd56a';
    ctx.beginPath();
    ctx.ellipse(0, -14, 18, 7, 0, Math.PI, TAU);
    ctx.fill();
    drawGlow(ctx, '#ffd27a', 0, -16, 30, 0.5);
    ctx.translate(-20, -14);
    ctx.rotate(-2.1);
    ctx.translate(20, 14);
  }
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.moveTo(-20, -14);
  ctx.quadraticCurveTo(0, -30, 20, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = band;
  ctx.stroke();
  ctx.restore();
  if (!open) {
    ctx.fillStyle = band;
    ctx.fillRect(-3, -10, 6, 7);
    // A glint that catches the light now and then.
    const g = Math.max(0, Math.sin(t * 1.7)) ** 8;
    drawGlow(ctx, '#ffffff', 12, -18, 14, g);
  }
}
