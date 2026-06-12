---
name: Nerd Chess design decisions
description: Non-obvious game-design rules for the Nerd Chess prototype (client/src/pages/home.tsx)
---

# Nerd Chess — durable design decisions

Frontend-only React prototype (mockup_js stack). Entire game lives in `client/src/pages/home.tsx`; Express on port 5000 is only a static host. State persists to localStorage under key `nerd-chess-state-v2` (the `-v2` suffix was bumped when the 2-char faction piece encoding landed, so legacy single-char saves are discarded rather than migrated).

## Players & factions (2 / 3 / 4)
- Supports 2, 3, or 4 players, chosen via the Players selector. `numPlayers` is persisted and validated to {2,3,4}.
- Pieces are encoded as 2-char strings `"{code}{kind}"`: codes `w/b/r/u` (white/black/red/blue), kinds `K/Q/R/B/N/P`. Helpers: `pieceColor`/`pieceKind`/`makePiece`; `PIECE_RE = /^[wbru][KQRBNP]$/`. **Why 'u' for blue:** 'b' was already taken by black.
- `FACTIONS` config holds per-color `{code,label,finish,tint,ring,glow}`. `PLAYER_ORDER = [white?,...]` defines turn rotation.
- **Board grows 50% per extra player** (user requirement): target cells = base × (1 + 0.5·(numPlayers−2)) → 3p ≈ ×1.5, 4p ≈ ×2. Grid side scales too via `gridForPlayers(n)` = 12/14/16. `minCells = numPlayers·16 + 24` guarantees room for every army.
- **Army placement is per-edge** so factions start apart: black=top, white=bottom, red=left, blue=right. A shared `used` set in the `take()` helper guarantees the four 16-piece armies never overlap; `placeArmy` runs AFTER `punchHoles` so pieces only ever land on active cells.
- **Red & blue reuse the existing `light` sprite art with a CSS tint filter** (sepia/saturate/hue-rotate) — there are NO red/blue sprite PNGs. Only white(light)+black(dark) art exists; do not assume colored assets. Each faction also gets a soft `glow` backplate behind its pieces.

## Movement
- **Free piece movement, no chess rules.** Any piece can move to any active square; pieces may stack. Movement is global (not path-based), so impassable cells never create movement deadlocks — they only remove landing squares.

## Combat (Axis & Allies d6)
- `resolveCombat` outcome matrix, in order:
  1. `defenseSucceeds` (roll ≤ defender def) → **repelled_destroyed**: defender kills attacker.
  2. else `attackSucceeds` (roll ≤ attacker atk) → **capture**.
  3. else (both miss) → **embattled**.
- **Embattled lock:** both pieces lock on the contested square, neither can move, no one else may enter. Clicking the square (`handleEmbattledClick`) re-rolls with the current-turn faction's piece as attacker until a kill resolves it. (Known minor edge case: a square embattled between two factions, neither of which currently holds the turn, is unclickable until the turn marker reaches one of them; manual turn buttons are the workaround.)
- **Win = last faction with a King.** `colorsWithKing(board)` lists surviving factions; `nextActiveColor(from, board, n)` skips eliminated factions when advancing the turn and cannot infinite-loop (only called when ≥2 factions remain). An eliminated faction's pieces are frozen (`handleDragStart` guard) and its turn button is disabled.

## Themes & board art
- The theme lives IN the board art, NOT as a wallpaper behind it. **Why:** user explicitly rejected the "scene image behind the board" look. Do not reintroduce a full-page scene background.
- 7 themes in `THEMES` (meadow/scifi/city/cavern/dungeon/volcano/void). Each carries `{tile, pageGlow, holeIntensity}`. `tile` is a seamless top-down material texture (`attached_assets/generated_images/tile_*.png`). `DEFAULT_THEME = 'meadow'`. **Note:** the old `obstacles`/`obstacleStyle` theme fields AND `carveObstacles` are fully DELETED (not just dead) — hazard/special tiles are permanently retired, do not reintroduce.
- **Continuous-texture trick:** each active tile paints a slice of the single texture via `backgroundSize: boardWidth x boardWidth` and `backgroundPosition: -c*squareSize, -r*squareSize`, so one texture maps across the whole 10x10 board (reads as one surface, not per-tile repeats).
- Checker contrast = inset boxShadow tint (white 0.10 on light, black 0.34 on dark), NOT separate colors. Each tile has a ~2px near-black border (grout + outer silhouette edge). Grid container has a `drop-shadow` filter so the board floats on the dark page vignette.
- Page background = dark radial-gradient using theme `pageGlow` accent over near-black.
- Embattled tiles layer an amber inset ring OVER the tint (multi-value box-shadow) so texture stays visible. Amber ring is a game-state indicator, NOT theme-driven.

## Piece art (themed sprite sets)
- Pieces are AI-generated transparent PNG sprites, NOT Unicode glyphs. 6 styles in `PIECE_SETS` (classic/mechs/beasts/crystal/gold/neon), each with a light army (white) + dark army (black) × 6 types = 72 files at `attached_assets/generated_images/piece_{style}_{light|dark}_{type}.png` (type = king/queen/rook/bishop/knight/pawn).
- Loaded via `import.meta.glob('../../../attached_assets/generated_images/piece_*.png', {eager,import:'default'})` → `pieceUrl(file)` matches by filename suffix. `pieceImage(setId, piece)` maps the faction `finish` (white→light, black→dark; red & blue also use `light`) + kind→`PIECE_TYPE_NAME`. **Why glob:** 72 static imports would be unmanageable; glob auto-picks up new sprite files. **Gotcha:** `pieceImage` expects a full 2-char piece code — passing a bare kind like `'K'` yields an empty src (the piece-set selector preview must call `pieceImage(setId, makePiece('white','K'))`).
- `pieceSet` is persisted in localStorage alongside `theme` (validated in `loadSavedState`, `DEFAULT_SET='classic'`). Switching sets (`applyPieceSet`) does NOT regenerate the board — only swaps art.
- Generation prompt recipe (in case of regen): "<piece form>, rendered as a <style base>, <color finish>. Single isolated game piece, centered, upright front view... plain flat solid light gray background" + `removeBackground:true`. The flat gray bg makes background removal clean (corners come out alpha 0).

## Drag & drop source element
- The draggable DnD source MUST be a `<div>` wrapper, NOT the `<img>` itself. Making an `<img>` the drag source breaks the custom HTML5 drag/drop (native image dragging hijacks it) — pieces become unmovable. Keep the piece `<img>` as `draggable={false}` + `pointer-events-none` inside a draggable `<div>` that carries `onDragStart`/`onDragEnd`/`draggable`. **Why:** a regression where pieces couldn't be moved was caused exactly by putting handlers on the img.

## Board shape: holes & corridors, per-theme
- Interior holes/corridors ARE wanted. A "hole" = a missing tile (empty gap, page bg shows through, 4 black edges via `edgeShadows`), NOT a special square. The user's earlier "no uninhabitable interior squares" meant no SPECIAL carved tiles — so `carveObstacles` (themed hazard tiles) is now DELETED entirely, but `punchHoles` is ON. `fillInteriorHoles` was DELETED (it was wrongly erasing the holes).
- `punchHoles(cells, intensity)` is driven by per-theme `Theme.holeIntensity` (0-1). `if (Math.random() > intensity) return solid` → high-intensity themes almost always have holes; low ones often solid. `numHoles ~1-6` scales with intensity. Each gap is either a straight CORRIDOR (prob `intensity*0.6`, 3-5 cells in one cardinal direction) or a small blob (1-3 cells).
- Current `holeIntensity`: meadow 0.45, void 0.7, volcano 0.75, city 0.8, cavern 0.85, scifi 0.9, dungeon 0.9. **Why these:** corridors/caves/streets make topographic sense for sci-fi/dungeon/cavern/city, less so for an open meadow.
- `generateBoard(holeIntensity, numPlayers)`. Connectivity invariant still holds: punchHoles reverts any hole that disconnects the tile set (`isConnected`). It now protects all FOUR staging edges (first/last of both row-sorted AND col-sorted lists) so no army's start cells get carved away, and never drops below `minCells = numPlayers·16 + 24`.
- Grid side is dynamic: `gridForPlayers(n)` = 12/14/16 for 2/3/4 players (was a fixed GRID_SIZE=12). `generateShape(gridSize, target)`; base target 72-92 cells, scaled ×(1+0.5·(n−2)) per the board-growth rule, capped at `gridSize²−4`. Verified: 1500 randomized gens across 2/3/4p all stay connected with exactly 16 pieces+1 king per faction, no overlap, in-bounds.

## Layout
- Board is the focus and flush-left: board wrapper uses `justify-start` (not `justify-center`).
- Legend/info panel is a `fixed top-2 right-2 w-[22rem]` Card (NO transform scale). It is capped to the viewport with `max-h-[calc(100vh-1rem)] overflow-y-auto` so it never exceeds the screen (Pieces section scrolls). Spacing is `p-4 space-y-4`.
- `boardWidth` resize calc (desktop branch) = `min(1120, innerW - reserved - pad*2, innerH - pad*2)` where `pad = innerW>=1024 ? 32 : 16` (matches `p-4`/`lg:p-8` per side) and `reserved = 392` (legend 22rem + gap). **Why:** must subtract BOTH container padding sides (root is `overflow-hidden`, else board clips) AND reserve legend width on the right (else flush-left board slides under the fixed legend).

## Persistence
- Key is `nerd-chess-state-v2`. `loadSavedState` normalizes on load: drops board pieces / embattled entries outside the active set; validates each piece against `PIECE_RE`; validates `numPlayers`∈{2,3,4}, and `currentTurn`/`winner` against the factions that are actually in play. The `blocked` concept is GONE (not just forced empty) — special hazard tiles are fully retired.
- Backward-compat: invalid/missing `theme` → `DEFAULT_THEME`, invalid/missing `pieceSet` → `DEFAULT_SET`; corrupted JSON is caught and falls back to a fresh board.
