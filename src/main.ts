import '@fontsource-variable/fraunces';
import '@fontsource-variable/outfit';
import './styles.css';

import { World, type SimEvent, type SimInput } from './sim/world';
import { track } from './core/analytics';
import { Renderer } from './render/renderer';
import { Input } from './core/input';
import { AudioEngine } from './audio/audio';
import { SaveStore, type SaveData } from './persistence/save';
import { applyRun, recordDiscoveries, recordForm, recordGlimpse } from './core/progress';
import { PATHS, type Tiers } from './content/evolutions';
import { FORMS, isFormId } from './content/forms';
import { EVOLUTION_FOOD, STAGES, evolutionProgress, maturity } from './content/progression';
import { RARITY_LABEL, SPECIES_BY_ID } from './content/species';
import { SKINS_BY_ID, TRAITS_BY_ID } from './content/unlocks';
import { WORLD } from './content/world';
import { POWERS } from './content/powerups';
import { clamp } from './core/math';
import { comboMult } from './sim/rules';
import { PKind } from './render/particles';
import {
  buildUI,
  collectBinds,
  fmt,
  markDietLead,
  mmss,
  renderCharges,
  renderDetail,
  renderGuide,
  renderHeirs,
  renderLineage,
  renderPathPips,
  renderPowers,
  renderResults,
  renderTitle,
  type Binds,
} from './ui/screens';

type State = 'title' | 'play' | 'paused' | 'results';
type Overlay = 'guide' | 'lineage' | 'settings' | null;

const TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

class Game {
  private app = document.getElementById('app')!;
  private canvas = document.getElementById('game') as HTMLCanvasElement;
  private uiRoot = document.getElementById('ui')!;
  private ui: Binds;
  private store = SaveStore.fromBrowser();
  private save: SaveData = this.store.load();
  private audio = new AudioEngine();
  private input = new Input(this.canvas);
  private renderer: Renderer;
  private world: World;
  private state: State = 'title';
  private overlay: Overlay = null;
  private simInput: SimInput = { ax: 0, ay: 0, burst: false };
  private last = performance.now();
  private runNew: string[] = [];
  private demoT = 0;
  private resultsTimer = 0;
  private hudCache = Game.freshHud();
  private tutorial = { step: 0, t: 0, eats: 0 };
  /** Personal best when this run began, for the mid-run "new best" moment. */
  private bestAtStart = 0;
  /** Biggest sweep on record when this run began, for the mid-run record moment. */
  private sweepRecord = 0;
  private noticeCooldown = 0;

  constructor() {
    buildUI(this.uiRoot, TOUCH);
    this.ui = collectBinds(this.uiRoot);
    const skin = SKINS_BY_ID[this.save.selected.skin] ?? SKINS_BY_ID.moon;
    this.renderer = new Renderer(this.canvas, skin);
    this.world = new World({ demo: true });
    this.applySettings();
    this.bind();
    this.resize();
    this.showTitle();
    requestAnimationFrame(this.frame);
  }

  private static freshHud() {
    return { score: -1, tide: -1, growth: -1, diet: '', lead: '', stage: -1, cd: -1, charges: -1, maxCharges: -1, sting: '', tiers: '', powers: '', combo: -1, comboBar: -1, pearls: -1, beaten: false };
  }

  // ------------------------------------------------------------ setup

  private bind(): void {
    this.uiRoot.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!el) {
        if ((e.target as HTMLElement).classList.contains('detail')) this.ui.detail.classList.remove('is-open');
        return;
      }
      this.audio.unlock();
      this.action(el.dataset.action!, el);
    });

    // Burst reacts on touch-down for zero latency.
    const burst = this.ui.burst;
    burst.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      burst.classList.add('pressed');
      this.input.queueBurst();
    });
    const release = () => burst.classList.remove('pressed');
    burst.addEventListener('pointerup', release);
    burst.addEventListener('pointercancel', release);
    burst.addEventListener('pointerleave', release);

    this.uiRoot.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.setting === 'volume') {
        this.save.settings.volume = Number(el.value) / 100;
        if (this.save.settings.volume > 0) this.save.settings.muted = false;
        this.applySettings();
        this.persist();
      }
    });

    this.input.onPause = () => {
      if (this.state === 'play') this.pause();
      else if (this.state === 'paused') this.resume();
    };
    this.input.onBurst = () => this.tutorialSignal('burst');
    this.canvas.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.key === 'Enter' && (this.state === 'title' || this.state === 'results') && !this.overlay) this.startRun();
    });

    const onHide = () => {
      if (this.state === 'play') this.pause();
      this.audio.suspend();
      this.input.reset();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onHide();
      else if (!this.save.settings.muted) this.audio.resume();
    });
    window.addEventListener('pagehide', onHide);
    window.addEventListener('blur', () => {
      if (this.state === 'play') this.pause();
    });

    new ResizeObserver(() => this.resize()).observe(this.app);
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    // iOS: block pinch and double-tap zoom gestures over the game.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    this.app.addEventListener(
      'touchmove',
      (e) => {
        if (!(e.target as HTMLElement).closest('.results, .sheet')) e.preventDefault();
      },
      { passive: false },
    );
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.applySettings());
  }

  private resize(): void {
    const w = this.app.clientWidth;
    const h = this.app.clientHeight;
    this.renderer.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
    if (this.state === 'title') this.frameTitle();
    this.syncView();
  }

  private syncView(): void {
    const { hw, hh } = this.renderer.viewHalf();
    this.world.setView(hw, hh);
  }

  private reducedMotion(): boolean {
    const pref = this.save.settings.reducedMotion;
    return pref ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private applySettings(): void {
    const s = this.save.settings;
    this.audio.setVolume(s.volume, s.muted);
    const rm = this.reducedMotion();
    this.renderer.reducedMotion = rm;
    this.renderer.particles.scale = rm ? 0.45 : 1;
    document.body.classList.toggle('reduced-motion', rm);
    this.uiRoot.querySelectorAll<HTMLInputElement>('[data-setting="volume"]').forEach((el) => {
      el.value = String(Math.round(s.volume * 100));
      el.style.setProperty('--v', `${s.volume * 100}%`);
    });
    this.uiRoot.querySelectorAll<HTMLElement>('[data-setting="sound"]').forEach((el) => el.setAttribute('aria-checked', String(!s.muted)));
    this.uiRoot.querySelectorAll<HTMLElement>('[data-setting="motion"]').forEach((el) => el.setAttribute('aria-checked', String(rm)));
  }

  private persist(): void {
    this.store.save(this.save);
  }

  // ------------------------------------------------------------ screens

  private show(name: string, on: boolean): void {
    this.uiRoot.querySelector(`[data-screen="${name}"]`)?.classList.toggle('is-open', on);
  }

  private showTitle(): void {
    this.state = 'title';
    this.input.enabled = false;
    this.input.reset();
    this.world = new World({ demo: true, tiers: this.startTiers(), forms: this.startForms() });
    this.frameTitle();
    this.syncView();
    this.renderer.snapCamera(this.world);
    this.syncView();
    this.world.populate();
    renderTitle(this.ui, this.save);
    for (const s of ['hud', 'pause', 'results']) this.show(s, false);
    this.show('title', true);
  }

  /** Portrait: jelly above the logo. Landscape: jelly to the left of it. */
  private frameTitle(): void {
    const r = this.renderer;
    const wide = r.w > r.h * 1.2;
    document.body.classList.toggle('wide', wide);
    r.focusOffset = wide ? 0 : r.h * 0.2;
    r.focusOffsetX = wide ? r.w * 0.22 : 0;
    r.zoomBoost = wide ? 1.45 : 1.6;
  }

  private openOverlay(o: Exclude<Overlay, null>): void {
    if (this.overlay) this.show(this.overlay, false);
    this.overlay = o;
    if (o === 'guide') renderGuide(this.ui, this.save);
    if (o === 'lineage') renderLineage(this.ui, this.save);
    if (o === 'settings') this.applySettings();
    this.show(o, true);
  }

  private closeOverlay(): void {
    if (!this.overlay) return;
    this.show(this.overlay, false);
    this.ui.detail.classList.remove('is-open');
    this.overlay = null;
    if (this.state === 'title') renderTitle(this.ui, this.save);
  }

  private action(name: string, el: HTMLElement): void {
    switch (name) {
      case 'play':
        this.audio.click();
        this.closeOverlay();
        this.startRun();
        break;
      case 'guide':
        this.audio.click();
        this.openOverlay('guide');
        break;
      case 'lineage':
        this.audio.click();
        this.openOverlay('lineage');
        break;
      case 'settings':
        this.audio.click();
        this.openOverlay('settings');
        break;
      case 'close':
        this.audio.click();
        this.closeOverlay();
        break;
      case 'species':
        this.audio.click();
        renderDetail(this.ui, this.save, el.dataset.id!);
        break;
      case 'closeDetail':
        this.ui.detail.classList.remove('is-open');
        break;
      case 'skin': {
        const id = el.dataset.id!;
        if (!this.save.unlocks.includes(`skin:${id}`)) return;
        this.save.selected.skin = id;
        this.renderer.playerStyle = SKINS_BY_ID[id];
        this.persist();
        renderLineage(this.ui, this.save);
        break;
      }
      case 'trait': {
        const id = el.dataset.id!;
        if (!this.save.unlocks.includes(`trait:${id}`)) return;
        this.save.selected.trait = this.save.selected.trait === id ? null : id;
        this.persist();
        renderLineage(this.ui, this.save);
        break;
      }
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'restart':
        this.show('pause', false);
        this.startRun();
        break;
      case 'quit':
        this.show('pause', false);
        this.endRunEarly();
        break;
      case 'home':
        this.showTitle();
        break;
      case 'heir': {
        // Choose which of this Jelli's forms the next one hatches with.
        const id = el.dataset.id;
        if (!isFormId(id) || !this.world.player.forms.includes(id)) return;
        this.audio.click();
        this.save.heirloom = id;
        this.persist();
        const box = el.parentElement;
        if (box) renderHeirs(box, this.world.player.forms, id);
        break;
      }
      case 'sound':
        break;
    }
    const setting = el.dataset.setting;
    if (setting === 'sound') {
      this.save.settings.muted = !this.save.settings.muted;
      if (!this.save.settings.muted && this.save.settings.volume === 0) this.save.settings.volume = 0.6;
      this.applySettings();
      this.persist();
    } else if (setting === 'motion') {
      this.save.settings.reducedMotion = !this.reducedMotion();
      this.applySettings();
      this.persist();
    }
  }

  // ------------------------------------------------------------ run lifecycle

  private startTiers(): Partial<Tiers> {
    const trait = this.save.selected.trait ? TRAITS_BY_ID[this.save.selected.trait] : null;
    return trait ? { [trait.path]: 1 } : {};
  }

  /** The form this Jelli inherits from the last one. */
  private startForms() {
    return this.save.heirloom ? [this.save.heirloom] : [];
  }

  private startRun(): void {
    this.audio.unlock();
    this.world = new World({ tiers: this.startTiers(), forms: this.startForms() });
    this.runNew = [];
    this.renderer.focusOffset = 0;
    this.renderer.focusOffsetX = 0;
    this.renderer.zoomBoost = 1;
    this.renderer.playerStyle = SKINS_BY_ID[this.save.selected.skin] ?? SKINS_BY_ID.moon;
    this.syncView();
    this.renderer.snapCamera(this.world);
    this.syncView();
    this.world.populate();
    if (recordDiscoveries(this.save, ['moon-jelli'], {}).length) {
      this.runNew.push('moon-jelli');
      this.persist();
    }
    this.state = 'play';
    track('game_start');
    this.input.reset();
    this.input.enabled = true;
    for (const s of ['title', 'pause', 'results']) this.show(s, false);
    this.show('hud', true);
    this.ui.toasts.innerHTML = '';
    this.hudCache = Game.freshHud();
    this.tutorial = { step: this.save.tutorialDone ? 99 : 0, t: 0, eats: 0 };
    this.updateHint();
    const heir = this.save.heirloom;
    this.zoneToast(this.world.zone.name, heir ? `Hatched wearing ${FORMS[heir].name}` : 'Eat smaller creatures to grow');
    this.bestAtStart = this.save.best.score;
    this.sweepRecord = this.save.best.sweep;
    this.ui.sweepPop.classList.remove('go');
    this.ui.hudBest.textContent = this.bestAtStart > 0 ? `Best ${fmt(this.bestAtStart)}` : '';
    this.ui.hudBest.classList.remove('beaten');
  }

  private pause(): void {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.reset();
    this.applySettings();
    this.show('pause', true);
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.show('pause', false);
    this.state = 'play';
    this.input.enabled = true;
    this.last = performance.now();
  }

  private endRunEarly(): void {
    const w = this.world;
    if (!w.ended) {
      w.ended = 'caught';
      w.run.time = w.time;
      w.run.mass = w.player.mass;
      w.run.stage = w.player.stage;
      w.run.score += Math.floor(w.time * 5);
    }
    this.finishRun();
  }

  private finishRun(): void {
    this.state = 'results';
    this.input.enabled = false;
    this.input.reset();
    const run = this.world.run;
    track('game_complete', { result: 'lose', stage: run.stage });
    // Discoveries were recorded the moment they happened; only eaten counts remain.
    const outcome = applyRun(this.save, { ...run, seen: [] });
    outcome.newDiscoveries = this.runNew;
    this.persist();
    this.show('hud', false);
    const p = this.world.player;
    renderResults(this.ui, run, outcome, this.save, { style: this.renderer.playerStyle, tiers: p.tiers, forms: p.forms, maturity: maturity(p.food) });
    this.show('results', true);
    this.ui.results.parentElement!.scrollTop = 0;
  }

  // ------------------------------------------------------------ loop

  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = clamp(raw, 0, 0.05);
    const r = this.renderer;
    this.syncView();

    if (this.state === 'play') {
      this.input.consume(this.simInput);
      const steps = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < steps; i++) {
        this.world.update(dt / steps, this.simInput);
        this.simInput.burst = false;
      }
      this.handleEvents(dt);
      this.updateHUD();
      this.updateTutorial(dt);
      this.emitTrail();
      if (this.world.ended) {
        this.resultsTimer += dt;
        if (this.resultsTimer > 0.2) {
          this.resultsTimer = 0;
          this.finishRun();
        }
      }
      r.updateCamera(this.world, dt);
      r.render(this.world, dt, this.input.joystick);
    } else if (this.state === 'title' || this.state === 'results') {
      this.demoStep(dt);
      r.updateCamera(this.world, dt);
      r.render(this.world, dt, null);
    } else {
      // Paused: hold the frame still but keep it rendered.
      r.render(this.world, 0, null);
    }
  };

  private demoStep(dt: number): void {
    const w = this.world;
    if (this.state === 'results') {
      // Let the scene settle behind the results card.
      w.update(dt * 0.5, { ax: 0, ay: 0, burst: false });
      w.events.length = 0;
      return;
    }
    this.demoT += dt;
    const p = w.player;
    const tx = WORLD.width / 2 + Math.cos(this.demoT * 0.23) * 260;
    const ty = 520 + Math.sin(this.demoT * 0.31) * 140;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 160) * 0.55;
    w.update(dt, { ax: (dx / d) * k, ay: (dy / d) * k, burst: false });
    w.events.length = 0;
    if (p.mass > 30) {
      p.mass = 10;
      p.r = 10;
      p.food = 0;
    }
  }

  private emitTrail(): void {
    const p = this.world.player;
    if (!p.alive) return;
    const ps = this.renderer.particles;
    if (p.burstT > 0 && Math.random() < 0.8) {
      const color = p.tiers.surge > 0 ? '#5ee0d0' : '#bfe9ff';
      ps.emit(PKind.Spark, p.x - Math.cos(p.heading) * p.r, p.y - Math.sin(p.heading) * p.r, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.5, p.r * 0.25, color);
    }
    if (Math.random() < 0.04 + p.thrust * 0.04) {
      ps.emit(PKind.Bubble, p.x + (Math.random() - 0.5) * p.r, p.y + (Math.random() - 0.5) * p.r, (Math.random() - 0.5) * 10, -10, 1.6, 1.2 + Math.random() * 2, '#fff', 0.5, 0.6);
    }
    const pw = p.powers;
    if (pw.overcharge > 0 && Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      ps.emit(PKind.Spark, p.x + Math.cos(a) * p.r * 1.3, p.y + Math.sin(a) * p.r * 1.3, Math.cos(a) * 60, Math.sin(a) * 60, 0.25, p.r * 0.15, POWERS.overcharge.color);
    }
    if (pw.frenzy > 0 && Math.random() < 0.4) {
      ps.emit(PKind.Spark, p.x + (Math.random() - 0.5) * p.r * 3, p.y + (Math.random() - 0.5) * p.r * 3, 0, -20, 0.8, p.r * 0.14, Math.random() < 0.5 ? '#ff9ff3' : '#7ff0ff');
    }
    if (pw.titan > 0 && Math.random() < 0.35) {
      ps.emit(PKind.Spark, p.x + (Math.random() - 0.5) * p.r * 2.5, p.y + (Math.random() - 0.5) * p.r * 2.5, 0, -15, 0.6, p.r * 0.2, POWERS.titan.color);
    }
    if (p.tiers.glow >= 3 && Math.random() < 0.25) {
      ps.emit(PKind.Spark, p.x + (Math.random() - 0.5) * p.r * 3, p.y + (Math.random() - 0.5) * p.r * 3, 0, -8, 1, p.r * 0.12, '#ffd27a');
    }
  }

  private handleEvents(dt: number): void {
    const w = this.world;
    const ps = this.renderer.particles;
    const p = w.player;
    this.noticeCooldown -= dt;
    for (const e of w.events) this.onEvent(e, ps, p);
    w.events.length = 0;
  }

  private onEvent(e: SimEvent, ps: Renderer['particles'], p: World['player']): void {
    switch (e.type) {
      case 'eat':
        this.renderer.feed(e.def.colors.glow);
        if (this.world.combo >= 2) {
          this.audio.combo(this.world.combo);
          const el = this.ui.combo;
          el.classList.remove('bump');
          void el.offsetWidth;
          el.classList.add('bump');
          setTimeout(() => el.classList.remove('bump'), 140);
        }
        ps.burst(e.x, e.y, 6 + Math.min(18, e.r), 60 + e.r * 4, Math.max(2, e.r * 0.35), e.def.colors.glow, 0.6);
        this.audio.eat(clamp(e.r / 40, 0, 1));
        this.tutorialSignal('eat');
        if (e.def.role === 'predator') {
          this.toast(`<b>Tables turned</b>`, '#5ee0d0', `ate a ${e.def.name}`);
          this.renderer.addShake(0.35);
        }
        break;
      case 'sweep': {
        // The net closes. One catch is just a snag; a haul gets its own moment, bigger the bigger it is.
        if (e.n < 2) break;
        this.audio.sweep(e.n);
        const color = this.renderer.playerStyle.glow;
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.6, p.r, color, 140 + e.n * 22, 0);
        ps.burst(e.x, e.y, 10 + e.n * 4, 120 + e.n * 18, 3, color, 0.7);
        this.renderer.addShake(Math.min(0.5, 0.08 + e.n * 0.04));
        const record = e.n > this.sweepRecord && e.n >= 3;
        if (record) this.sweepRecord = e.n;
        const pop = this.ui.sweepPop;
        this.ui.sweepN.textContent = `Sweep ×${e.n}`;
        this.ui.sweepBonus.textContent = record ? `New record · +${fmt(e.bonus)}` : `+${fmt(e.bonus)}`;
        pop.classList.toggle('record', record);
        pop.classList.toggle('big', e.n >= 6);
        pop.classList.remove('go');
        void pop.offsetWidth;
        pop.classList.add('go');
        break;
      }
      case 'burst':
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.5, p.r * 0.9, p.tiers.surge ? '#5ee0d0' : '#bfe9ff', 160, 0);
        for (let i = 0; i < 6; i++) ps.emit(PKind.Bubble, e.x, e.y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 1.2, 1.5 + Math.random() * 3, '#fff', 0.5, 2);
        this.audio.burst();
        break;
      case 'nova':
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.6, p.r, '#c59bff', e.r * 1.6, 0);
        ps.burst(e.x, e.y, 24, e.r * 1.4, 4, '#c59bff', 0.5);
        this.audio.sting();
        break;
      case 'sting':
        ps.burst(e.x, e.y, 26, 220, 4, '#c59bff', 0.6);
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.5, p.r, '#e3ccff', 200, 0);
        this.renderer.addShake(0.4);
        this.audio.sting();
        this.toast('<b>Stung!</b>', '#c59bff', `${e.def.name} stunned`);
        break;
      case 'caught':
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          ps.emit(PKind.Ink, p.x, p.y, Math.cos(a) * 60, Math.sin(a) * 60, 1.6, p.r * (0.4 + Math.random() * 0.6), '#1a1240', p.r * 1.2, 1.4);
        }
        ps.burst(p.x, p.y, 20, 160, 4, this.renderer.playerStyle.glow, 0.8);
        this.renderer.addShake(0.8);
        this.audio.caught();
        break;
      case 'discover': {
        const fresh = recordDiscoveries(this.save, [e.def.id], {});
        if (fresh.length) {
          this.runNew.push(e.def.id);
          this.persist();
          const rare = e.def.rarity === 'rare' || e.def.rarity === 'legendary';
          const color = { common: '#9fd8ff', uncommon: '#5ee0d0', rare: '#c59bff', legendary: '#ffd27a' }[e.def.rarity];
          this.toast(`<span>New species</span> <b>${e.def.name}</b>`, color, RARITY_LABEL[e.def.rarity]);
          this.audio.discover(rare);
          const bonus = Math.round((rare ? 400 : 50) * p.stats.discoveryBonus);
          this.world.run.score += bonus;
          if (rare) {
            this.flash();
            ps.burst(p.x, p.y, 30, 200, 5, '#ffd27a', 1.2);
          }
        }
        break;
      }
      case 'stage':
        this.audio.evolve();
        ps.emit(PKind.Ring, p.x, p.y, 0, 0, 0.9, p.r, '#ffffff', 220, 0);
        ps.burst(p.x, p.y, 30, 200, 5, this.renderer.playerStyle.glow, 1);
        break;
      case 'zone': {
        const sub = e.zone.id === 'shallows' ? 'Sunlight and safety' : e.zone.id === 'twilight' ? 'Darker water · Bigger hunters' : 'Only light you bring';
        this.zoneToast(e.zone.name, sub);
        this.audio.setDepth(e.zone.id === 'shallows' ? 0 : e.zone.id === 'twilight' ? 0.5 : 1);
        break;
      }
      case 'evolve': {
        // The diet decided: an in-world transformation, no menu, no pause.
        const path = PATHS[e.path];
        this.audio.evolve();
        ps.burst(p.x, p.y, 40, 260, 6, path.color, 1.1);
        ps.emit(PKind.Ring, p.x, p.y, 0, 0, 0.9, p.r, path.color, 260, 0);
        this.flash();
        const tier = path.tiers[e.tier - 1];
        this.toast(`<b>${tier.title}</b> ${tier.short}`, path.color, `${path.name} ${e.tier}`);
        break;
      }
      case 'form': {
        const f = FORMS[e.id];
        const first = recordForm(this.save, e.id);
        this.persist();
        this.audio.discover(true);
        ps.burst(e.x, e.y, 46, 280, 6, f.color, 1.2);
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 1, p.r, f.color, 320, 0);
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.7, p.r * 0.6, '#ffffff', 200, 0);
        this.renderer.addShake(0.3);
        this.flash();
        this.toast(`<b>${f.name}</b> ${f.desc}`, f.color, first ? 'New form' : 'Form', true);
        break;
      }
      case 'glimpse':
        recordGlimpse(this.save, e.def.id);
        this.persist();
        this.audio.notice();
        this.toast('<b>Something vast moves past your light</b>', e.def.colors.glow, 'Unknown');
        break;
      case 'rare':
        // Something too vast to see announces itself with a glimpse instead.
        if (e.def.revealLight) break;
        if (!this.world.hasSeen(e.def.id)) this.toast('<b>Something rare stirs nearby…</b>', '#ffd27a', p.stats.rareCompass ? 'Follow the gold' : '');
        break;
      case 'power': {
        const pd = POWERS[e.id];
        ps.burst(e.x, e.y, 34, 240, 5, pd.color, 1);
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.8, p.r, pd.color, 260, 0);
        this.audio.discover(true);
        this.flash();
        this.toast(`<b>${pd.name}!</b> ${pd.desc}`, pd.color, 'Power-up');
        break;
      }
      case 'shield':
        ps.burst(e.x, e.y, 30, 240, 5, POWERS.shield.color, 0.7);
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.6, p.r * 1.7, POWERS.shield.color, 220, 0);
        this.renderer.addShake(0.4);
        this.audio.sting();
        this.toast('<b>Shield blocked a bite!</b>', POWERS.shield.color, `${e.def.name} stunned`);
        break;
      case 'pearl':
        // Deep pearls are worth more, and sparkle like it.
        ps.burst(e.x, e.y, 6 + e.value / 10, 50 + e.value / 2, 1.8, '#fff0fa', 0.5);
        this.audio.pearl();
        break;
      case 'wreck':
        this.toast('<b>A sunken pirate ship</b>', '#ffd27a', 'Landmark');
        break;
      case 'chest':
        ps.burst(e.x, e.y, 46, 260, 5, '#ffd27a', 1.1);
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.8, 20, '#ffd27a', 300, 0);
        this.renderer.addShake(0.3);
        this.flash();
        this.audio.discover(true);
        this.toast('<b>Pirate treasure!</b> +1,500', '#ffd27a', 'Sunken ship');
        break;
      case 'grab':
        // The arm closes on its catch: a tight ring and a soft pluck.
        ps.emit(PKind.Ring, e.x, e.y, 0, 0, 0.3, Math.max(2, e.def.radius * 0.6), e.def.colors.glow, 70, 0);
        this.audio.grab();
        break;
      case 'escape':
        ps.burst(e.x, e.y, 6, 70, 1.6, '#bfe9ff', 0.4);
        break;
      case 'notice':
        if (this.noticeCooldown <= 0) {
          this.audio.notice();
          this.noticeCooldown = 1.2;
        }
        break;
    }
  }

  private flash(): void {
    if (this.reducedMotion()) return;
    const f = this.ui.flash;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  /** `keep` toasts (new forms) outlast ordinary ones when the stack overflows. */
  private toast(html: string, color: string, tag: string, keep = false): void {
    const el = document.createElement('div');
    el.className = keep ? 'toast keep' : 'toast';
    el.style.setProperty('--c', color);
    el.innerHTML = `${tag ? `<span class="rarity">${tag}</span>` : ''}<span>${html}</span>`;
    this.pushToast(el, 2200);
  }

  private zoneToast(name: string, sub: string): void {
    const el = document.createElement('div');
    el.className = 'toast zone';
    el.innerHTML = `<strong>${name}</strong><span>${sub}</span>`;
    this.pushToast(el, 2800);
  }

  private pushToast(el: HTMLElement, ms: number): void {
    const box = this.ui.toasts;
    box.appendChild(el);
    // When the stack is full, drop the oldest ordinary toast first, then the zone banner;
    // a new form always stays on screen.
    while (box.children.length > 2) {
      const all = [...box.children].filter((c) => c !== el);
      const old =
        all.find((c) => !c.classList.contains('zone') && !c.classList.contains('keep')) ?? all.find((c) => c.classList.contains('zone')) ?? box.firstElementChild;
      old?.remove();
    }
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  private updateHUD(): void {
    const w = this.world;
    const p = w.player;
    const c = this.hudCache;
    const ui = this.ui;
    const score = w.run.score;
    if (score !== c.score) {
      c.score = score;
      ui.score.textContent = fmt(score);
      // Passing your personal best is its own moment, once per run.
      if (!c.beaten && this.bestAtStart > 0 && score > this.bestAtStart) {
        c.beaten = true;
        ui.hudBest.textContent = 'New best';
        ui.hudBest.classList.add('beaten');
        this.toast('<b>New personal best!</b> Keep going', '#ffd27a', 'Record');
        this.audio.discover(false);
        this.flash();
      }
    }
    if (w.run.pearls !== c.pearls) {
      c.pearls = w.run.pearls;
      ui.pearlCount.textContent = String(c.pearls);
    }
    // Catch chain: shows from two catches, with a bar draining toward the break.
    const combo = w.combo >= 2 ? w.combo : 0;
    if (combo !== c.combo) {
      c.combo = combo;
      ui.combo.classList.toggle('show', combo > 0);
      ui.combo.classList.toggle('hot', combo >= 5);
      if (combo) {
        ui.comboN.textContent = `Chain ${combo}`;
        ui.comboMult.textContent = `${comboMult(combo).toFixed(2).replace(/0$/, '')}x`;
      }
    }
    const cb = combo ? Math.round((w.comboT / w.comboWindow()) * 60) / 60 : 0;
    if (cb !== c.comboBar) {
      c.comboBar = cb;
      ui.comboBar.style.transform = `scaleX(${cb})`;
    }
    // Elapsed time: runs are endless, so this counts up.
    const tide = Math.floor(w.time);
    if (tide !== c.tide) {
      c.tide = tide;
      ui.tideText.textContent = mmss(tide);
    }
    // The bar fills toward the next evolution; it turns gold once every path is maxed.
    const maxed = w.tiersLeft() === 0;
    const g = maxed ? 1 : Math.round(evolutionProgress(p.food) * 200) / 200;
    if (g !== c.growth) {
      c.growth = g;
      ui.growth.style.transform = `scaleX(${g})`;
    }
    // The fill is split by what was eaten: gold for Glow food, teal for Surge, violet for Sting,
    // pale for plain plankton. The biggest colored share is the next evolution.
    const d = p.diet;
    const plain = Math.max(0, p.food - (EVOLUTION_FOOD[w.evolutionsReached - 1] ?? 0) - d.glow - d.surge - d.sting);
    const dietKey = maxed ? 'max' : [d.glow, d.surge, d.sting, plain].map((v) => Math.round(v)).join(',');
    if (dietKey !== c.diet) {
      c.diet = dietKey;
      const parts = maxed ? [0, 0, 0, 1] : [d.glow, d.surge, d.sting, plain];
      [ui.dietGlow, ui.dietSurge, ui.dietSting, ui.dietPlain].forEach((el, i) => (el.style.flexGrow = String(parts[i])));
    }
    const lead = maxed ? null : w.dietLead();
    if ((lead ?? '') !== c.lead) {
      c.lead = lead ?? '';
      markDietLead(ui.paths, lead);
    }
    if (p.stage !== c.stage) {
      c.stage = p.stage;
      ui.stage.textContent = STAGES[p.stage - 1].name;

    }
    const tiersKey = `${p.tiers.glow}${p.tiers.surge}${p.tiers.sting}`;
    if (tiersKey !== c.tiers) {
      c.tiers = tiersKey;
      ui.growthBar.classList.toggle('apex', maxed);
      renderPathPips(ui.paths, p.tiers);
      c.lead = '';
      c.diet = '';
    }
    const max = p.stats.burstCharges;
    const full = p.charges >= max;
    const cd = full ? 1 : Math.round((p.recharge / p.stats.burstCooldown) * 50) / 50;
    if (cd !== c.cd || p.charges !== c.charges) {
      ui.burst.style.setProperty('--cd', String(cd));
      ui.burst.classList.toggle('cooling', p.charges < 1);
    }
    if (p.charges !== c.charges || max !== c.maxCharges) {
      c.charges = p.charges;
      c.maxCharges = max;
      renderCharges(ui.charges, p.charges, max);
    }
    c.cd = cd;
    const pw = p.powers;
    const powersKey = `${Math.ceil(pw.titan)},${Math.ceil(pw.overcharge)},${Math.ceil(pw.shield)},${Math.ceil(pw.frenzy)},${Math.ceil(pw.veil)},${Math.round(
      (pw.titan + pw.overcharge + pw.shield + pw.frenzy + pw.veil) * 4,
    )}`;
    if (powersKey !== c.powers) {
      c.powers = powersKey;
      renderPowers(ui.powers, pw);
    }
    let sting = '';
    if (p.stats.stingCooldown > 0) sting = w.stingReady() ? 'ready' : `${Math.ceil(p.stingCd)}`;
    if (sting !== c.sting) {
      c.sting = sting;
      ui.sting.classList.toggle('show', sting !== '');
      ui.sting.classList.toggle('charging', sting !== 'ready');
      ui.stingText.textContent = sting === 'ready' ? 'Sting ready' : `Sting ${sting}s`;
    }
  }

  // ------------------------------------------------------------ tutorial

  private tutorialSignal(kind: 'eat' | 'burst'): void {
    const t = this.tutorial;
    if (this.state !== 'play') return;
    if (t.step === 1 && kind === 'eat') {
      t.eats++;
      if (t.eats >= 3) this.advanceTutorial();
    } else if (t.step === 2 && kind === 'burst') {
      this.advanceTutorial();
    }
  }

  private advanceTutorial(): void {
    this.tutorial.step++;
    this.tutorial.t = 0;
    this.updateHint();
  }

  private updateTutorial(dt: number): void {
    const t = this.tutorial;
    if (t.step === 0 && Math.hypot(this.simInput.ax, this.simInput.ay) > 0.3) {
      t.t += dt;
      if (t.t > 0.9) this.advanceTutorial();
    } else if (t.step === 3) {
      t.t += dt;
      if (t.t > 4.5) {
        t.step = 99;
        this.save.tutorialDone = true;
        this.persist();
        this.updateHint();
      }
    }
  }

  private updateHint(): void {
    const steps = [
      TOUCH ? 'Drag anywhere to swim' : 'Swim with <kbd>WASD</kbd> or <kbd>Arrows</kbd>',
      'Swim near a <b style="color:#8cfaff">glowing ring</b> and your tentacles reel it in',
      TOUCH ? 'Tap <b>Burst</b> into a group of prey: your arms sweep up everything ahead' : 'Press <kbd>Space</kbd> to burst into a group of prey and sweep it up',
      'Red eyes mean danger · What you eat decides how you evolve',
    ];
    const text = steps[this.tutorial.step];
    this.ui.hint.classList.toggle('show', !!text);
    if (text) this.ui.hint.innerHTML = text;
  }
}

function boot(): void {
  try {
    const game = new Game();
    // Opt-in handle for automated playtesting: ?debug
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { jelli: game, jelliSpecies: SPECIES_BY_ID });
  } catch (err) {
    console.error(err);
    const ui = document.getElementById('ui');
    if (ui) ui.innerHTML = '<div class="fatal">Jelli couldn’t start on this browser. Try the latest Safari, Chrome or Firefox.</div>';
  }
}

boot();
