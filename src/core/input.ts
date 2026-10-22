import type { SimInput } from '../sim/world';
import type { JoystickView } from '../render/renderer';

const STICK = 52;

/**
 * Floating thumb-stick: touch anywhere on the play surface and drag to steer.
 * A second finger tap triggers a burst. Keyboard: WASD/arrows + Space.
 */
export class Input {
  readonly joystick: JoystickView = { active: false, ax: 0, ay: 0, cx: 0, cy: 0 };
  private pointerId: number | null = null;
  private keys = new Set<string>();
  private burstQueued = false;
  enabled = false;
  onPause: (() => void) | null = null;
  onBurst: (() => void) | null = null;

  constructor(private surface: HTMLElement) {
    surface.addEventListener('pointerdown', this.down);
    surface.addEventListener('pointermove', this.move);
    surface.addEventListener('pointerup', this.up);
    surface.addEventListener('pointercancel', this.up);
    surface.addEventListener('lostpointercapture', this.up);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', () => this.reset());
  }

  reset(): void {
    this.keys.clear();
    this.pointerId = null;
    this.joystick.active = false;
    this.joystick.ax = this.joystick.ay = 0;
    this.burstQueued = false;
  }

  queueBurst(): void {
    if (!this.enabled) return;
    this.burstQueued = true;
    this.onBurst?.();
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.surface.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    if (this.pointerId !== null) {
      if (e.pointerId !== this.pointerId) this.queueBurst();
      return;
    }
    this.pointerId = e.pointerId;
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    const p = this.local(e);
    const j = this.joystick;
    j.active = true;
    j.cx = p.x;
    j.cy = p.y;
    j.ax = j.ay = 0;
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const p = this.local(e);
    const j = this.joystick;
    let dx = p.x - j.cx;
    let dy = p.y - j.cy;
    const d = Math.hypot(dx, dy);
    // The stick base follows the thumb when it strays far, so steering never stalls.
    if (d > STICK * 1.5) {
      const k = (d - STICK * 1.5) / d;
      j.cx += dx * k;
      j.cy += dy * k;
      dx = p.x - j.cx;
      dy = p.y - j.cy;
    }
    const m = Math.hypot(dx, dy);
    if (m < 5) {
      j.ax = j.ay = 0;
      return;
    }
    const mag = Math.min(1, m / STICK);
    j.ax = (dx / m) * mag;
    j.ay = (dy / m) * mag;
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.joystick.active = false;
    this.joystick.ax = this.joystick.ay = 0;
  };

  private keydown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      if (this.enabled) this.onPause?.();
      return;
    }
    if (!this.enabled) return;
    if ([' ', 'shift', 'j', 'x'].includes(k)) {
      e.preventDefault();
      if (!e.repeat) this.queueBurst();
      return;
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      e.preventDefault();
      this.keys.add(k);
      }
  };

  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  consume(out: SimInput): SimInput {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) kx -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) kx += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) ky -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) ky += 1;
    if (kx || ky) {
      const m = Math.hypot(kx, ky);
      out.ax = kx / m;
      out.ay = ky / m;
    } else {
      out.ax = this.joystick.ax;
      out.ay = this.joystick.ay;
    }
    out.burst = this.burstQueued && this.enabled;
    this.burstQueued = false;
    return out;
  }
}
