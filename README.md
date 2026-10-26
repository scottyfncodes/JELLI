# Jelli

**How deep can you go?** A luminous, mobile-first underwater descent game for the HaveAnApp portfolio.

You're a thimble-sized moon jelly at the top of an ocean with no floor. Sink through six biomes, each stranger than the last: eat, dodge and grow enough to survive the next one. Depth in meters is your score, your record is drawn across the water, and the next biome below is always a dark band on your depth strip until some Jelli reaches it.

## Play

- **Touch:** drag anywhere to steer (floating thumb-stick). Tap ⚡ (or tap with a second finger) to burst.
- **Keyboard:** WASD / arrows to swim, Space to burst, Esc / P to pause, Enter to start.
- Your tentacles do the hunting: swim past anything wearing a cyan ring and a trailing arm snags it and reels it in. Every meal makes the arms a little longer. Heavy prey can wriggle free, and arms can't reach through coral.
- **Sweep:** every burst flings all your arms out as a net. Everything edible in the fan ahead of you for that instant is snagged at once and reeled in together, and the score climbs with the square of the haul. Aim the burst through a school before it scatters. The catch: the burst you sweep with is the burst you'd escape with.
- Red eyes, a `!` and a dashed lunge line warn of a hunter about to strike.

## Features

- **The descent:** depth is the score, in meters that follow the real ocean (sunlit to 200 m, hadal from 6,000 m). Swimming down is quicker than climbing back up, an idle jelly sinks, and a burst straight down plunges further. The camera keeps the jelly high on the screen so you see what's below. Hunters spawn bigger the deeper you go (and a little bigger the longer you linger anywhere), so the core decision is when to stop feeding and dive.
- **Six biomes, each with its own rules:**
  - **Sunlit Shallows** (0 to 200 m): bright, safe, food everywhere. Feed up.
  - **Glow Gardens** (to 1,000 m): the dark begins and the reef glows; prey gathers in swarms twice the usual size, the best sweeping in the ocean.
  - **Twilight Drop** (to 2,000 m): down-currents pour straight into the dark. Ride them to plunge fast (Riptide helps), with gulpers and lanternsharks around them.
  - **Forgotten Depths** (to 4,000 m): carved stone ruins with tight passages only a small jelly fits through, morays in the stones, and giants passing far off in the dark.
  - **The Abyss** (to 6,000 m): near-total dark, anglers, the Starchain and the Phantom. Your light is everything.
  - **The Hadal Dream** (6,000 m and below, endless): the water turns red, the snow falls upward, crystals grow instead of reef, and Choir Fry, Mirror Squid and the Hollow Eel live here. Hunters keep growing the deeper you go, so there is always a depth that is too much.
- **Anticipation:** distant lights glow in the color of the biome below before you reach it, giant silhouettes cross the deep, and the depth strip under your depth readout keeps unvisited biomes dark.
- **Records:** your deepest dive is drawn across the water as a gold line; passing it lights up "New record". The title screen shows your deepest dive and biome.
- **Run end:** results lead with the depth you reached and how close you came to your record, then why you died (a burst you had ready, a hunter twice your size, or a dark you couldn't see in), the biomes you passed through, and a glimpse of the next unvisited biome.

- **Core loop:** buoyant, pulse-driven movement with momentum. Food grows you, growth reveals bigger prey, and size works both ways: bigger jellies spot more food, but hunters notice them from further away and they can't slip through tight coral gaps.
- **Learning from a run:** the results screen leads with why the run ended (a burst you had ready, or one you'd just spent on a sweep) and your biggest sweep against your record.
- **Catch chains:** catches within 3 seconds of each other build a chain worth up to 3x score, with a rising chime and a draining meter. Pearls keep a chain alive.
- **Treasure:** pearls rest all over the reef (hoards around reef mounds, strays in open water, glowing in the deep). A sunken pirate ship sits in the shallows with a chest worth 1,500 that spills more pearls. Pearls bank across dives.
- **Chase your best:** your best score sits under the clock, and passing it mid-run gets its own moment.
- **Feeding shapes the body:** the more Jelli eats in a run, the more its body develops. The bell domes higher with finer scallops, more and longer tentacles sprout, radial and ring canals branch through the bell, the gonads fill in, and the oral arms grow long and ruffled. Each meal briefly swells the bell and glows through it in the prey's color.
- **You are what you eat:** most prey belong to a path (glowing prey to Glow, quick prey to Surge, spiny prey and hunters to Sting; plain krill to none). The evolution meter fills in those colors as you eat, the leading path's icon lights up, and when the meter is full Jelli evolves along whichever path it ate most of, right there in the water with no menu. Up to 9 evolutions (every path maxed):
  - **Glow:** wider light in the dark, pulls in plankton, more rare spawns, a rare-species compass, and hunters notice you later.
  - **Surge:** faster, stronger bursts, riding currents, then two charges and longer tentacle reach while bursting.
  - **Sting:** stuns the first hunter that bites, recharging faster with each tier, then a stinging nova on every burst.
- **Forms:** eating a hunter or a rare creature grows part of it onto Jelli for the rest of the dive, each with a visible change and a small ability. Razor Fringe (Razorfin) adds an arm, Needle Crown (Needlefin) flings bursts further, Moray Mottle (Coral Moray) reaches through coral, Lantern Belt (Lanternshark) widens your light, Angler Lure (Lure Angler) draws prey in, Gulper Maw (Gulper Eel, only edible while swollen with Titan) feeds you more, Prism Bell (Prism Seahorse) stretches chains, Gilded Spiral (Golden Nautilus) pulls in pearls, and Aurora Curtain (Aurora Jelly) hides you from hunters.
- **Lineage:** when a dive ends you pick one form to pass on, and the next Jelli hatches wearing it (it shows on the title screen too). Every form ever worn is collected in Lineage, with field notes for the ones still unknown.
- **The Phantom:** a colossal jelly that drifts through the deep Abyss. Without enough light you only glimpse its rim lights in the dark (logged in the Field Guide as "Glimpsed"); with a light of 440 or more (Glow 2, or Glow 1 plus a Lantern Belt) you see it and discover it.
- **Still out there:** the results screen shows the Jelli you became, then one thing still to find: something glimpsed, a hunter you met but never ate, or a Field Guide hint.
- **World:** a 3,000-unit-wide shaft with no floor, generated in bands as you sink: reef walls, outcrops and mounds, pearls, and each biome's currents.
- **Hunters:** six hunting styles. The Needlefin lunges in a straight line, the Gulper Eel stalks, the Lure Angler waits behind its light, the Coral Moray strikes from the reef, Razorfin packs swarm, and the Lanternshark circles before dashing. Every attack is telegraphed.
- **Power-ups:** the Titan Krill and Spark Minnow sparkle with a dashed ring, and the rare fish grant power-ups too:
  - **Titan:** swell bigger, eat larger prey, and hunters flee.
  - **Overcharge:** near-instant burst recharge.
  - **Shell Shield** (Golden Nautilus): blocks one bite.
  - **Prism Frenzy** (Prism Seahorse): double points and food drifts to you.
  - **Aurora Veil** (Aurora Jelly): hunters can't see you.
- **Field Guide:** 25 species across four rarity tiers, each showing which path it feeds and, once worn, the form it gives. Rare encounters depend on conditions: coral in the shallows, the time of night, Glow tier 2, riding a current through the ruins, and diving deep into the Abyss.
- **Challenges:** 19 challenges that unlock 10 bell colors and 3 starting traits, including chains, pearls, the pirate's gold, forms and the Phantom.
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
| Content (data only) | `src/content/` | Species (with diet paths), evolution paths, forms, stages, zones, challenges and unlocks. Balancing lives here. |
| Simulation | `src/sim/` | `world.ts` (entities, AI, tentacle hunting, spawning, contacts) and `rules.ts` (pure feeding and threat rules). No DOM. |
| Rendering | `src/render/` | Canvas 2D renderer, procedural creature art, pooled particles, and glow sprites (no `shadowBlur`). |
| Progression | `src/core/progress.ts` | Run stats, discoveries, forms, glimpses, challenges, unlocks and the end-of-run mystery. |
| Persistence | `src/persistence/save.ts` | Versioned localStorage save with full sanitizing, plus an in-memory fallback. |
| UI | `src/ui/` | DOM screens over the canvas: title, HUD, pause, results, Field Guide, Lineage. |
| Orchestration | `src/main.ts` | State machine, loop, input, audio, lifecycle (pause on blur/hide), and resize. |

Stack: Vite + TypeScript + Canvas 2D. There's no game engine, because a hand-rolled loop keeps the bundle around 35 KB gzipped. Fonts (Fraunces, Outfit) are self-hosted via Fontsource. Deployed as a static site on Vercel.

## Analytics

`index.html` loads the HaveAnApp Pulse snippet, which counts page views and two events from `src/core/analytics.ts`: `game_start` and `game_complete` (with the stage and depth reached). It uses no cookies, stores nothing on the device, and sends no personal data. Visits from `localhost` are ignored. To leave your own device out of the counts, open the game once with `?pulse=ignore` on the address.
