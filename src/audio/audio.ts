/**
 * Tiny synthesized soundscape — no audio files. WebAudio can only start after a
 * user gesture (iOS), so `unlock()` is called from the first tap.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;
  readonly supported: boolean;
  private lastEat = 0;
  private lastGrab = 0;

  constructor() {
    this.supported = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  unlock(): void {
    if (!this.supported) return;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);
      this.ambience = ctx.createGain();
      this.ambience.gain.value = 0;
      this.ambience.connect(this.master);
      this.noise = this.makeNoise();
      this.startAmbience();
      this.apply();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = v;
    this.muted = muted;
    this.apply();
  }

  private apply(): void {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : this.volume * this.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  /** Deeper water, deeper drone. */
  setDepth(depth01: number): void {
    if (!this.ambience || !this.ctx) return;
    this.ambience.gain.setTargetAtTime(0.32 + depth01 * 0.12, this.ctx.currentTime, 0.8);
    this.droneFilter?.frequency.setTargetAtTime(520 - depth01 * 300, this.ctx.currentTime, 1.2);
  }

  private droneFilter: BiquadFilterNode | null = null;

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Brown noise: soft, watery rumble.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  private startAmbience(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.droneFilter = filter;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(this.ambience!);
    src.start();
    lfo.start();

    for (const [f, g] of [
      [55, 0.05],
      [82.4, 0.03],
      [110.3, 0.015],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.ambience!);
      o.start();
    }
    this.ambience!.gain.setTargetAtTime(0.32, ctx.currentTime, 2);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number): void {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private whoosh(dur: number, from: number, to: number, gain: number): void {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  eat(size01: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastEat < 0.03) return;
    this.lastEat = now;
    const base = 900 - size01 * 520 + Math.random() * 80;
    this.tone(base, 0.12, 'sine', 0.22, 0, base * 1.5);
    this.tone(base * 2, 0.08, 'triangle', 0.05);
  }

  grab(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastGrab < 0.05) return;
    this.lastGrab = now;
    this.tone(420 + Math.random() * 60, 0.07, 'triangle', 0.06, 0, 260);
  }

  burst(): void {
    this.whoosh(0.45, 300, 1600, 0.5);
    this.tone(180, 0.25, 'sine', 0.12, 0, 90);
  }

  sting(): void {
    this.tone(1400, 0.15, 'sawtooth', 0.06, 0, 400);
    this.tone(700, 0.2, 'square', 0.05, 0.03, 200);
    this.whoosh(0.25, 2000, 800, 0.25);
  }

  notice(): void {
    this.tone(220, 0.22, 'triangle', 0.1, 0, 330);
  }

  evolve(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.14, i * 0.09));
    this.whoosh(0.9, 400, 3000, 0.15);
  }

  discover(rare: boolean): void {
    const notes = rare ? [880, 1108.73, 1318.51, 1760, 2217.46] : [987.77, 1318.51];
    notes.forEach((f, i) => this.tone(f, rare ? 0.9 : 0.4, 'sine', rare ? 0.12 : 0.08, i * 0.07));
  }

  caught(): void {
    this.tone(160, 0.7, 'sine', 0.3, 0, 40);
    this.whoosh(0.8, 900, 120, 0.4);
  }

  click(): void {
    this.tone(1200, 0.05, 'sine', 0.06);
  }
}
