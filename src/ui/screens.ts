import { PATHS } from '../content/evolutions';
import { CATEGORY, MUTATIONS, MUTATIONS_BY_ID, type MutationId } from '../content/mutations';
import { PERSONALITIES, PERSONALITY_ORDER, dominant, type PersonalityId } from '../content/personality';
import { SPECIES, SPECIES_BY_ID, RARITY_LABEL } from '../content/species';
import { STAGES } from '../content/progression';
import { ZONES, depthMeters, zoneAt, zoneIndex } from '../content/world';
import type { ZoneId } from '../content/types';
import { CHALLENGES } from '../content/challenges';
import { SKINS, SKINS_BY_ID, TRAITS, TRAITS_BY_ID, type UnlockId } from '../content/unlocks';
import type { PathId, SpeciesDef } from '../content/types';
import type { SaveData } from '../persistence/save';
import { countDiscovered, deathLesson, metricValue, mystery, nextBiome, type RunOutcome, type RunStats } from '../core/progress';
import { FORMS, FORM_BY_SOURCE, FORM_ORDER, type FormId } from '../content/forms';
import type { JellyStyle } from '../render/creatures';
import { ICONS } from './icons';
import { POWERS, POWER_ORDER, type PowerTimers } from '../content/powerups';
import { ENCOUNTERS, LANDMARKS, RELIC_SLOTS, TREASURES, TREASURES_BY_ID } from '../content/landmarks';
import { renderForm, renderOctopus, renderPortrait, renderSkin } from './portrait';
import type { OctoVariant, OctopusId } from '../content/octopus';

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
      ${wordmark()}
      <p class="tagline">You begin as a tiny octopus. What you become is up to you.</p>
      <p class="meet" data-bind="meet"></p>
    </div>
    <div class="title-actions">
      <button class="btn btn-primary" data-action="play">Play</button>
      <div class="title-row">
        <button class="btn btn-ghost" data-action="guide">${ICONS.book.replace('aria-hidden', 'width="18" height="18" aria-hidden')} Journal <span class="badge" data-bind="guideCount"></span></button>
        <button class="btn btn-ghost" data-action="lineage">Lineage</button>
      </div>
      <div class="loadout" data-bind="loadout"></div>
      <div class="title-meta" data-bind="best"></div>
    </div>
  </section>

  <section class="screen passthrough hud" data-screen="hud">
    <div class="hud-top">
      <div class="hud-score">
        <span class="score" data-bind="depth">0 m</span>
        <span class="hud-meta"><span class="hud-best" data-bind="hudBest"></span></span>
        <div class="biome-strip" data-bind="biomeStrip" aria-hidden="true"></div>
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
    <div class="sting-chip" data-bind="sting">${ICONS.sting.replace('aria-hidden', 'width="14" height="14" aria-hidden')}<span data-bind="stingText">Venom ready</span></div>
    <div class="burst-label">${touch ? 'Jet' : 'Space'}</div>
    <button class="burst-btn" data-bind="burst" aria-label="Jet">${ICONS.burst}<span class="charges" data-bind="charges"></span></button>
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

  <section class="screen evolve" data-screen="evolve" aria-live="polite">
    <div class="evolve-inner">
      <p class="eyebrow">Your body is changing</p>
      <h2>Evolve</h2>
      <p class="evolve-note" data-bind="evolveNote"></p>
      <div class="cards" data-bind="evolveCards"></div>
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
        <h2>Journal</h2>
        <div class="progress-line"><i data-bind="guideBar"></i></div>
      </div>
    </div>
    <div class="tabs" role="tablist" data-bind="guideTabs">
      <button class="tab" role="tab" data-action="guideTab" data-tab="life">Life</button>
      <button class="tab" role="tab" data-action="guideTab" data-tab="mutations">Body</button>
      <button class="tab" role="tab" data-action="guideTab" data-tab="places">Places</button>
      <button class="tab" role="tab" data-action="guideTab" data-tab="record">Record</button>
    </div>
    <div class="guide-grid" data-bind="guideGrid"></div>
    <div class="places" data-bind="placesList"></div>
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

/**
 * The SQUIDO wordmark: soft, chunky letters that bob out of line, a tentacle curling off the
 * Q's tail, and a final O that is an eye, which blinks and glances about.
 */
function wordmark(): string {
  const tail = `<svg class="q-tail" viewBox="0 0 60 64" aria-hidden="true"><path d="M4 4 C 16 18 38 12 44 30 C 50 48 30 60 20 50 C 12 42 22 32 30 40" fill="none" stroke="url(#wm-arm)" stroke-width="9" stroke-linecap="round"/><g fill="#ffe2d2"><circle cx="20" cy="15" r="2.6"/><circle cx="34" cy="20" r="2.4"/><circle cx="43" cy="33" r="2.2"/><circle cx="39" cy="47" r="1.9"/></g><defs><linearGradient id="wm-arm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9f7c"/><stop offset="1" stop-color="#e0507a"/></linearGradient></defs></svg>`;
  const letters = ['S', 'Q', 'U', 'I', 'D'].map((ch, i) => `<span class="l l${i}">${ch}${ch === 'Q' ? tail : ''}</span>`).join('');
  return `<h1 class="logo" aria-label="SQUIDO"><span class="wm" aria-hidden="true">${letters}<span class="l l5">O<span class="wm-eye"><i></i></span></span></span></h1>`;
}

export function renderTitle(ui: Binds, save: SaveData): void {
  const o = save.octopus;
  ui.meet.innerHTML = `Meet <b>${esc(o.name)}</b> · Generation ${fmt(o.generation)}`;
  ui.guideCount.textContent = `${countDiscovered(save)}/${SPECIES.length}`;
  const pearls = save.stats.pearls > 0 ? ` · ${fmt(save.stats.pearls)} ${save.stats.pearls === 1 ? 'pearl' : 'pearls'}` : '';
  ui.best.textContent =
    save.best.depth > 0
      ? `Deepest ${meters(save.best.depth)} · ${zoneAt(save.best.depth).name} · ${save.stats.runs} ${save.stats.runs === 1 ? 'dive' : 'dives'}${pearls}`
      : '';
  const chips: string[] = [];
  if (save.selected.skin !== 'moon') {
    const skin = SKINS_BY_ID[save.selected.skin];
    chips.push(`<span class="chip"><span class="dot" style="--c:${skin.glow}"></span>${esc(skin.name)}</span>`);
  }
  if (save.selected.trait) {
    const tr = TRAITS_BY_ID[save.selected.trait];
    chips.push(`<span class="chip"><span class="dot" style="--c:${CATEGORY[MUTATIONS_BY_ID[tr.mutation].category].color}"></span>${esc(tr.name)}</span>`);
  }
  for (const id of save.relics) {
    const tr = TREASURES_BY_ID[id];
    chips.push(`<span class="chip"><span class="dot" style="--c:${tr.color}"></span>${esc(tr.name)}</span>`);
  }
  const mood = dominant(save.personality);
  if (mood) chips.unshift(`<span class="chip"><span class="dot" style="--c:${PERSONALITIES[mood].color}"></span>${esc(PERSONALITIES[mood].name)}</span>`);
  if (save.heirloom) {
    const f = FORMS[save.heirloom];
    chips.push(`<span class="chip"><span class="dot" style="--c:${f.color}"></span>Inherits ${esc(f.name)}</span>`);
  }
  ui.loadout.innerHTML = chips.join('');
}

// ------------------------------------------------------------------ HUD

/** The mutations grown this dive, as a row of small marks in their category colors. */
export function renderMutationPips(el: HTMLElement, mutations: readonly MutationId[]): void {
  el.innerHTML = mutations
    .map((id) => {
      const m = MUTATIONS_BY_ID[id];
      return `<i class="mut-pip" style="--c:${CATEGORY[m.category].color}" title="${esc(m.name)}"></i>`;
    })
    .join('');
}

/** The evolution choice: up to three mutations, each drawn on your octopus as it would look. */
export function renderEvolve(
  ui: Binds,
  offers: MutationId[],
  view: { style: JellyStyle; mutations: readonly MutationId[]; forms: readonly FormId[]; maturity: number; personality: PersonalityId | null; variant?: OctoVariant },
  pending: number,
): void {
  ui.evolveNote.textContent = pending > 1 ? `Choose one. ${pending - 1} more ${pending === 2 ? 'change is' : 'changes are'} waiting after this.` : 'Choose one. It stays for the rest of the dive.';
  ui.evolveCards.innerHTML = offers
    .map((id) => {
      const m = MUTATIONS_BY_ID[id];
      const c = CATEGORY[m.category];
      return `<button class="evo-card" style="--c:${c.color}" data-action="mutate" data-id="${id}">
        <canvas data-evo="${id}"></canvas>
        <span class="evo-text">
          <span class="rarity-tag">${esc(c.name)}</span>
          <strong>${esc(m.name)}</strong>
          <span class="evo-desc">${esc(m.desc)}</span>
          ${m.cost ? `<span class="evo-cost">${esc(m.cost)}</span>` : ''}
        </span>
      </button>`;
    })
    .join('');
  ui.evolveCards.querySelectorAll<HTMLCanvasElement>('canvas[data-evo]').forEach((cv) => {
    renderOctopus(cv, view.style, [...view.mutations, cv.dataset.evo as MutationId], view.forms, view.maturity, 96, view.personality, 1.2, view.variant);
  });
}

/** Depth for display: "742 m". */
export function meters(y: number): string {
  return `${fmt(depthMeters(y))} m`;
}

/** Where a depth sits along the biome strip, 0..1: each biome gets an equal share. */
function stripPos(y: number): number {
  const z = zoneAt(y);
  const i = zoneIndex(z.id);
  const span = Number.isFinite(z.bottom) ? z.bottom - z.top : 4000;
  return (i + Math.min(1, Math.max(0, (y - z.top) / span))) / ZONES.length;
}

/**
 * The biome strip under the depth readout: one band per biome, dark until some octopus has
 * reached it, with a gold tick at your record and a dot for where you are now.
 */
export function renderBiomeStrip(el: HTMLElement, seen: readonly ZoneId[], record: number): void {
  el.innerHTML =
    ZONES.map((z) => `<i class="${seen.includes(z.id) ? '' : 'unseen'}" style="--c:${z.color}"></i>`).join('') +
    (record > 0 ? `<b class="rec" style="left:${(stripPos(record) * 100).toFixed(1)}%"></b>` : '') +
    '<b class="you"></b>';
}

export function moveBiomeStrip(el: HTMLElement, y: number): void {
  const you = el.querySelector<HTMLElement>('.you');
  if (you) you.style.left = `${(stripPos(y) * 100).toFixed(1)}%`;
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

/** The octopus a dive ended with, for its portrait on the results screen. */
export interface OctopusView {
  style: JellyStyle;
  mutations: MutationId[];
  personality: PersonalityId | null;
  forms: FormId[];
  /** Who it was, and how it looked. */
  who: OctopusId;
  variant: OctoVariant;
  maturity: number;
}

function formChip(id: FormId): string {
  return `<span class="chip"><span class="dot" style="--c:${FORMS[id].color}"></span>${esc(FORMS[id].name)}</span>`;
}

/** The forms this octopus could pass on, with the chosen one marked. */
export function renderHeirs(el: HTMLElement, forms: FormId[], heirloom: FormId | null): void {
  el.innerHTML = forms
    .map(
      (id) => `<button class="heir ${heirloom === id ? 'selected' : ''}" style="--c:${FORMS[id].color}" data-action="heir" data-id="${id}" aria-pressed="${heirloom === id}">
      <span class="dot"></span><span>${esc(FORMS[id].name)}<small>${esc(FORMS[id].desc)}</small></span></button>`,
    )
    .join('');
}

export function renderResults(ui: Binds, run: RunStats, outcome: RunOutcome, save: SaveData, octo: OctopusView): void {
  const caughtBy = run.caughtBy ? SPECIES_BY_ID[run.caughtBy] : null;
  const zone = zoneAt(run.maxDepth);
  const how = caughtBy ? `Caught by a ${caughtBy.name}` : 'You surfaced';
  // Why it ended comes right after how deep: it is the thing to try differently next run.
  const sub = deathLesson(run) ?? (caughtBy ? 'Every octopus is somebody’s dinner. The deep is waiting.' : 'Every dive goes somewhere new.');
  const depth = depthMeters(run.maxDepth);
  const prev = depthMeters(outcome.prevBestDepth);
  const record =
    run.maxDepth > outcome.prevBestDepth && outcome.prevBestDepth > 0
      ? '<span class="new-best">New depth record</span>'
      : outcome.prevBestDepth > 0
        ? `<p class="record-note">${prev - depth <= Math.max(60, prev * 0.15) ? `${fmt(prev - depth)} m short of your record` : `Your record is ${fmt(prev)} m`}</p>`
        : '';
  const descent = `<div class="descent">${run.biomes
    .map((id) => {
      const z = ZONES[zoneIndex(id)];
      return `<span class="chip"><span class="dot" style="--c:${z.color}"></span>${esc(z.name)}${outcome.newBiomes.includes(id) ? ' <em>new</em>' : ''}</span>`;
    })
    .join('')}</div>`;
  // A glimpse of the next place nobody has reached yet.
  const below = nextBiome(save);
  const belowHtml = below
    ? `<section class="section wonder below" style="--c:${below.color}"><h3>Below ${fmt(depthMeters(below.top))} m</h3><div class="row-main"><strong>???</strong><small>${esc(below.teaser)}</small></div></section>`
    : '';
  const stageName = STAGES[run.stage - 1]?.name ?? '';
  const evo = octo.mutations
    .map((id) => `<span class="chip"><span class="dot" style="--c:${CATEGORY[MUTATIONS_BY_ID[id].category].color}"></span>${esc(MUTATIONS_BY_ID[id].name)}${outcome.newMutations.includes(id) ? ' <em>new</em>' : ''}</span>`)
    .join('');
  const mood = outcome.personality;
  const moodHtml = mood
    ? `<section class="section persona" style="--c:${PERSONALITIES[mood].color}"><h3>${outcome.personalityNew ? 'A personality has emerged' : 'Personality'}</h3><div class="row-main"><strong>${esc(PERSONALITIES[mood].name)}</strong><small>${esc(PERSONALITIES[mood].line)} ${esc(PERSONALITIES[mood].perk)}</small></div></section>`
    : '';
  const forms = octo.forms.map(formChip).join('');
  const heirs = octo.forms.length
    ? `<section class="section"><h3>Pass one on</h3><p class="section-note">${esc(save.octopus.name)}, the next to hatch, will wear it.</p><div class="heirs" data-bind="heirs"></div></section>`
    : '';
  const wonder = below ? null : mystery(save, run);
  const wonderHtml = wonder
    ? `<section class="section wonder"><h3>Still out there</h3><div class="row-main"><strong>${esc(wonder.title)}</strong><small>${esc(wonder.text)}</small></div></section>`
    : '';

  // What this dive found: places, treasures and rare moments, each marked when it was a first.
  const foundChips = [
    ...run.places.map((id) => {
      const l = LANDMARKS.find((x) => x.id === id)!;
      return `<span class="chip"><span class="dot" style="--c:${l.color}"></span>${esc(l.name)}${outcome.newPlaces.includes(id) ? ' <em>new</em>' : ''}</span>`;
    }),
    ...run.treasures.map((id) => {
      const t = TREASURES_BY_ID[id];
      return `<span class="chip"><span class="dot" style="--c:${t.color}"></span>${esc(t.name)}${outcome.newTreasures.includes(id) ? ' <em>new</em>' : ''}</span>`;
    }),
    ...run.encounters.map((id) => `<span class="chip"><span class="dot" style="--c:${ENCOUNTERS[id].color}"></span>${esc(ENCOUNTERS[id].name)}</span>`),
  ];
  const fresh = outcome.newDiscoveries.filter((id) => id !== 'moon-jelli');
  const freshCount = fresh.length;
  const seenCount = Math.max(freshCount, run.seen.filter((id) => id !== 'moon-jelli').length);
  const relicNote = outcome.newTreasures.length ? '<p class="section-note">New treasures become relics. Carry them into your next dive from Lineage.</p>' : '';
  const foundHtml = foundChips.length ? `<section class="section"><h3>Found on this dive</h3>${relicNote}<div class="facts">${foundChips.join('')}</div></section>` : '';
  const disc = outcome.newDiscoveries.length
    ? `<section class="section"><h3>New in the Journal</h3><div class="discoveries">${outcome.newDiscoveries
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

  ui.results.innerHTML = `
    <div class="results-head">
      <p class="eyebrow">${esc(octo.who.name)} reached</p>
      <div class="big-score">${fmt(depth)} m</div>
      <h2>${esc(zone.name)}</h2>
      ${record}
      <p class="how"><b>${esc(how)}.</b> ${esc(sub)}</p>
    </div>
    ${descent}
    ${belowHtml}
    <div class="octo-card">
      <canvas data-octo></canvas>
      <div class="octo-info">
        <p class="eyebrow">${esc(octo.who.name)} · Generation ${fmt(octo.who.generation)}</p>
        <strong>${esc(stageName)}</strong>
        <div class="loadout">${evo}${forms}</div>
        ${evo || forms ? '' : '<small>No mutations yet. Eat and explore to fill the growth meter, then choose what changes.</small>'}
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat"><span>Biggest sweep</span><strong>${run.bestSweep}${sweepNote(run.bestSweep, outcome.prevBestSweep)}</strong></div>
      <div class="stat"><span>Eaten</span><strong>${run.eaten}</strong></div>
      <div class="stat"><span>Survived</span><strong>${mmss(run.time)}</strong></div>
      <div class="stat"><span>Points</span><strong>${fmt(run.score)}</strong></div>
      <div class="stat"><span>Species seen</span><strong>${seenCount}${freshCount ? ` <em>${freshCount} new</em>` : ''}</strong></div>
      <div class="stat"><span>Pearls</span><strong>${run.pearls}${run.chest ? ' + chest' : ''}</strong></div>
    </div>
    ${moodHtml}
    ${foundHtml}
    ${heirs}
    ${disc}
    ${wonderHtml}
    ${done}
    <div class="results-actions">
      <button class="btn btn-primary" data-action="play" aria-label="Hatch ${esc(save.octopus.name)}, generation ${fmt(save.octopus.generation)}">Hatch ${esc(save.octopus.name)}</button>
      <div class="split">
        <button class="btn btn-ghost" data-action="guide">Journal</button>
        <button class="btn btn-ghost" data-action="home">Home</button>
      </div>
    </div>`;
  ui.results.querySelectorAll<HTMLCanvasElement>('canvas[data-portrait]').forEach((cv) => {
    renderPortrait(cv, SPECIES_BY_ID[cv.dataset.portrait!], true, 84);
  });
  renderOctopus(ui.results.querySelector<HTMLCanvasElement>('canvas[data-octo]')!, octo.style, octo.mutations, octo.forms, octo.maturity, 132, octo.personality, 1.2, octo.variant);
  const heirEl = ui.results.querySelector<HTMLElement>('[data-bind="heirs"]');
  if (heirEl) renderHeirs(heirEl, octo.forms, save.heirloom);
}

/** Beside the run's biggest sweep: a new record, or how close it came. */
function sweepNote(n: number, prev: number): string {
  if (n > prev && n >= 2) return ' <em>record</em>';
  if (prev > n && prev - n <= 2) return ` <small>record ${prev}</small>`;
  return '';
}


// ------------------------------------------------------------------ field guide

export type GuideTab = 'life' | 'mutations' | 'places' | 'record';

export function renderGuide(ui: Binds, save: SaveData, tab: GuideTab = 'life'): void {
  ui.guideTabs.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) => {
    const on = el.dataset.tab === tab;
    el.classList.toggle('on', on);
    el.setAttribute('aria-selected', String(on));
  });
  ui.guideGrid.hidden = tab !== 'life';
  ui.placesList.hidden = tab === 'life';
  if (tab === 'places') {
    renderPlaces(ui, save);
    return;
  }
  if (tab === 'mutations') {
    renderBody(ui, save);
    return;
  }
  if (tab === 'record') {
    renderRecord(ui, save);
    return;
  }
  const n = countDiscovered(save);
  ui.guideProgress.textContent = `${n} of ${SPECIES.length} species encountered`;
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

/** Every mutation: grown ones with what they do and cost; unknown ones only by category. */
function renderBody(ui: Binds, save: SaveData): void {
  const n = save.mutations.length;
  ui.guideProgress.textContent = `${n} of ${MUTATIONS.length} mutations grown`;
  ui.guideBar.style.width = `${(n / MUTATIONS.length) * 100}%`;
  ui.placesList.innerHTML = MUTATIONS.map((m) => {
    const got = save.mutations.includes(m.id);
    const c = CATEGORY[m.category];
    return `<article class="place ${got ? '' : 'locked'}" style="--c:${got ? c.color : '#33406e'}">
      <div class="place-head"><span class="dot"></span><div><h3>${got ? esc(m.name) : 'Unknown mutation'}</h3><small>${esc(c.name)}${m.requires && got ? ` · grows from ${esc(MUTATIONS_BY_ID[m.requires].name)}` : ''}</small></div></div>
      <p>${got ? `${esc(m.desc)}${m.cost ? ` <span class="cost">${esc(m.cost)}</span>` : ''}` : 'Not yet grown by any octopus. Eat differently, play differently, and it may turn up.'}</p>
      ${got ? `<div class="facts"><span class="chip">${esc(m.look)}</span></div>` : ''}
    </article>`;
  }).join('');
}

/** Personal milestones and the octopus's developing character. */
function renderRecord(ui: Binds, save: SaveData): void {
  const mood = dominant(save.personality);
  ui.guideProgress.textContent = mood ? `Personality · ${PERSONALITIES[mood].name}` : 'Personality still forming';
  const total = PERSONALITY_ORDER.reduce((a, id) => a + save.personality[id], 0) || 1;
  ui.guideBar.style.width = `${Math.min(100, total)}%`;
  const bars = PERSONALITY_ORDER.map((id) => {
    const d = PERSONALITIES[id];
    const v = save.personality[id];
    return `<div class="trait-bar ${mood === id ? 'lead' : ''}" style="--c:${d.color}"><span>${esc(d.name)}</span><i style="width:${Math.round((v / total) * 100)}%"></i><small>${esc(d.line)}</small></div>`;
  }).join('');
  const stat = (label: string, value: string) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
  ui.placesList.innerHTML = `
    <section class="section"><h3>Character</h3><p class="section-note">${mood ? `${esc(PERSONALITIES[mood].line)} ${esc(PERSONALITIES[mood].perk)}` : 'How you play shapes who your octopus becomes. Keep diving.'}</p>${bars}</section>
    <div class="stat-grid">
      ${stat('Deepest dive', save.best.depth > 0 ? meters(save.best.depth) : '0 m')}
      ${stat('Dives', fmt(save.stats.runs))}
      ${stat('Mutations grown', `${save.mutations.length}`)}
      ${stat('Species found', `${countDiscovered(save)}`)}
      ${stat('Eaten', fmt(save.stats.eaten))}
      ${stat('Pearls', fmt(save.stats.pearls))}
      ${stat('Places found', `${Object.keys(save.places).length}`)}
      ${stat('Biggest sweep', `${save.best.sweep}`)}
    </div>`;
}

/** Landmarks and their treasures: found ones with field notes, unfound ones with a hint. */
function renderPlaces(ui: Binds, save: SaveData): void {
  const found = LANDMARKS.filter((l) => save.places[l.id]).length;
  const taken = LANDMARKS.filter((l) => save.treasures[l.treasure]).length;
  ui.guideProgress.textContent = `${found} of ${LANDMARKS.length} places · ${taken} treasures`;
  ui.guideBar.style.width = `${(found / LANDMARKS.length) * 100}%`;
  const enc = (Object.keys(ENCOUNTERS) as (keyof typeof ENCOUNTERS)[])
    .map((id) => {
      const n = save.encounters[id] ?? 0;
      return `<span class="chip ${n ? '' : 'muted'}"><span class="dot" style="--c:${n ? ENCOUNTERS[id].color : '#3a4a7a'}"></span>${n ? `${esc(ENCOUNTERS[id].name)} · ${n} ${n === 1 ? 'dive' : 'dives'}` : 'Not yet witnessed'}</span>`;
    })
    .join('');
  ui.placesList.innerHTML =
    LANDMARKS.map((l) => {
      const at = save.places[l.id];
      const z = ZONES[zoneIndex(l.zone)];
      const tr = TREASURES_BY_ID[l.treasure];
      const got = save.treasures[l.treasure];
      const depth = l.id === 'galleon' ? `${fmt(depthMeters(l.minY))} m` : `${fmt(depthMeters(l.minY))} to ${fmt(depthMeters(l.maxY))} m`;
      return `<article class="place ${at ? '' : 'locked'}" style="--c:${at ? l.color : '#33406e'}">
        <div class="place-head"><span class="dot"></span><div><h3>${at ? esc(l.name) : 'Unknown place'}</h3><small>${esc(z.name)} · ${depth}</small></div></div>
        <p>${at ? esc(l.blurb) : `Field notes: “${esc(l.hint)}”`}</p>
        <div class="facts">
          ${at ? `<span class="chip">Found ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>` : ''}
          <span class="chip ${got ? '' : 'muted'}"><span class="dot" style="--c:${got ? tr.color : '#3a4a7a'}"></span>${got ? `${esc(tr.name)} · ${esc(tr.blurb)}` : at ? `Treasure · ${esc(tr.hint)}` : 'Treasure unknown'}</span>
        </div>
      </article>`;
    }).join('') + `<section class="section"><h3>Rare encounters</h3><div class="facts">${enc}</div></section>`;
}

/** How each way of moving reads in the field notes. */
const BEHAVIOR_NOTE: Record<SpeciesDef['behavior'], string> = {
  drift: 'Drifts with the water',
  dart: 'Holds still, then darts away in a burst',
  school: 'Swims in schools that scatter from a sweep',
  puff: 'Swells up spiny when something big comes close',
  jet: 'Jets away in quick pulses',
  hide: 'Keeps close to coral',
  glide: 'Glides on the currents, never hurrying',
  chain: 'Drifts as a single chain of many bodies',
  lunge: 'Hunts by lunging in a straight line after a warning',
  stalk: 'Follows its prey steadily, and keeps following',
  lure: 'Waits behind a glowing lure',
  ambush: 'Strikes from a hole in the reef',
  pack: 'Hunts in packs that swarm together',
  circle: 'Circles at a distance before it dashes in',
  loom: 'Drifts along the bottom of the Abyss',
  crawl: 'Walks the reef, carrying its shell',
  clam: 'Opens to feed and snaps shut when anything comes close',
  rival: 'Watches you, then inks and jets away',
};

/** What the field notes say about how it behaves, built from its traits. */
function behaviorNotes(def: SpeciesDef): string[] {
  const out = [BEHAVIOR_NOTE[def.behavior]];
  if (def.light === 'drawn') out.push('Drawn to light in dark water');
  if (def.light === 'shy') out.push('Flees from light in dark water');
  if (def.shelters) out.push('Hides behind coral when chased');
  if (def.territory) out.push('Patrols its own patch of water');
  if (def.shell) out.push('Arms can’t take it while it is shut');
  if (def.stings) out.push('Stings anything that touches it');
  if (def.inedible) out.push('Not food');
  if (def.glows) out.push('Bioluminescent');
  return out;
}

/** The depths a species lives at, in meters. */
function depthRange(def: SpeciesDef): string {
  const zs = ZONES.filter((z) => def.zones.includes(z.id));
  const top = depthMeters(Math.min(...zs.map((z) => z.top)));
  const bottom = Math.max(...zs.map((z) => z.bottom));
  return Number.isFinite(bottom) ? `${fmt(top)} to ${fmt(depthMeters(bottom))} m` : `${fmt(top)} m and below`;
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
    ${known && def.role !== 'player' ? `<ul class="notes">${behaviorNotes(def).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="facts">
      ${known ? `<span class="chip">Depth · ${depthRange(def)}</span>` : ''}
      ${known ? `<span class="chip">Habitat · ${esc(habitat(def))}</span>` : ''}
      ${known && rec.firstSeen > 0 && def.role !== 'player' ? `<span class="chip">First seen ${new Date(rec.firstSeen).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>` : ''}
      ${known && def.role !== 'player' ? `<span class="chip">Seen in ${rec.seen} ${rec.seen === 1 ? 'dive' : 'dives'}</span>` : ''}
      ${known && rec.eaten ? `<span class="chip">Eaten ${rec.eaten}</span>` : ''}
      ${known && def.diet ? `<span class="chip"><span class="dot" style="--c:${PATHS[def.diet].color}"></span>${PATHS[def.diet].name} food · ${esc(PATHS[def.diet].tagline.split(': ')[1] ?? '')}</span>` : ''}
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

  const owned = TREASURES.filter((t) => save.treasures[t.id]).length;
  const relics = TREASURES.map((t) => {
    const have = !!save.treasures[t.id];
    const on = save.relics.includes(t.id);
    return `<button class="trait relic ${have ? '' : 'locked'} ${on ? 'selected' : ''}" style="--c:${t.color}" data-action="relic" data-id="${t.id}" ${have ? '' : 'disabled'} aria-pressed="${on}">
      <span class="dot"></span><span>${have ? esc(t.name) : 'Unrecovered treasure'}<small>${have ? esc(t.relic.desc) : esc(t.hint)}</small></span></button>`;
  }).join('');

  ui.lineage.innerHTML = `
    <section class="section"><h3>Relics · carry ${RELIC_SLOTS}</h3><p class="section-note">${owned ? `Treasures you have recovered, ${owned} of ${TREASURES.length}. Each one you carry helps every dive.` : 'Recover a landmark’s treasure and it becomes a relic you can carry into every dive.'}</p>${relics}</section>
    <section class="section forms-section"><h3>Forms · ${worn} of ${FORM_ORDER.length}</h3><p class="section-note">Eat a hunter or a rare creature and part of it grows onto you for the rest of the dive.</p><div class="forms">${forms}</div></section>
    <section class="section"><h3>Challenges</h3><div class="row-list">${challenges}</div></section>
    <div>
      <section class="section"><h3>Starting trait</h3>${traits}</section>
      <section class="section" style="margin-top:16px"><h3>Skin colors</h3><div class="skins">${skins}</div></section>
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
