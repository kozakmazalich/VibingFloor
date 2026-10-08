# Vibing Floor — Project Brief (read this first)

## What this is
A 3D "Don't Fall"-style battle royale in Three.js (no build step) where robots
fight on a shrinking island. Reference game: Steam app 1298830 "Don't Fall".

## Tech stack
- Three.js from CDN via ES-module import map. Plain ES modules. No bundler,
  no TypeScript, no framework.
- Run with a static server: `npx serve .` or `python3 -m http.server 8000`.

## Files
- index.html, style.css
- src/main.js — bootstrap, render loop, camera, HUD
- src/game.js — game logic, input (keys), rounds
- src/robot.js — Robot class, GLB loading, SPACE push ability
- src/island.js, src/tile.js — shrinking island
- src/constants.js, src/audio.js

## Assets
- assets/robot1.glb, assets/robot2.glb — 3D robot meshes.
- assets/robot1_cutout.png, assets/robot2_cutout.png — transparent cutouts.
  These are the SOURCE OF TRUTH for each robot's appearance.
- assets/robot1_texture.png, assets/robot2_texture.png — cropped opaque versions.
- assets/robot1.jpg, assets/robot2.jpg — demo images (ignore).

## Already working (do NOT break)
- 10x10 shrinking island: outer-rim tiles fall over time, shrink inward.
- Player 1 (WASD / arrows) + a CPU AI.
- SPACE push: knockback + cooldown + wave effect.
- Falling / elimination / win overlay / restart (R).

## TODO — finish to a PRESENTABLE state
1. Robots in COLOR: each robot must clearly show its OWN cutout art in color
   and look clean/intentional. No grey, black, or spotted robots. Use the
   cutout textures properly (correct UVs, a clean 3D standee/card, or better
   material). Team-colored rim or ground ring is a nice touch.
2. Two weapons for Player 1 (keep SPACE push too):
   - SPEAR (key E): melee thrust, longer reach, MUCH stronger knockback than SPACE.
   - GRENADE (key G): throw a projectile; on explosion destroy floor tiles in a
     small radius (the tiles under/around the enemy collapse immediately) so the
     enemy falls. Arc + explosion particles + tiles cracking/falling.
3. Graphics polish: lighting, sky/abyss gradient, tile materials, particles
   (tile break, push wave, explosion), subtle camera shake, cleaner HUD.

## Art Direction — Neon Cyberpunk Arena (follow this, do NOT do "default" look)
- Background/abyss: deep navy-black (#0a0a14) with subtle fog gradient; a faint
  glowing grid horizon is a plus.
- Tiles: dark bodies with a glowing neon edge — cyan (#00e5ff) for solid tiles,
  orange/red warning glow when a tile is about to fall.
- Robots: each robot rim-lit with a neon team color (Player = cyan, enemy =
  magenta #ff2d95) + a glowing ground ring under it.
- Lighting: cool ambient + one strong directional; use emissive materials for
  glow (NOT heavy post-processing — no bloom pass on 8GB M1).
- Particles: electric sparks on push, explosion shards + glow on grenade, tile
  break flash.
- HUD: futuristic — monospace/rounded font, glassmorphism panels (translucent
  blur + 1px neon border), neon accents, tabular numbers for score/timer.
- Motion: snappy 150–250ms ease-out; small camera shake on explosions.
- Palette: bg #0a0a14, cyan #00e5ff, magenta #ff2d95, warning #ff5c1a, white text.

## Quality bar
- Reads as a polished indie game demo, not a prototype.
- All controls shown on screen (move, SPACE, E, G, R).
- Target 60fps on an 8GB M1 MacBook Air (fanless): no heavy post-processing,
  modest poly/effect density.

## Definition of done
- Robots colored and clean. Both weapons work. Graphics polished. Controls
  documented on screen. Runs via a static server with no console errors.
