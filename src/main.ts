import '@fontsource-variable/fraunces';
import '@fontsource-variable/outfit';
import './styles.css';

import { World, type SimEvent, type SimInput } from './sim/world';
import { Renderer } from './render/renderer';
import { Input } from './core/input';
import { AudioEngine } from './audio/audio';
import { SaveStore, type SaveData } from './persistence/save';
import { applyRun, recordDiscoveries } from './core/progress';
import { PATHS, type Tiers } from './content/evolutions';
import { STAGES, evolutionProgress } from './content/progression';
import { RARITY_LABEL, SPECIES_BY_ID } from './content/species';
import { SKINS_BY_ID, TRAITS_BY_ID } from './content/unlocks';
import { WORLD } from './content/world';
import { POWERS } from './content/powerups';
import type { PathId } from './content/types';
import { clamp } from './core/math';
import { COMBO_WINDOW, comboMult } from './sim/rules';
import { PKind } from './render/particles';
import {
  buildUI,
  collectBinds,
  fmt,
  mmss,
  renderCharges,
  renderDetail,
  renderEvolve,
  renderGuide,
  renderLineage,
  renderPathPips,
  renderPowers,
  renderResults,
  renderTitle,
  type Binds,
} from './ui/screens';

type State = 'title' | 'play' | 'paused' | 'evolve' | 'results';
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
  private hudCache = { score: -1, tide: -1, growth: -1, stage: -1, cd: -1, charges: -1, maxCharges: -1, sting: '', tiers: '', powers: '', combo: -1, comboBar: -1, pearls: -1, beaten: false };
  private tutorial = { step: 0, t: 0, eats: 0 };
  /** Personal best when this run began, for the mid-run "new best" moment. */
  private bestAtStart = 0;
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
        if (!(e.target as HTMLElement).closest('.results, .sheet, .evolve')) e.preventDefault();
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
    this.world = new World({ demo: true, tiers: this.startTiers() });
    this.frameTitle();
    this.syncView();
    this.renderer.snapCamera(this.world);
    this.syncView();
    this.world.populate();
    renderTitle(this.ui, this.save);
    for (const s of ['hud', 'pause', 'evolve', 'results']) this.show(s, false);
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
      case 'evolve':
        this.chooseEvolution(el.dataset.path as PathId);
        break;
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

  private startRun(): void {
    this.audio.unlock();
    this.world = new World({ tiers: this.startTiers() });
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
    this.input.reset();
    this.input.enabled = true;
    for (const s of ['title', 'pause', 'evolve', 'results']) this.show(s, false);
    this.show('hud', true);
    this.ui.toasts.innerHTML = '';
    this.hudCache = { score: -1, tide: -1, growth: -1, stage: -1, cd: -1, charges: -1, maxCharges: -1, sting: '', tiers: '', powers: '', combo: -1, comboBar: -1, pearls: -1, beaten: false };
    this.tutorial = { step: this.save.tutorialDone ? 99 : 0, t: 0, eats: 0 };
    this.updateHint();
    this.zoneToast(this.world.zone.name, 'Eat smaller creatures to grow');
    this.bestAtStart = this.save.best.score;
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
    // Discoveries were recorded the moment they happened; only eaten counts remain.
    const outcome = applyRun(this.save, { ...run, seen: [] });
    outcome.newDiscoveries = this.runNew;
    this.persist();
    this.show('hud', false);
    this.show('evolve', false);
    renderResults(this.ui, run, outcome, this.save, this.world.player.tiers);
    this.show('results', true);
    this.ui.results.parentElement!.scrollTop = 0;
  }

  private chooseEvolution(path: PathId): void {
    if (this.state !== 'evolve') return;
    this.world.applyEvolution(path);
    this.audio.evolve();
    const p = this.world.player;
    this.renderer.particles.burst(p.x, p.y, 40, 260, 6, PATHS[path].color, 1.1);
    this.renderer.particles.emit(PKind.Ring, p.x, p.y, 0, 0, 0.9, p.r, PATHS[path].color, 260, 0);
    this.flash();
    this.toast(`<b>${PATHS[path].tiers[p.tiers[path] - 1].title}</b>`, PATHS[path].color, PATHS[path].name);
    if (this.world.pendingEvolutions > 0) {
      renderEvolve(this.ui, p.tiers, p.stage);
    } else {
      this.show('evolve', false);
      this.state = 'play';
      this.input.enabled = true;
      this.last = performance.now();
      this.updateHint();
    }
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
      if (this.world.pendingEvolutions > 0 && this.world.player.alive && !this.world.ended) this.openEvolve();
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
      // Paused or choosing: hold the frame still but keep it rendered.
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

  private openEvolve(): void {
    this.state = 'evolve';
    this.input.enabled = false;
    this.input.reset();
    renderEvolve(this.ui, this.world.player.tiers, this.world.player.stage);
    this.ui.toasts.innerHTML = '';
    // The tutorial pill would show through the cards.
    this.ui.hint.classList.remove('show');
    this.show('evolve', true);
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
      case 'rare':
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

  private toast(html: string, color: string, tag: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
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
    // Keep the zone banner: when the stack is full, drop the oldest other toast first.
    while (box.children.length > 2) {
      const old = [...box.children].find((c) => c !== el && !c.classList.contains('zone')) ?? box.firstElementChild;
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
    const cb = combo ? Math.round((w.comboT / COMBO_WINDOW) * 60) / 60 : 0;
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
    if (p.stage !== c.stage) {
      c.stage = p.stage;
      ui.stage.textContent = STAGES[p.stage - 1].name;

    }
    const tiersKey = `${p.tiers.glow}${p.tiers.surge}${p.tiers.sting}`;
    if (tiersKey !== c.tiers) {
      c.tiers = tiersKey;
      ui.growthBar.classList.toggle('apex', maxed);
      renderPathPips(ui.paths, p.tiers);
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
      TOUCH ? 'Tap <b>Burst</b> for a quick dash' : 'Press <kbd>Space</kbd> to burst',
      'Red eyes mean danger · Fill the bar to evolve',
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
