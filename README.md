# SQUIDO

**You begin as a tiny octopus. What you become is up to you.** A mobile-first underwater evolution and survival game for the HaveAnApp portfolio.

Eat, grow, explore, evolve, adapt, survive. A hatchling octopus no bigger than a thumbnail sets out into an ocean with no floor. Fill the growth meter by eating and exploring, choose how its body changes, and discover the character it grows into.

## Brand

SQUIDO was called Jelli until the octopus became its star. The wordmark is HTML and CSS (`wordmark()` in `src/ui/screens.ts`): Fraunces at its heaviest with the SOFT axis turned up, letters set slightly out of line, a tentacle curling off the Q, and an O that is an eye which blinks and glances about. The icon (`public/icon.svg`, with PNGs rendered from it) is the octopus itself. Coral is for the octopus and anything you press; turquoise is for life and light.

**Art direction.** The interface lives in the water: deep ocean ink surfaces lit along their top edge, a row of suckers crowning each panel, buttons that squish and spring back, and a reef underfoot on the title and results screens. The reef silhouettes (`src/assets/reef-back.svg`, `src/assets/reef-front.svg`), the share card (`public/og-card.jpg`) and the icon PNGs were made with GITCRAFT: modelled and unioned in VectorCraft, resized and exported in PhotoCraft.

Some identifiers keep the old name on purpose, because changing them would lose players' data or break continuity: the save key `jelli.save.v1`, the player species id `moon-jelli`, and the analytics app id `jelli`.

## The octopus

- **Somebody in particular:** every octopus hatches with a name, a generation in its line ("Meet Olive · Generation 4"), and looks of its own from a seed: where its spots fall, its eye size, head shape, iris color and freckles. When a dive ends, the next generation is ready to hatch.
- **Eight living arms:** each arm is a physics chain that trails, curls and drags through turns and jets. Arms that hunt are solved with inverse kinematics (FABRIK) so their tips land on prey, pearls and glow pods, and when the octopus is still an arm reaches out to feel the nearest rock.
- **A face:** big eyes with horizontal pupils that follow food, the catch, or a hunter about to strike; blinks, idle glances, a happy squint after a meal, wide starry-eyed wonder (with arms flared) at a new species, place or treasure, narrowed eyes while hunting, wide eyes and blanched skin in a fright.
- **Evolution:** each time the growth meter fills, the world pauses and three mutations are offered, each drawn on your own octopus. 18 mutations across movement, hunting, defense, senses and specialization: Jet Siphon, Twin Jet, Webbed Arms, Long Arms, Strong or Hooked Suckers (pick one), Crushing Beak, Ink Sac, Venom, Blue Rings, Chromatophores, Regrowth, Keen Eyes, Feeler Skin, Bioluminescence, Deep Body, Abyssal Heart and Gigantism. Most carry a real cost, and every one changes how the octopus looks. What you have been eating leads the offer.
- **Depth is earned:** below the Twilight Drop the water presses back. A Deep Body opens two more biomes; an Abyssal Heart opens everything below.
- **Personality:** never chosen. Hunting makes it bold, hiding cautious, exploring curious, pods, pearls and currents playful, treasures and clams resourceful. Once one trait clearly leads, the octopus says so, idles and moves differently, gains a small edge, and is offered more of the mutations that suit it. It carries across dives and slowly shifts if you play differently.
- **The ecosystem:** prey that flees, schools, darts behind coral or swims toward your light; hermit crabs that hide in their shells; clams that snap shut (and hold pearls); rival octopuses that ink and vanish; sea nettles that sting anything that brushes them; hunters that lunge, stalk, ambush, circle and patrol; and gentle giants.
- **Journal:** Life (every species, with depth, habitat, behavior and records), Body (every mutation grown), Places (landmarks, treasures and rare encounters) and Record (personality and milestones).

## Play

- **Touch:** drag anywhere to steer (floating thumb-stick). Tap a creature, pearl or glow pod to lash an arm at it. Tap Jet (or tap with a second finger) to jet. Tap a card to evolve.
- **Keyboard and mouse:** WASD / arrows to swim, click to lash, Space to jet, 1 to 3 to pick a mutation, Esc / P to pause, Enter to start.
- Your tentacles do the hunting: swim past anything wearing a cyan ring and a trailing arm snags it and reels it in. Every meal makes the arms a little longer. Heavy prey can wriggle free, and arms can't reach through coral.
- **Sweep:** every burst flings all your arms out as a net. Everything edible in the fan ahead of you for that instant is snagged at once and reeled in together, and the score climbs with the square of the haul. Aim the burst through a school before it scatters. The catch: the burst you sweep with is the burst you'd escape with.
- Red eyes, a `!` and a dashed lunge line warn of a hunter about to strike.

## The ocean

- **Art direction:** every biome has its own color language and its own geology, drawn in layers: distant formations (softened like a camera's depth of field), midground structures, the reef you swim through, and near silhouettes that frame the view. Sunlit turquoise shallows with coral heads, kelp, light shafts and caustics rippling over the reef; cobalt glow gardens of tube-coral towers and anemones; indigo twilight of basalt pillars and drifting giants; jade-lit ruins with colonnades and a stone face; the Abyss's trench walls, black smokers and tube worms; and the crystal spires of the Hadal Dream. The darkness is a light mask: the octopus's glow, every bioluminescent creature, glow pods, vents and brief flashes all light their surroundings.
- **Tentacles:** arms snag nearby prey on their own, pluck pearls within reach, and lash out when you tap something: an aimed strike from nearly twice as far, twice as fast, for fast prey, pearls in the reef and glow pods. Out of reach shows where the arm stopped.
- **Living creatures:** schools scatter, shrimp dart behind coral where arms can't reach, krill, comb jellies and mirror squid are drawn to your light in the dark while glass squid flee it, and needlefins and lanternsharks patrol their own patch of water. The Lantern Whale, a gentle giant, sometimes crosses the upper ocean.
- **Exploration:** glow pods lend their light (enough to reveal the Phantom), kelp thickets and anemone beds hide you from hunters, hydrothermal vents throw you upward, and seven landmarks each guard a treasure: the Sunken Galleon, the Kelp Cathedral, the Lantern Grove (light three of its pods), the Whale Fall (slip inside the ribs), the Drowned Gate (swim through it), the Vent Field (reach the roots of the tallest smoker) and the Crystal Heart. Landmarks move between dives; chevrons at the screen edge glint when one is near.
- **Relics:** every treasure you recover becomes a relic. Carry two into each dive from Lineage: a longer or faster lash, more light, pearls drifting to you, better current riding, a quicker burst, or places glinting from further away.
- **Adaptive quality:** if a device can't keep its frame rate, the foreground layer and caustics step down first, then the farthest scenery layer.
- **Rare encounters:** a bioluminescent bloom that lights the water, a great migrating school, and the Lantern Whale.
- **Field Guide:** species with depth ranges, habitat, behavior notes and first-seen dates, plus a Places tab with every landmark, its treasure and the rare encounters you have witnessed.

## Features

- **The descent:** depth is the score, in meters that follow the real ocean (sunlit to 200 m, hadal from 6,000 m). Swimming down is quicker than climbing back up, an idle octopus sinks, and a jet straight down plunges further. The camera keeps the octopus high on the screen so you see what's below. Below the Twilight Drop the body needs a Deep Body to go on. Hunters spawn bigger the deeper you go (and a little bigger the longer you linger anywhere), so the core decision is when to stop feeding and dive.
- **Six biomes, each with its own rules:**
  - **Sunlit Shallows** (0 to 200 m): bright, safe, food everywhere. Feed up.
  - **Glow Gardens** (to 1,000 m): the dark begins and the reef glows; prey gathers in swarms twice the usual size, the best sweeping in the ocean.
  - **Twilight Drop** (to 2,000 m): down-currents pour straight into the dark. Ride them to plunge fast (Riptide helps), with gulpers and lanternsharks around them.
  - **Forgotten Depths** (to 4,000 m): carved stone ruins with tight passages only a small octopus fits through, morays in the stones, and giants passing far off in the dark.
  - **The Abyss** (to 6,000 m): near-total dark, anglers, the Starchain and the Phantom. Your light is everything.
  - **The Hadal Dream** (6,000 m and below, endless): the water turns red, the snow falls upward, crystals grow instead of reef, and Choir Fry, Mirror Squid and the Hollow Eel live here. Hunters keep growing the deeper you go, so there is always a depth that is too much.
- **Anticipation:** distant lights glow in the color of the biome below before you reach it, giant silhouettes cross the deep, and the depth strip under your depth readout keeps unvisited biomes dark.
- **Records:** your deepest dive is drawn across the water as a gold line; passing it lights up "New record". The title screen shows your deepest dive and biome.
- **Run end:** results lead with the depth you reached and how close you came to your record, then why you died (a burst you had ready, a hunter twice your size, or a dark you couldn't see in), the biomes you passed through, and a glimpse of the next unvisited biome.

- **Core loop:** buoyant, pulse-driven movement with momentum. Food grows you, growth reveals bigger prey, and size works both ways: bigger octopuses spot more food, but hunters notice them from further away and they can't slip through tight coral gaps.
- **Learning from a run:** the results screen leads with why the run ended (a burst you had ready, or one you'd just spent on a sweep) and your biggest sweep against your record.
- **Catch chains:** catches within 3 seconds of each other build a chain worth up to 3x score, with a rising chime and a draining meter. Pearls keep a chain alive.
- **Treasure:** pearls rest all over the reef (hoards around reef mounds, strays in open water, glowing in the deep). A sunken pirate ship sits in the shallows with a chest worth 1,500 that spills more pearls. Pearls bank across dives.
- **Chase your best:** your best score sits under the clock, and passing it mid-run gets its own moment.
- **You are what you eat:** most prey belong to a kind of food (glowing prey to Glow, quick prey to Swift, spiny prey and hunters to Spiny; plain krill to none). The growth meter fills in those colors, and the kind you ate most leads the next mutation offer. Up to 9 mutations a dive. Eating also grows the octopus through four sizes: Hatchling, Juvenile, Adult and Giant.
- **Forms:** eating a hunter or a rare creature grows part of it onto your octopus for the rest of the dive, each with a visible change and a small ability. Razor Fringe (Razorfin) adds an arm, Needle Crown (Needlefin) flings bursts further, Moray Mottle (Coral Moray) reaches through coral, Lantern Belt (Lanternshark) widens your light, Angler Lure (Lure Angler) draws prey in, Gulper Maw (Gulper Eel, only edible while swollen with Titan) feeds you more, Prism Skin (Prism Seahorse) stretches chains, Gilded Spiral (Golden Nautilus) pulls in pearls, and Aurora Curtain (Aurora Jelly) hides you from hunters.
- **Lineage:** when a dive ends you pick one form to pass on, and the next octopus hatches wearing it (it shows on the title screen too). Every form ever worn is collected in Lineage, with field notes for the ones still unknown.
- **The Phantom:** a colossal jelly that drifts through the deep Abyss. Without enough light you only glimpse its rim lights in the dark (logged in the Journal as "Glimpsed"); with a light of 440 or more (Keen Eyes and Bioluminescence, or Keen Eyes plus a Lantern Belt, a glow pod or a Lantern Seed) you see it and discover it.
- **Still out there:** the results screen shows the octopus you became, then one thing still to find: something glimpsed, a hunter you met but never ate, or a Journal hint.
- **World:** a 3,000-unit-wide shaft with no floor, generated in bands as you sink: reef walls, outcrops and mounds, pearls, and each biome's currents.
- **Hunters:** six hunting styles. The Needlefin lunges in a straight line, the Gulper Eel stalks, the Lure Angler waits behind its light, the Coral Moray strikes from the reef, Razorfin packs swarm, and the Lanternshark circles before dashing. Every attack is telegraphed.
- **Power-ups:** the Titan Krill and Spark Minnow sparkle with a dashed ring, and the rare fish grant power-ups too:
  - **Titan:** swell bigger, eat larger prey, and hunters flee.
  - **Overcharge:** near-instant burst recharge.
  - **Shell Shield** (Golden Nautilus): blocks one bite.
  - **Prism Frenzy** (Prism Seahorse): double points and food drifts to you.
  - **Aurora Veil** (Aurora Jelly): hunters can't see you.
- **Field Guide:** 27 species across four rarity tiers, each showing which path it feeds and, once worn, the form it gives. Rare encounters depend on conditions: coral in the shallows, the time of night, Glow tier 2, riding a current through the ruins, and diving deep into the Abyss.
- **Challenges:** 22 challenges that unlock 10 bell colors and 3 starting traits, including chains, pearls, the pirate's gold, forms and the Phantom.
- **Audio:** synthesized WebAudio ambience and effects, with no audio files: bubbles in the shallows, distant calls in the deep, and their own sounds for the lash, glow pods, places, treasures, blooms and the whale. Volume, mute and reduced-motion settings are included.

## Development

```bash
npm install
npm run dev        # local dev server
npm run typecheck
npm run lint
npm test           # vitest: rules, evolution, progression, persistence, world sim
npm run build      # typecheck + production build to dist/
```

Add `?debug` to the URL to expose `window.squido` (also `window.jelli`, for older scripts) for automated playtesting.

## Architecture

| Area | Path | Notes |
| --- | --- | --- |
| Content (data only) | `src/content/` | Species (with diet paths and behaviors), instinct paths, forms, stages, zones, landmarks, treasures, encounters, challenges and unlocks. Balancing lives here. |
| Simulation | `src/sim/` | `world.ts` (entities, AI, tentacle hunting, spawning, contacts) and `rules.ts` (pure feeding and threat rules). No DOM. |
| Rendering | `src/render/` | Canvas 2D renderer, biome palettes (`biomeArt.ts`), layered parallax scenery and caustics (`backdrop.ts`), features and landmarks (`places.ts`), procedural creature art, pooled particles, and glow sprites (no `shadowBlur`). |
| Progression | `src/core/progress.ts` | Run stats, discoveries, forms, glimpses, challenges, unlocks and the end-of-run mystery. |
| Persistence | `src/persistence/save.ts` | Versioned localStorage save with full sanitizing, plus an in-memory fallback. |
| UI | `src/ui/` | DOM screens over the canvas: title, HUD, pause, results, Field Guide, Lineage. |
| Orchestration | `src/main.ts` | State machine, loop, input, audio, lifecycle (pause on blur/hide), and resize. |

Stack: Vite + TypeScript + Canvas 2D. There's no game engine, because a hand-rolled loop keeps the bundle around 35 KB gzipped. Fonts (Fraunces, Outfit) are self-hosted via Fontsource. Deployed as a static site on Vercel.

## Analytics

`index.html` loads the HaveAnApp Pulse snippet, which counts page views and two events from `src/core/analytics.ts`: `game_start` and `game_complete` (with the stage and depth reached). It uses no cookies and sends no personal data. To tell new players from returning ones, it keeps one random id for this game in the browser's local storage (key `pulse:rid:jelli`, replaced every 90 days, never shared with other HaveAnApp apps). Pulse stores only a hash of it. Global Privacy Control, Do Not Track or `?pulse=ignore` stop collection and delete the id; `?pulse=forget` deletes the id alone. Ids from visitors in the EU/EEA, UK or Switzerland are discarded by Pulse. Visits from `localhost` are ignored. To leave your own device out of the counts, open the game once with `?pulse=ignore` on the address.
