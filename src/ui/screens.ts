import { PATHS, PATH_ORDER, MAX_TIER, type Tiers } from '../content/evolutions';
import { SPECIES, SPECIES_BY_ID, RARITY_LABEL } from '../content/species';
import { STAGES } from '../content/progression';
import { ZONES } from '../content/world';
import { CHALLENGES } from '../content/challenges';
import { SKINS, SKINS_BY_ID, TRAITS, TRAITS_BY_ID, type UnlockId } from '../content/unlocks';
import type { PathId, SpeciesDef } from '../content/types';
import type { SaveData } from '../persistence/save';
import { countDiscovered, deathLesson, metricValue, mystery, nextChallenge, type RunOutcome, type RunStats } from '../core/progress';
import { FORMS, FORM_BY_SOURCE, FORM_ORDER, type FormId } from '../content/forms';
import type { JellyStyle } from '../render/creatures';
import { ICONS } from './icons';
import { POWERS, POWER_ORDER, type PowerTimers } from '../content/powerups';
import { renderForm, renderJelli, renderPortrait, renderSkin } from './portrait';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function mmss(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function unlockLabel(u: UnlockId): string {
  if (u.startsWith('skin:')) return `${SKINS_BY_ID[u.slice(5)]?.name ?? 'New'} skin`;
  return TRAITS_BY_ID[u.slice(6)]?.name ?? 'New trait';
}

function settingsBlock(): string {
  return `
    <div class="settings">
      <label class="setting"><span>Volume</span><input type="range" min="0" max="100" step="1" data-setting="volume" aria-label="Volume"></label>
      <div class="setting"><span>Sound</span><button class="toggle" role="switch" data-setting="sound" aria-label="Sound"></button></div>
      <div class="setting"><span>Reduced motion<small>Calmer camera and effects</small></span><button class="toggle" role="switch" data-setting="motion" aria-label="Reduced motion"></button></div>
    </div>`;
}

export function buildUI(root: HTMLElement, touch: boolean): void {
  root.innerHTML = `
  <section class="screen title" data-screen="title">
    <div class="title-corner"><button class="icon-btn" data-action="settings" aria-label="Settings">${ICONS.gear}</button></div>
    <div class="title-wrap">
      <h1 class="logo">Jelli</h1>
      <p class="tagline">Eat · Grow · Evolve · Discover</p>
    </div>
    <div class="title-actions">
      <button class="btn btn-primary" data-action="play">Play</button>
      <div class="title-row">
        <button class="btn btn-ghost" data-action="guide">${ICONS.book.replace('aria-hidden', 'width="18" height="18" aria-hidden')} Field Guide <span class="badge" data-bind="guideCount"></span></button>
        <button class="btn btn-ghost" data-action="lineage">Lineage</button>
      </div>
      <div class="loadout" data-bind="loadout"></div>
      <div class="title-meta" data-bind="best"></div>
    </div>
  </section>

  <section class="screen passthrough hud" data-screen="hud">
    <div class="hud-top">
      <div class="hud-score">
        <span class="score" data-bind="score">0</span>
        <span class="tide" data-bind="tide">${ICONS.clock}<span data-bind="tideText">0:00</span></span>
        <span class="hud-meta"><span class="hud-best" data-bind="hudBest"></span><span class="hud-pearls"><i class="pearl-dot" aria-hidden="true"></i><span data-bind="pearlCount">0</span></span></span>
      </div>
      <div class="hud-growth">
        <div class="stage-name" data-bind="stage">${STAGES[0].name}</div>
        <div class="growth-bar" data-bind="growthBar"><div class="growth-fill" data-bind="growth"><i data-bind="dietGlow" style="--c:${PATHS.glow.color}"></i><i data-bind="dietSurge" style="--c:${PATHS.surge.color}"></i><i data-bind="dietSting" style="--c:${PATHS.sting.color}"></i><i data-bind="dietPlain" class="plain"></i></div></div>
        <div class="paths" data-bind="paths"></div>
      </div>
      <div class="hud-right"><button class="icon-btn interactive" data-action="pause" aria-label="Pause">${ICONS.pause}</button></div>
    </div>
    <div class="toasts" data-bind="toasts" aria-live="polite"></div>
    <div class="hint" data-bind="hint"></div>
    <div class="powers" data-bind="powers"></div>
    <div class="sweep-pop" data-bind="sweepPop" aria-live="off"><strong data-bind="sweepN"></strong><span data-bind="sweepBonus"></span></div>
    <div class="combo" data-bind="combo" aria-live="off"><span class="combo-n" data-bind="comboN"></span><span class="combo-mult" data-bind="comboMult"></span><span class="combo-bar"><i data-bind="comboBar"></i></span></div>
    <div class="sting-chip" data-bind="sting">${ICONS.sting.replace('aria-hidden', 'width="14" height="14" aria-hidden')}<span data-bind="stingText">Sting ready</span></div>
    <div class="burst-label">${touch ? 'Burst' : 'Space'}</div>
    <button class="burst-btn" data-bind="burst" aria-label="Burst">${ICONS.burst}<span class="charges" data-bind="charges"></span></button>
    <div class="flash" data-bind="flash"></div>
  </section>

  <section class="screen scrim" data-screen="pause">
    <div class="panel">
      <p class="eyebrow">Paused</p>
      <h2>Drifting…</h2>
      ${settingsBlock()}
      <div class="panel-actions">
        <button class="btn btn-primary" data-action="resume">Resume</button>
        <button class="btn btn-ghost" data-action="restart">Restart run</button>
        <button class="btn btn-quiet" data-action="quit">End run</button>
      </div>
    </div>
  </section>

  <section class="screen scrim" data-screen="settings">
    <div class="panel">
      <p class="eyebrow">Settings</p>
      <h2>Sound &amp; motion</h2>
      ${settingsBlock()}
      <div class="panel-actions"><button class="btn btn-ghost" data-action="close">Done</button></div>
    </div>
  </section>

  <section class="screen scrim results" data-screen="results">
    <div class="results-inner" data-bind="results"></div>
  </section>

  <section class="screen sheet" data-screen="guide">
    <div class="sheet-head">
      <button class="icon-btn" data-action="close" aria-label="Back">${ICONS.back}</button>
      <div class="grow">
        <p class="eyebrow" data-bind="guideProgress"></p>
        <h2>Field Guide</h2>
        <div class="progress-line"><i data-bind="guideBar"></i></div>
      </div>
    </div>
    <div class="guide-grid" data-bind="guideGrid"></div>
    <div class="detail" data-bind="detail">
      <div class="detail-card" data-bind="detailCard"></div>
    </div>
  </section>

  <section class="screen sheet" data-screen="lineage">
    <div class="sheet-head">
      <button class="icon-btn" data-action="close" aria-label="Back">${ICONS.back}</button>
      <div class="grow">
        <p class="eyebrow" data-bind="lineageProgress"></p>
        <h2>Lineage</h2>
      </div>
    </div>
    <div class="lineage-cols" data-bind="lineage"></div>
  </section>`;
}

// ------------------------------------------------------------------ title

export function renderTitle(ui: Binds, save: SaveData): void {
  ui.guideCount.textContent = `${countDiscovered(save)}/${SPECIES.length}`;
  const pearls = save.stats.pearls > 0 ? ` · ${fmt(save.stats.pearls)} ${save.stats.pearls === 1 ? 'pearl' : 'pearls'}` : '';
  ui.best.textContent = save.best.score > 0 ? `Best ${fmt(save.best.score)} · ${save.stats.runs} ${save.stats.runs === 1 ? 'dive' : 'dives'}${pearls}` : '';
  const chips: string[] = [];
  if (save.selected.skin !== 'moon') {
    const skin = SKINS_BY_ID[save.selected.skin];
    chips.push(`<span class="chip"><span class="dot" style="--c:${skin.glow}"></span>${esc(skin.name)}</span>`);
  }
  if (save.selected.trait) {
    const tr = TRAITS_BY_ID[save.selected.trait];
    chips.push(`<span class="chip"><span class="dot" style="--c:${PATHS[tr.path].color}"></span>${esc(tr.name)}</span>`);
  }
  if (save.heirloom) {
    const f = FORMS[save.heirloom];
    chips.push(`<span class="chip"><span class="dot" style="--c:${f.color}"></span>Inherits ${esc(f.name)}</span>`);
  }
  ui.loadout.innerHTML = chips.join('');
}

// ------------------------------------------------------------------ HUD

export function renderPathPips(el: HTMLElement, tiers: Tiers): void {
  el.innerHTML = PATH_ORDER.map((id) => {
    const p = PATHS[id];
    const dots = Array.from({ length: MAX_TIER }, (_, i) => `<i class="${i < tiers[id] ? 'on' : ''}"></i>`).join('');
    return `<span class="path-pip ${tiers[id] ? 'on' : ''}" style="--c:${p.color}" title="${p.name}">${ICONS[id]}${dots}</span>`;
  }).join('');
}

/** Lights up the path the jelly's diet is steering its next evolution toward. */
export function markDietLead(el: HTMLElement, lead: PathId | null): void {
  PATH_ORDER.forEach((id, i) => el.children[i]?.classList.toggle('lead', id === lead));
}

export function renderCharges(el: HTMLElement, charges: number, max: number): void {
  if (max <= 1) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < charges ? 'on' : ''}"></i>`).join('');
}

export { mmss, fmt };

/** Active power-up chips with a draining ring. */
export function renderPowers(el: HTMLElement, powers: PowerTimers): void {
  el.innerHTML = POWER_ORDER.filter((id) => powers[id] > 0)
    .map((id) => {
      const p = POWERS[id];
      const left = powers[id] / p.duration;
      return `<span class="power-chip" style="--c:${p.color};--p:${left.toFixed(3)}"><i></i>${esc(p.name)} <b>${Math.ceil(powers[id])}</b></span>`;
    })
    .join('');
}

// ------------------------------------------------------------------ results

/** The jelly a run ended with, for its portrait on the results screen. */
export interface JelliView {
  style: JellyStyle;
  tiers: Tiers;
  forms: FormId[];
  maturity: number;
}

function formChip(id: FormId): string {
  return `<span class="chip"><span class="dot" style="--c:${FORMS[id].color}"></span>${esc(FORMS[id].name)}</span>`;
}

/** The forms this Jelli could pass on, with the chosen one marked. */
export function renderHeirs(el: HTMLElement, forms: FormId[], heirloom: FormId | null): void {
  el.innerHTML = forms
    .map(
      (id) => `<button class="heir ${heirloom === id ? 'selected' : ''}" style="--c:${FORMS[id].color}" data-action="heir" data-id="${id}" aria-pressed="${heirloom === id}">
      <span class="dot"></span><span>${esc(FORMS[id].name)}<small>${esc(FORMS[id].desc)}</small></span></button>`,
    )
    .join('');
}

export function renderResults(ui: Binds, run: RunStats, outcome: RunOutcome, save: SaveData, jelli: JelliView): void {
  const tiers = jelli.tiers;
  const caughtBy = run.caughtBy ? SPECIES_BY_ID[run.caughtBy] : null;
  const title = caughtBy ? `Caught by a ${caughtBy.name}` : 'Run ended';
  const longest = save.stats.runs > 1 && run.time >= save.stats.longest && run.time > 0;
  // Why it ended comes first: it is the thing to try differently next run.
  const sub = deathLesson(run) ?? (caughtBy
    ? longest
      ? 'Your longest swim yet. The reef will remember.'
      : 'Every jelly is somebody’s dinner. Grow faster next time.'
    : 'A short swim, but every dive counts.');
  const stageName = STAGES[run.stage - 1]?.name ?? '';
  const evo = PATH_ORDER.filter((p) => tiers[p] > 0)
    .map((p) => `<span class="chip"><span class="dot" style="--c:${PATHS[p].color}"></span>${PATHS[p].name} ${tiers[p]}</span>`)
    .join('');
  const forms = jelli.forms.map(formChip).join('');
  const heirs = jelli.forms.length
    ? `<section class="section"><h3>Pass one on</h3><p class="section-note">Your next Jelli hatches wearing it.</p><div class="heirs" data-bind="heirs"></div></section>`
    : '';
  const wonder = mystery(save, run);
  const wonderHtml = wonder
    ? `<section class="section wonder"><h3>Still out there</h3><div class="row-main"><strong>${esc(wonder.title)}</strong><small>${esc(wonder.text)}</small></div></section>`
    : '';

  const disc = outcome.newDiscoveries.length
    ? `<section class="section"><h3>New in the Field Guide</h3><div class="discoveries">${outcome.newDiscoveries
        .map((id) => {
          const d = SPECIES_BY_ID[id];
          return `<div class="mini r-${d.rarity}"><canvas data-portrait="${id}"></canvas>${esc(d.name)}<div class="rarity-tag">${RARITY_LABEL[d.rarity]}</div></div>`;
        })
        .join('')}</div></section>`
    : '';

  const done = outcome.completed.length
    ? `<section class="section"><h3>Challenges complete</h3><div class="row-list">${outcome.completed
        .map(
          (c) => `<div class="row"><span class="check done">${ICONS.check}</span><div class="row-main">${esc(c.title)}<small>${esc(c.desc)}</small></div>${c.reward ? `<span class="reward">${esc(unlockLabel(c.reward))}</span>` : ''}</div>`,
        )
        .join('')}</div></section>`
    : '';

  const next = nextChallenge(save);
  const nextHtml = next
    ? `<section class="section"><h3>Next challenge</h3><div class="row"><span class="check">${ICONS.lock}</span><div class="row-main">${esc(next.title)}<small>${esc(next.desc)}</small></div>${next.reward ? `<span class="reward">${esc(unlockLabel(next.reward))}</span>` : ''}</div></section>`
    : '';

  ui.results.innerHTML = `
    <div class="results-head">
      <p class="eyebrow">Run over</p>
      <h2>${esc(title)}</h2>
      <p>${esc(sub)}</p>
      <div class="big-score">${fmt(run.score)}</div>
      ${outcome.newBest ? '<span class="new-best">New best</span>' : `<p>Best ${fmt(save.best.score)}</p>`}
    </div>
    <div class="jelli-card">
      <canvas data-jelli></canvas>
      <div class="jelli-info">
        <p class="eyebrow">Your Jelli became</p>
        <strong>${esc(stageName)}</strong>
        <div class="loadout">${evo}${forms}</div>
        ${evo || forms ? '' : '<small>No evolutions or forms yet. What it eats decides what it becomes.</small>'}
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat"><span>Biggest sweep</span><strong>${run.bestSweep}${sweepNote(run.bestSweep, outcome.prevBestSweep)}</strong></div>
      <div class="stat"><span>Eaten</span><strong>${run.eaten}</strong></div>
      <div class="stat"><span>Survived</span><strong>${mmss(run.time)}</strong></div>
      <div class="stat"><span>Deepest</span><strong>${esc(zoneName(run.maxDepth))}</strong></div>
      <div class="stat"><span>Longest chain</span><strong>${run.bestCombo}${run.bestCombo >= save.best.combo && run.bestCombo > 1 ? ' <em>best</em>' : ''}</strong></div>
      <div class="stat"><span>Pearls</span><strong>${run.pearls}${run.chest ? ' + chest' : ''}</strong></div>
    </div>
    ${heirs}
    ${disc}
    ${wonderHtml}
    ${done}
    ${nextHtml}
    <div class="results-actions">
      <button class="btn btn-primary" data-action="play">Swim again</button>
      <div class="split">
        <button class="btn btn-ghost" data-action="guide">Field Guide</button>
        <button class="btn btn-ghost" data-action="home">Home</button>
      </div>
    </div>`;
  ui.results.querySelectorAll<HTMLCanvasElement>('canvas[data-portrait]').forEach((cv) => {
    renderPortrait(cv, SPECIES_BY_ID[cv.dataset.portrait!], true, 84);
  });
  renderJelli(ui.results.querySelector<HTMLCanvasElement>('canvas[data-jelli]')!, jelli.style, tiers, jelli.forms, jelli.maturity, 132);
  const heirEl = ui.results.querySelector<HTMLElement>('[data-bind="heirs"]');
  if (heirEl) renderHeirs(heirEl, jelli.forms, save.heirloom);
}

/** Beside the run's biggest sweep: a new record, or how close it came. */
function sweepNote(n: number, prev: number): string {
  if (n > prev && n >= 2) return ' <em>record</em>';
  if (prev > n && prev - n <= 2) return ` <small>record ${prev}</small>`;
  return '';
}

function zoneName(depth: number): string {
  let name = ZONES[0].name;
  for (const z of ZONES) if (depth >= z.top) name = z.name;
  return name;
}

// ------------------------------------------------------------------ field guide

export function renderGuide(ui: Binds, save: SaveData): void {
  const n = countDiscovered(save);
  ui.guideProgress.textContent = `${n} of ${SPECIES.length} species discovered`;
  ui.guideBar.style.width = `${(n / SPECIES.length) * 100}%`;
  ui.guideGrid.innerHTML = SPECIES.map((s) => {
    const known = !!save.discovered[s.id];
    const glimpsed = !known && !!save.glimpses[s.id];
    return `<button class="entry r-${s.rarity} ${known ? '' : 'locked'}" data-action="species" data-id="${s.id}">
      <canvas data-portrait="${s.id}" data-known="${known ? 1 : 0}"></canvas>
      <span class="name">${known ? esc(s.name) : glimpsed ? 'Glimpsed' : '???'}</span>
      <span class="rarity-tag">${RARITY_LABEL[s.rarity]}</span>
    </button>`;
  }).join('');
  ui.guideGrid.querySelectorAll<HTMLCanvasElement>('canvas[data-portrait]').forEach((cv) => {
    renderPortrait(cv, SPECIES_BY_ID[cv.dataset.portrait!], cv.dataset.known === '1', 110);
  });
}

function habitat(def: SpeciesDef): string {
  return ZONES.filter((z) => def.zones.includes(z.id))
    .map((z) => z.name)
    .join(', ');
}

const ROLE_LABEL: Record<SpeciesDef['role'], string> = { player: 'You', prey: 'Prey', predator: 'Hunter', ambient: 'Gentle giant' };

export function renderDetail(ui: Binds, save: SaveData, id: string): void {
  const def = SPECIES_BY_ID[id];
  const rec = save.discovered[id];
  const known = !!rec;
  ui.detailCard.className = `detail-card r-${def.rarity}`;
  ui.detailCard.innerHTML = `
    <button class="icon-btn detail-close" data-action="closeDetail" aria-label="Close">${ICONS.close}</button>
    <canvas data-portrait="${id}"></canvas>
    <div class="rarity-tag">${RARITY_LABEL[def.rarity]} · ${known ? ROLE_LABEL[def.role] : 'Undiscovered'}</div>
    <h3>${known ? esc(def.name) : 'Unknown species'}</h3>
    ${known ? `<div class="latin">${esc(def.latin)}</div>` : ''}
    <p class="blurb">${known ? esc(def.blurb) : `Field notes: “${esc(def.hint)}”`}</p>
    <div class="facts">
      ${known ? `<span class="chip">Habitat · ${esc(habitat(def))}</span>` : ''}
      ${known && def.role !== 'player' ? `<span class="chip">Seen in ${rec.seen} ${rec.seen === 1 ? 'dive' : 'dives'}</span>` : ''}
      ${known && rec.eaten ? `<span class="chip">Eaten ${rec.eaten}</span>` : ''}
      ${known && def.diet ? `<span class="chip"><span class="dot" style="--c:${PATHS[def.diet].color}"></span>Feeds your ${PATHS[def.diet].name}</span>` : ''}
      ${!known && save.glimpses[id] ? `<span class="chip">Glimpsed in ${save.glimpses[id]} ${save.glimpses[id] === 1 ? 'dive' : 'dives'}</span>` : ''}
      ${formFact(save, id, known)}
      ${def.power ? `<span class="chip"><span class="dot" style="--c:${POWERS[def.power].color}"></span>${known ? `${esc(POWERS[def.power].name)} · ${esc(POWERS[def.power].desc)}` : 'Grants a power-up'}</span>` : ''}
    </div>`;
  renderPortrait(ui.detailCard.querySelector('canvas')!, def, known, 240);
  ui.detail.classList.add('is-open');
}

/** What eating this creature does to you, once you know. Before that, only that it will. */
function formFact(save: SaveData, id: string, known: boolean): string {
  const form = FORM_BY_SOURCE[id];
  if (!form || !known) return '';
  const f = FORMS[form];
  return save.forms.includes(form)
    ? `<span class="chip"><span class="dot" style="--c:${f.color}"></span>Eat one · ${esc(f.name)} · ${esc(f.desc)}</span>`
    : '<span class="chip">Eating one would change you</span>';
}

// ------------------------------------------------------------------ lineage

export function renderLineage(ui: Binds, save: SaveData): void {
  const done = CHALLENGES.filter((c) => save.challenges[c.id]).length;
  ui.lineageProgress.textContent = `${done} of ${CHALLENGES.length} challenges`;
  const rewardSource = (u: UnlockId) => CHALLENGES.find((c) => c.reward === u);

  const challenges = CHALLENGES.map((c) => {
    const complete = !!save.challenges[c.id];
    const life = c.metric.startsWith('life.');
    const pct = complete ? 100 : life ? Math.min(100, (metricValue(c.metric, null, save) / c.goal) * 100) : 0;
    return `<div class="row"><span class="check ${complete ? 'done' : ''}">${complete ? ICONS.check : ICONS.lock}</span>
      <div class="row-main">${esc(c.title)}<small>${esc(c.desc)}</small>${life && !complete ? `<div class="challenge-bar"><i style="width:${pct}%"></i></div>` : ''}</div>
      ${c.reward ? `<span class="reward">${esc(unlockLabel(c.reward))}</span>` : ''}</div>`;
  }).join('');

  const skins = SKINS.map((s) => {
    const owned = save.unlocks.includes(`skin:${s.id}`);
    const src = rewardSource(`skin:${s.id}`);
    return `<button class="skin ${owned ? '' : 'locked'} ${save.selected.skin === s.id ? 'selected' : ''}" data-action="skin" data-id="${s.id}" ${owned ? '' : 'disabled'} title="${owned ? s.name : `Unlock: ${src?.title ?? ''}`}">
      <canvas data-skin="${s.id}"></canvas>${esc(s.name)}</button>`;
  }).join('');

  const traits = TRAITS.map((t) => {
    const owned = save.unlocks.includes(`trait:${t.id}`);
    const src = rewardSource(`trait:${t.id}`);
    const p = PATHS[t.path as PathId];
    return `<button class="trait ${owned ? '' : 'locked'} ${save.selected.trait === t.id ? 'selected' : ''}" style="--c:${p.color}" data-action="trait" data-id="${t.id}" ${owned ? '' : 'disabled'}>
      ${ICONS[t.path]}<span>${esc(t.name)}<small>${owned ? esc(t.desc) : `Unlock: ${esc(src?.title ?? '')}`}</small></span></button>`;
  }).join('');

  const worn = FORM_ORDER.filter((id) => save.forms.includes(id)).length;
  const forms = FORM_ORDER.map((id) => {
    const known = save.forms.includes(id);
    const f = FORMS[id];
    return `<div class="form ${known ? '' : 'locked'} ${save.heirloom === id ? 'selected' : ''}">
      <canvas data-form="${id}" data-known="${known ? 1 : 0}"></canvas>
      <span class="name">${known ? esc(f.name) : '???'}</span>
      <small>${known ? esc(f.desc) : esc(f.hint)}</small>
      ${save.heirloom === id ? '<span class="rarity-tag">Inherited</span>' : ''}
    </div>`;
  }).join('');

  ui.lineage.innerHTML = `
    <section class="section forms-section"><h3>Forms · ${worn} of ${FORM_ORDER.length}</h3><p class="section-note">Eat a hunter or a rare creature and part of it grows onto you for the rest of the dive.</p><div class="forms">${forms}</div></section>
    <section class="section"><h3>Challenges</h3><div class="row-list">${challenges}</div></section>
    <div>
      <section class="section"><h3>Starting trait</h3>${traits}</section>
      <section class="section" style="margin-top:16px"><h3>Bell colors</h3><div class="skins">${skins}</div></section>
    </div>`;
  ui.lineage.querySelectorAll<HTMLCanvasElement>('canvas[data-skin]').forEach((cv) => renderSkin(cv, SKINS_BY_ID[cv.dataset.skin!], 64));
  const style = SKINS_BY_ID[save.selected.skin] ?? SKINS_BY_ID.moon;
  ui.lineage.querySelectorAll<HTMLCanvasElement>('canvas[data-form]').forEach((cv) => renderForm(cv, style, cv.dataset.form as FormId, cv.dataset.known === '1', 88));
}

// ------------------------------------------------------------------ binding

export type Binds = Record<string, HTMLElement>;

export function collectBinds(root: HTMLElement): Binds {
  const out: Binds = {};
  root.querySelectorAll<HTMLElement>('[data-bind]').forEach((el) => {
    out[el.dataset.bind!] = el;
  });
  return out;
}
