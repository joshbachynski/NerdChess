---
name: Nerd Chess design decisions
description: Non-obvious game-design rules for the Nerd Chess prototype (client/src/pages/home.tsx)
---

# Nerd Chess — durable design decisions

Frontend-only React prototype (mockup_js stack). Entire game lives in `client/src/pages/home.tsx`; Express on port 5000 is only a static host. State persists to localStorage under key `nerd-chess-state`.

## Movement
- **Free piece movement, no chess rules.** Any piece can move to any active square; pieces may stack. Movement is global (not path-based), so impassable cells never create movement deadlocks — they only remove landing squares.

## Combat (Axis & Allies d6)
- `resolveCombat` outcome matrix, in order:
  1. `defenseSucceeds` (roll ≤ defender def) → **repelled_destroyed**: defender kills attacker.
  2. else `attackSucceeds` (roll ≤ attacker atk) → **capture**.
  3. else (both miss) → **embattled**.
- **Embattled lock:** both pieces lock on the contested square, neither can move, no one else may enter. Clicking the square (`handleEmbattledClick`) re-rolls with the current-turn piece as attacker until a kill resolves it.
- **Win condition is King-only.**

## Themes & board art
- The theme lives IN the board art, NOT as a wallpaper behind it. **Why:** user explicitly rejected the "scene image behind the board" look. Do not reintroduce a full-page scene background.
- 7 themes in `THEMES` (meadow/scifi/city/cavern/dungeon/volcano/void). Each carries `{tile, pageGlow, obstacles, obstacleStyle}`. `tile` is a seamless top-down material texture (`attached_assets/generated_images/tile_*.png`). `DEFAULT_THEME = 'meadow'`.
- **Continuous-texture trick:** each active tile paints a slice of the single texture via `backgroundSize: boardWidth x boardWidth` and `backgroundPosition: -c*squareSize, -r*squareSize`, so one texture maps across the whole 10x10 board (reads as one surface, not per-tile repeats).
- Checker contrast = inset boxShadow tint (white 0.10 on light, black 0.34 on dark), NOT separate colors. Each tile has a ~2px near-black border (grout + outer silhouette edge). Grid container has a `drop-shadow` filter so the board floats on the dark page vignette.
- Page background = dark radial-gradient using theme `pageGlow` accent over near-black.
- Embattled tiles layer an amber inset ring OVER the tint (multi-value box-shadow) so texture stays visible. Amber ring is a game-state indicator, NOT theme-driven.

## Holes, corridors & obstacles
- `punchHoles` (called for ALL boards, ~82% chance): removes 2-5 interior hole clusters (1-3 cells) from interior cells only (≥3 active neighbors), protecting first/last 18 sorted (army rows), never below 40 cells. Holes are inactive/transparent (page bg shows through). **Why:** user wanted boards with holes/corridors, not a solid block. Disconnected islands are acceptable (free movement).
- Enclosed themes (cavern/dungeon/volcano) additionally carve themed hazards via `carveObstacles`: 2-4 clusters of 1-3 cells. Invariants: army rows protected, `active ∩ blocked = ∅`, playable area stays 4-connected (`isConnected` BFS before each carve).
- `generateShape` target raised to 54-69 cells to leave room after holes; armies need 32.
- Blocked/hazard cells render as non-interactive tiles (no drop handlers) so pieces can never be dropped onto or trapped by them.

## Persistence
- `loadSavedState` normalizes on load: drops board pieces / embattled / blocked entries that fall outside the active set, and forces `blocked` disjoint from `active`. **Why:** stale or hand-edited localStorage could otherwise trap a piece on a carved cell. Keep this guard if you change the schema.
- Backward-compat: missing `blocked` → `[]`, invalid/missing `theme` → `DEFAULT_THEME`.
