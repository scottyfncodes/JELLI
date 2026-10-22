# Jelli

**Eat. Grow. Evolve. Discover.** A luminous, mobile-first underwater arcade game for the HaveAnApp portfolio.

You're a thimble-sized moon jelly in Lantern Reef. Eat anything clearly smaller than you, dodge the hunters, evolve along three paths, and fill the Field Guide with 16 species. Runs are endless: you swim until something catches you, and the longer you survive, the bigger and more numerous the hunters get.

## Play

- **Touch:** drag anywhere to steer (floating thumb-stick). Tap ⚡ (or tap with a second finger) to burst.
- **Keyboard:** WASD / arrows to swim, Space to burst, Esc / P to pause, Enter to start.
- Your tentacles do the hunting: swim near anything wearing a cyan ring and an arm reaches out, grabs it and reels it in to eat. Heavy prey can wriggle free, and arms can't reach through coral.
- Red eyes, a `!` and a dashed lunge line warn of a hunter about to strike.

## Features

- **Core loop:** buoyant, pulse-driven movement with momentum. Food grows you, growth reveals bigger prey, and size works both ways: bigger jellies spot more food, but hunters notice them from further away and they can't slip through tight coral gaps.
- **Evolution:** feeding fills an evolution meter. Each time it fills you pick a tier in one of three paths, up to 9 choices (every path maxed):
  - **Glow:** wider light in the dark, pulls in plankton, more rare spawns, a rare-species compass, and hunters notice you later.
  - **Surge:** faster, stronger bursts, riding currents, then two charges and longer tentacle reach while bursting.
  - **Sting:** stuns the first hunter that bites, recharging faster with each tier, then a stinging nova on every burst.
- **World:** one large biome (6000 by 12000 units) with three depth bands (Sunlit Shallows, Twilight Reef, The Abyss). It has darkness falloff, bioluminescence, coral outcrops and reef mounds, eight currents, parallax kelp, light rays and marine snow.
- **Hunters:** six hunting styles. The Needlefin lunges in a straight line, the Gulper Eel stalks, the Lure Angler waits behind its light, the Coral Moray strikes from the reef, Razorfin packs swarm, and the Lanternshark circles before dashing. Every attack is telegraphed.
- **Power-ups:** the Titan Krill and Spark Minnow sparkle with a dashed ring, and the rare fish grant power-ups too:
  - **Titan:** swell bigger, eat larger prey, and hunters flee.
  - **Overcharge:** near-instant burst recharge.
  - **Shell Shield** (Golden Nautilus): blocks one bite.
  - **Prism Frenzy** (Prism Seahorse): double points and food drifts to you.
  - **Aurora Veil** (Aurora Jelly): hunters can't see you.
- **Field Guide:** 21 species across four rarity tiers. Rare encounters depend on conditions: coral in the shallows, the time of night, Glow tier 2, and riding an abyssal current.
- **Lineage:** 12 challenges that unlock 6 bell colors and 3 starting traits.
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
| Simulation | `src/sim/` | `world.ts` (entities, AI, tentacle hunting, spawning, contacts) and `rules.ts` (pure feeding and threat rules). No DOM. |
| Rendering | `src/render/` | Canvas 2D renderer, procedural creature art, pooled particles, and glow sprites (no `shadowBlur`). |
| Progression | `src/core/progress.ts` | Run stats, discoveries, challenges and unlocks. |
| Persistence | `src/persistence/save.ts` | Versioned localStorage save with full sanitizing, plus an in-memory fallback. |
| UI | `src/ui/` | DOM screens over the canvas: title, HUD, pause, evolve, results, Field Guide, Lineage. |
| Orchestration | `src/main.ts` | State machine, loop, input, audio, lifecycle (pause on blur/hide), and resize. |

Stack: Vite + TypeScript + Canvas 2D. There's no game engine, because a hand-rolled loop keeps the bundle around 35 KB gzipped. Fonts (Fraunces, Outfit) are self-hosted via Fontsource. Deployed as a static site on Vercel.
