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

## Themes & obstacles
- 7 themes in `THEMES` (meadow/scifi/city/cavern/dungeon/volcano/void). Each carries tile tint colors (light/dark rgba), overlay class, `obstacles` flag, `obstacleStyle`. `DEFAULT_THEME = 'meadow'`.
- Enclosed themes (cavern/dungeon/volcano) carve impassable interior cells via `carveObstacles`: 2-4 clusters of 1-3 cells. **Invariants that must hold:** army rows protected (first/last 18 sorted cells), `active ∩ blocked = ∅`, and the playable area stays 4-connected (`isConnected` BFS checked before committing each carve).
- Blocked cells render as non-interactive hazard tiles (no drop handlers) so pieces can never be dropped onto or trapped by them.
- The embattled ring stays amber — it is a game-state indicator, NOT theme-driven.

## Persistence
- `loadSavedState` normalizes on load: drops board pieces / embattled / blocked entries that fall outside the active set, and forces `blocked` disjoint from `active`. **Why:** stale or hand-edited localStorage could otherwise trap a piece on a carved cell. Keep this guard if you change the schema.
- Backward-compat: missing `blocked` → `[]`, invalid/missing `theme` → `DEFAULT_THEME`.
