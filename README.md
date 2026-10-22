# Jelli

**Eat. Grow. Evolve. Discover.** A luminous, mobile-first underwater arcade game for the HaveAnApp portfolio.

You're a thimble-sized moon jelly in Lantern Reef. Eat anything clearly smaller than you, dodge the hunters, evolve along three paths, and fill the Field Guide with 16 species before the night tide turns (3 minutes).

## Play

- **Touch:** drag anywhere to steer (floating thumb-stick). Tap ⚡ (or tap with a second finger) to burst.
- **Keyboard:** WASD / arrows to swim, Space to burst, Esc / P to pause, Enter to start.
- A cyan ring marks creatures you can eat. Red eyes, a `!` and a dashed lunge line warn of a hunter about to strike.

## Features

- **Core loop:** buoyant, pulse-driven movement with momentum. Food grows you, growth reveals bigger prey, and size works both ways: bigger jellies spot more food, but hunters notice them from further away and they can't slip through tight coral gaps.
- **Evolution:** each stage (Drifter, Bloom, Apex) offers a tier in one of three paths:
  - **Glow:** wider light in the dark, pulls in plankton, more rare spawns, a rare-species compass, and hunters notice you later.
  - **Surge:** faster, stronger bursts, riding currents, then two charges and a wider maw while bursting.
  - **Sting:** stuns the first hunter that bites, recharging faster with each tier, then a stinging nova on every burst.
- **World:** one biome with three depth bands (Sunlit Shallows, Twilight Reef, The Abyss). It has darkness falloff, bioluminescence, coral, five currents, parallax kelp, light rays and marine snow.
- **Field Guide:** 16 species across four rarity tiers. Rare encounters depend on conditions: coral in the shallows, the time of night, Glow tier 2, and riding an abyssal current.
- **Lineage:** 11 challenges that unlock 6 bell colors and 3 starting traits.
- **Audio:** synthesized WebAudio ambience and effects, with no audio files. Volume, mute and reduced-motion settings are included.

## Development

```bash
npm install
npm run dev        # local dev server
npm run typecheck
npm run lint
npm test           # vitest: rules, evolution, progression, persistence, world sim
npm run build      # typecheck + production build to dist/
```

Add `?debug` to the URL to expose `window.jelli` for automated playtesting.

## Architecture

| Area | Path | Notes |
| --- | --- | --- |
| Content (data only) | `src/content/` | Species, evolution paths, stages, zones, challenges and unlocks. Balancing lives here. |
| Simulation | `src/sim/` | `world.ts` (entities, AI, spawning, contacts) and `rules.ts` (pure feeding and threat rules). No DOM. |
| Rendering | `src/render/` | Canvas 2D renderer, procedural creature art, pooled particles, and glow sprites (no `shadowBlur`). |
| Progression | `src/core/progress.ts` | Run stats, discoveries, challenges and unlocks. |
| Persistence | `src/persistence/save.ts` | Versioned localStorage save with full sanitizing, plus an in-memory fallback. |
| UI | `src/ui/` | DOM screens over the canvas: title, HUD, pause, evolve, results, Field Guide, Lineage. |
| Orchestration | `src/main.ts` | State machine, loop, input, audio, lifecycle (pause on blur/hide), and resize. |

Stack: Vite + TypeScript + Canvas 2D. There's no game engine, because a hand-rolled loop keeps the bundle around 35 KB gzipped. Fonts (Fraunces, Outfit) are self-hosted via Fontsource. Deployed as a static site on Vercel.
