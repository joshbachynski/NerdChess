import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Swords, Shuffle, Volume2, VolumeX, Music, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { playSound, isMuted, toggleMuted, isMusicOn, toggleMusic, initMusicAutoStart } from "@/lib/sounds";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Coin, CoinBurst, type CoinVariant } from "@/components/Coin";
import meadowTile from "@assets/generated_images/tile_meadow.png";
import scifiTile from "@assets/generated_images/tile_scifi.png";
import cityTile from "@assets/generated_images/tile_city.png";
import cavernTile from "@assets/generated_images/tile_cavern.png";
import dungeonTile from "@assets/generated_images/tile_dungeon.png";
import volcanoTile from "@assets/generated_images/tile_volcano.png";
import voidTile from "@assets/generated_images/tile_void.png";

type PieceKind = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type PlayerColor = 'white' | 'black' | 'red' | 'blue';
// A piece on the board is encoded as "{colorCode}{kind}", e.g. 'wK' (white king), 'uQ' (blue queen).
type PieceType = string;
type Square = string; // "row,col"

interface Faction {
  color: PlayerColor;
  code: string;        // single char used in the piece encoding (w/b/r/u)
  label: string;
  finish: 'light' | 'dark'; // which sprite finish the art is based on
  tint?: string;       // optional CSS filter that colorizes the base sprite (red/blue)
  ring: string;        // solid faction color (markers, borders)
  glow: string;        // translucent faction color (piece backplate glow)
}

const FACTIONS: Record<PlayerColor, Faction> = {
  white: { color: 'white', code: 'w', label: 'White', finish: 'light', ring: '#f8fafc', glow: 'rgba(248,250,252,0.55)' },
  black: { color: 'black', code: 'b', label: 'Black', finish: 'dark', ring: '#0f172a', glow: 'rgba(2,6,23,0.6)' },
  red:   { color: 'red',   code: 'r', label: 'Red',   finish: 'light', tint: 'sepia(1) saturate(7) hue-rotate(-50deg) brightness(0.92)', ring: '#ef4444', glow: 'rgba(239,68,68,0.6)' },
  blue:  { color: 'blue',  code: 'u', label: 'Blue',  finish: 'light', tint: 'sepia(1) saturate(6) hue-rotate(185deg) brightness(1)', ring: '#3b82f6', glow: 'rgba(59,130,246,0.62)' },
};

const PLAYER_ORDER: PlayerColor[] = ['white', 'black', 'red', 'blue'];
const CODE_TO_COLOR: Record<string, PlayerColor> = { w: 'white', b: 'black', r: 'red', u: 'blue' };

const pieceColor = (p: PieceType): PlayerColor => CODE_TO_COLOR[p[0]] || 'white';
const pieceKind = (p: PieceType): PieceKind => p[1] as PieceKind;
const makePiece = (color: PlayerColor, kind: PieceKind): PieceType => `${FACTIONS[color].code}${kind}`;

const gridForPlayers = (n: number): number => (n >= 4 ? 16 : n >= 3 ? 14 : 12);

// Which factions still have a King on the board (i.e. are not eliminated).
function colorsWithKing(b: BoardState): Set<PlayerColor> {
  const s = new Set<PlayerColor>();
  for (const pieces of Object.values(b)) {
    for (const p of pieces) if (pieceKind(p) === 'K') s.add(pieceColor(p));
  }
  return s;
}

// The next player to act after `from`, skipping eliminated factions (no King left).
function nextActiveColor(from: PlayerColor, b: BoardState, numPlayers: number): PlayerColor {
  const alive = colorsWithKing(b);
  const order = PLAYER_ORDER.slice(0, numPlayers);
  const idx = order.indexOf(from);
  for (let i = 1; i <= order.length; i++) {
    const cand = order[(idx + i) % order.length];
    if (alive.has(cand)) return cand;
  }
  return from;
}

interface Theme {
  id: string;
  label: string;
  tile: string;         // seamless top-down material texture that paints the board
  pageGlow: string;     // accent color for the dark page vignette
  holeIntensity: number; // 0-1: how often this map type has interior holes/corridors, and how many
}

const THEMES: Theme[] = [
  {
    id: 'meadow', label: 'Fantasy Meadow', tile: meadowTile,
    pageGlow: 'rgba(54, 96, 54, 0.55)', holeIntensity: 0.45,
  },
  {
    id: 'scifi', label: 'Sci-Fi Station', tile: scifiTile,
    pageGlow: 'rgba(28, 86, 128, 0.55)', holeIntensity: 0.9,
  },
  {
    id: 'city', label: 'Night City', tile: cityTile,
    pageGlow: 'rgba(56, 66, 108, 0.5)', holeIntensity: 0.8,
  },
  {
    id: 'cavern', label: 'Crystal Cavern', tile: cavernTile,
    pageGlow: 'rgba(36, 88, 128, 0.55)', holeIntensity: 0.85,
  },
  {
    id: 'dungeon', label: 'Dungeon', tile: dungeonTile,
    pageGlow: 'rgba(78, 68, 48, 0.5)', holeIntensity: 0.9,
  },
  {
    id: 'volcano', label: 'Volcano', tile: volcanoTile,
    pageGlow: 'rgba(140, 56, 18, 0.55)', holeIntensity: 0.75,
  },
  {
    id: 'void', label: 'Deep Void', tile: voidTile,
    pageGlow: 'rgba(78, 48, 118, 0.55)', holeIntensity: 0.7,
  },
];

const DEFAULT_THEME = 'meadow';

interface BoardState {
  [square: string]: PieceType[];
}

interface PlayerScore {
  captured: number;
  defended: number;
}

type ScoreBoard = Record<PlayerColor, PlayerScore>;

type CombatOutcome = 'capture' | 'repelled_destroyed' | 'embattled';

interface CombatResult {
  attacker: PieceType;
  defender: PieceType;
  attackRoll: number;
  defenseRoll: number;
  attackNeeded: number;
  defenseNeeded: number;
  attackerWins: boolean;
  outcome: CombatOutcome;
  from: Square;
  to: Square;
}

const PIECE_STATS: { [key in PieceKind]: { attack: number; defense: number; name: string } } = {
  'P': { attack: 1, defense: 2, name: 'Pawn' },
  'R': { attack: 1, defense: 5, name: 'Rook' },
  'N': { attack: 4, defense: 2, name: 'Knight' },
  'B': { attack: 3, defense: 3, name: 'Bishop' },
  'Q': { attack: 5, defense: 4, name: 'Queen' },
  'K': { attack: 6, defense: 2, name: 'King' },
};

const PIECE_POINT_VALUES: { [key in PieceKind]: number } = {
  'P': 1,
  'N': 3,
  'B': 3,
  'R': 5,
  'Q': 9,
  'K': 20,
};

const emptyScoreBoard = (): ScoreBoard =>
  PLAYER_ORDER.reduce((scores, color) => {
    scores[color] = { captured: 0, defended: 0 };
    return scores;
  }, {} as ScoreBoard);

const normalizeScoreBoard = (raw: unknown): ScoreBoard => {
  const scores = emptyScoreBoard();
  if (!raw || typeof raw !== 'object') return scores;

  for (const color of PLAYER_ORDER) {
    const score = (raw as Partial<Record<PlayerColor, Partial<PlayerScore>>>)[color];
    if (!score || typeof score !== 'object') continue;
    scores[color] = {
      captured: typeof score.captured === 'number' ? score.captured : 0,
      defended: typeof score.defended === 'number' ? score.defended : 0,
    };
  }

  return scores;
};

const addScore = (scores: ScoreBoard, color: PlayerColor, bucket: keyof PlayerScore, points: number): ScoreBoard => ({
  ...scores,
  [color]: {
    ...scores[color],
    [bucket]: scores[color][bucket] + points,
  },
});

const scoreTotal = (score: PlayerScore): number => score.captured + score.defended;

// Back-rank layout shared by every army (mirrored per edge during placement).
const BACK_RANK: PieceKind[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

const DiceIcon = ({ value }: { value: number }) => {
  const icons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
  const Icon = icons[value - 1] || Dice1;
  return <Icon className="w-12 h-12" />;
};

// Themed piece art — each style ships a light army (white) and a dark army (black),
// generated as transparent sprites. Loaded eagerly so urls are available synchronously.
const pieceArt = import.meta.glob('../../../attached_assets/generated_images/piece_*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const pieceUrl = (file: string): string => {
  const hit = Object.entries(pieceArt).find(([k]) => k.endsWith(`/${file}`));
  return hit ? hit[1] : '';
};

interface PieceSet { id: string; label: string; }
const PIECE_SETS: PieceSet[] = [
  { id: 'classic', label: 'Marble' },
  { id: 'mechs', label: 'Mechs' },
  { id: 'beasts', label: 'Beasts' },
  { id: 'crystal', label: 'Crystal' },
  { id: 'gold', label: 'Royal Gold' },
  { id: 'neon', label: 'Neon' },
];
const DEFAULT_SET = 'classic';

const PIECE_KIND_NAME: { [key in PieceKind]: string } = {
  'K': 'king', 'Q': 'queen', 'R': 'rook', 'B': 'bishop', 'N': 'knight', 'P': 'pawn',
};
// Each faction bases its art on a light or dark finish; red/blue add a CSS tint at render time.
const pieceImage = (setId: string, piece: PieceType): string =>
  pieceUrl(`piece_${setId}_${FACTIONS[pieceColor(piece)].finish}_${PIECE_KIND_NAME[pieceKind(piece)]}.png`);

// Grow a random connected blob of squares
function generateShape(gridSize: number, target: number): string[] {
  const active = new Set<string>();
  const startR = Math.floor(gridSize / 2);
  const startC = Math.floor(gridSize / 2);
  active.add(`${startR},${startC}`);

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let guard = 0;

  while (active.size < target && guard < 20000) {
    guard++;
    const cells = Array.from(active);
    const [r, c] = cells[Math.floor(Math.random() * cells.length)].split(',').map(Number);
    const [dr, dc] = dirs[Math.floor(Math.random() * 4)];
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
      active.add(`${nr},${nc}`);
    }
  }

  return Array.from(active);
}

function cellNeighbors(cell: string, gridSize: number): string[] {
  const [r, c] = cell.split(',').map(Number);
  return [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]
    .filter(([nr, nc]) => nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize)
    .map(([nr, nc]) => `${nr},${nc}`);
}

// Is every active cell reachable from every other (4-connectivity)?
function isConnected(activeArr: string[], gridSize: number): boolean {
  if (activeArr.length === 0) return true;
  const set = new Set(activeArr);
  const seen = new Set<string>([activeArr[0]]);
  const stack = [activeArr[0]];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of cellNeighbors(cur, gridSize)) {
      if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  return seen.size === set.size;
}

// Punch interior holes & corridors into the board. A "hole" is simply a missing tile
// (an empty gap with edges) inside the grouping — NOT a special square. `intensity` (0-1)
// controls both how likely a board is to have any holes and how many/how long they are.
function punchHoles(sortedCells: string[], intensity: number, gridSize: number, minCells: number): string[] {
  if (intensity <= 0) return sortedCells;
  // High-intensity map types almost always have holes/corridors; low ones are often solid.
  if (Math.random() > intensity) return sortedCells;

  // Shield every army staging zone: top/bottom (row-sorted) and left/right (col-sorted).
  const byCol = [...sortedCells].sort((a, b) => {
    const [ra, ca] = a.split(',').map(Number);
    const [rb, cb] = b.split(',').map(Number);
    return ca - cb || ra - rb;
  });
  const protectCount = 18;
  const protectedSet = new Set([
    ...sortedCells.slice(0, protectCount),
    ...sortedCells.slice(-protectCount),
    ...byCol.slice(0, protectCount),
    ...byCol.slice(-protectCount),
  ]);
  const active = new Set(sortedCells);
  const numHoles = 1 + Math.floor(Math.random() * (2 + Math.round(intensity * 4))); // ~1-6 by intensity
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const interiorCandidates = () =>
    Array.from(active).filter(
      c => !protectedSet.has(c) && cellNeighbors(c, gridSize).filter(n => active.has(n)).length >= 3
    );

  for (let k = 0; k < numHoles; k++) {
    if (active.size <= minCells) break;
    const cands = interiorCandidates();
    if (!cands.length) break;
    const seed = cands[Math.floor(Math.random() * cands.length)];
    const hole: string[] = [seed];

    // Some gaps are straight corridors/passageways; the rest are small organic blobs.
    const corridor = Math.random() < intensity * 0.6;
    if (corridor) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const len = 3 + Math.floor(Math.random() * 3); // 3-5 cells
      let cur = seed;
      while (hole.length < len) {
        const [r, c] = cur.split(',').map(Number);
        const next = `${r + dr},${c + dc}`;
        if (active.has(next) && !protectedSet.has(next) && !hole.includes(next)) {
          hole.push(next);
          cur = next;
        } else break;
      }
    } else {
      const holeSize = 1 + Math.floor(Math.random() * 3); // 1-3 cells
      const frontier = [seed];
      while (hole.length < holeSize) {
        const from = frontier[Math.floor(Math.random() * frontier.length)];
        const opts = cellNeighbors(from, gridSize).filter(
          n => active.has(n) && !protectedSet.has(n) && !hole.includes(n)
        );
        if (!opts.length) break;
        const pick = opts[Math.floor(Math.random() * opts.length)];
        hole.push(pick);
        frontier.push(pick);
      }
    }

    if (active.size - hole.length >= minCells) {
      hole.forEach(c => active.delete(c));
      // Keep the board as a single connected piece: undo this hole if it split the board.
      if (!isConnected(Array.from(active), gridSize)) {
        hole.forEach(c => active.add(c));
      }
    }
  }

  return Array.from(active);
}

// Place a 16-piece army (back rank then pawns) on the given run of cells.
function placeArmy(board: BoardState, cells16: string[], color: PlayerColor) {
  cells16.forEach((cell, i) => {
    const kind: PieceKind = i < 8 ? BACK_RANK[i] : 'P';
    board[cell] = [makePiece(color, kind)];
  });
}

// Generate a random board shape sized for the player count, with each army on a distinct edge.
function generateBoard(holeIntensity: number, numPlayers: number): { active: string[]; board: BoardState; blocked: string[] } {
  const gridSize = gridForPlayers(numPlayers);
  const byRowCol = (a: string, b: string) => {
    const [ra, ca] = a.split(',').map(Number);
    const [rb, cb] = b.split(',').map(Number);
    return ra - rb || ca - cb;
  };
  const byColRow = (a: string, b: string) => {
    const [ra, ca] = a.split(',').map(Number);
    const [rb, cb] = b.split(',').map(Number);
    return ca - cb || ra - rb;
  };

  // Each extra player beyond two grows the board by 50% squares.
  const factor = 1 + 0.5 * (numPlayers - 2);
  const base = 72 + Math.floor(Math.random() * 21);
  const target = Math.min(Math.round(base * factor), gridSize * gridSize - 4);
  const minCells = numPlayers * 16 + 24;

  let cells = generateShape(gridSize, target);
  cells.sort(byRowCol);
  // Holes & corridors (empty interior gaps, never special tiles) at a theme-appropriate rate.
  cells = punchHoles(cells, holeIntensity, gridSize, minCells);
  cells.sort(byRowCol);

  const board: BoardState = {};
  const used = new Set<string>();
  const take = (sorted: string[]): string[] => {
    const picked: string[] = [];
    for (const c of sorted) {
      if (used.has(c)) continue;
      picked.push(c);
      used.add(c);
      if (picked.length === 16) break;
    }
    return picked;
  };

  const byRow = cells;                      // top -> bottom
  const byRowDesc = [...cells].reverse();   // bottom -> top
  const byCol = [...cells].sort(byColRow);  // left -> right
  const byColDesc = [...byCol].reverse();   // right -> left

  // black=top, white=bottom, red=left, blue=right (each army's back rank hugs its edge).
  placeArmy(board, take(byRow), 'black');
  placeArmy(board, take(byRowDesc), 'white');
  if (numPlayers >= 3) placeArmy(board, take(byCol), 'red');
  if (numPlayers >= 4) placeArmy(board, take(byColDesc), 'blue');

  return { active: cells, board, blocked: [] };
}

// v2: pieces are now 2-char "{code}{kind}" and games can have 2-4 players.
// Old v1 saves (single-char pieces) are simply ignored — no migration.
const STORAGE_KEY = 'nerd-chess-state-v2';
const PIECE_RE = /^[wbru][KQRBNP]$/;

interface SavedState {
  active: string[];
  board: BoardState;
  currentTurn: PlayerColor;
  winner: PlayerColor | null;
  embattled: string[];
  blocked: string[];
  scores: ScoreBoard;
  numPlayers: number;
  theme: string;
  pieceSet: string;
}

function loadSavedState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.active) || !parsed.board || typeof parsed.board !== 'object') return null;
    const activeSet = new Set<string>(parsed.active);
    const numPlayers: number = [2, 3, 4].includes(parsed.numPlayers) ? parsed.numPlayers : 2;
    const validColors = PLAYER_ORDER.slice(0, numPlayers);
    const isColor = (x: unknown): x is PlayerColor => validColors.includes(x as PlayerColor);

    const board: BoardState = {};
    for (const [sq, pieces] of Object.entries(parsed.board as BoardState)) {
      if (activeSet.has(sq) && Array.isArray(pieces) && pieces.every(p => typeof p === 'string' && PIECE_RE.test(p))) {
        board[sq] = pieces;
      }
    }
    return {
      active: parsed.active,
      board,
      currentTurn: isColor(parsed.currentTurn) ? parsed.currentTurn : 'white',
      winner: isColor(parsed.winner) ? parsed.winner : null,
      embattled: (Array.isArray(parsed.embattled) ? parsed.embattled : []).filter((c: string) => activeSet.has(c)),
      blocked: [],
      scores: normalizeScoreBoard(parsed.scores),
      numPlayers,
      theme: THEMES.some(t => t.id === parsed.theme) ? parsed.theme : DEFAULT_THEME,
      pieceSet: PIECE_SETS.some(s => s.id === parsed.pieceSet) ? parsed.pieceSet : DEFAULT_SET,
    };
  } catch {
    // ignore corrupted state
  }
  return null;
}

export default function Home() {
  const [initState] = useState<SavedState>(() => {
    const saved = loadSavedState();
    if (saved) return saved;
    const t = THEMES.find(x => x.id === DEFAULT_THEME) || THEMES[0];
    const g = generateBoard(t.holeIntensity, 2);
    return { active: g.active, board: g.board, currentTurn: 'white', winner: null, embattled: [], blocked: [], scores: emptyScoreBoard(), numPlayers: 2, theme: DEFAULT_THEME, pieceSet: DEFAULT_SET };
  });
  const [activeSquares, setActiveSquares] = useState<string[]>(initState.active);
  const [board, setBoard] = useState<BoardState>(initState.board);
  const [draggedPiece, setDraggedPiece] = useState<{ piece: PieceType; from: Square } | null>(null);
  const [currentTurn, setCurrentTurn] = useState<PlayerColor>(initState.currentTurn);
  const [boardWidth, setBoardWidth] = useState(500);
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [bursts, setBursts] = useState<{ id: number; variant: CoinVariant; value: number }[]>([]);
  const burstIdRef = useRef(0);
  const [winner, setWinner] = useState<PlayerColor | null>(initState.winner);
  const [embattled, setEmbattled] = useState<string[]>(initState.embattled);
  const [scores, setScores] = useState<ScoreBoard>(initState.scores);
  const [numPlayers, setNumPlayers] = useState<number>(initState.numPlayers);
  const [theme, setTheme] = useState<string>(initState.theme);
  const [pieceSet, setPieceSet] = useState<string>(initState.pieceSet);
  const [muted, setMuted] = useState<boolean>(() => isMuted());
  const [musicOn, setMusicOn] = useState<boolean>(() => isMusicOn());
  const combatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-fresh snapshots for use inside delayed combat callbacks
  const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);
  const numPlayersRef = useRef(numPlayers);
  useEffect(() => { numPlayersRef.current = numPlayers; }, [numPlayers]);
  useEffect(() => { initMusicAutoStart(); }, []);

  const gridSize = gridForPlayers(numPlayers);
  const playersInGame = PLAYER_ORDER.slice(0, numPlayers);
  const aliveColors = colorsWithKing(board);
  const activeSet = new Set(activeSquares);
  const embattledSet = new Set(embattled);
  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];

  // Persist game state so a page reload / hot-reload never loses the game
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ active: activeSquares, board, currentTurn, winner, embattled, blocked: [], scores, numPlayers, theme, pieceSet }));
    } catch {
      // ignore storage failures
    }
  }, [activeSquares, board, currentTurn, winner, embattled, scores, numPlayers, theme, pieceSet]);

  useEffect(() => {
    return () => {
      if (combatTimeoutRef.current) clearTimeout(combatTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 640) {
        setBoardWidth(window.innerWidth - 48);
      } else {
        const target = 1120;
        // Container padding is p-4 (16px) / lg:p-8 (32px) per side; account for both sides.
        const pad = window.innerWidth >= 1024 ? 32 : 16;
        // Reserve room on the right for the fixed legend panel (24rem + gap) so the board never slides under it.
        const reserved = 424;
        const maxW = window.innerWidth - reserved - pad * 2;
        const maxH = window.innerHeight - pad * 2;
        setBoardWidth(Math.min(target, maxW, maxH));
      }
    }

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const rollD6 = () => Math.floor(Math.random() * 6) + 1;

  const resolveCombat = (attacker: PieceType, defender: PieceType, from: Square, to: Square): CombatResult => {
    const attackerStats = PIECE_STATS[pieceKind(attacker)];
    const defenderStats = PIECE_STATS[pieceKind(defender)];

    const attackRoll = rollD6();
    const defenseRoll = rollD6();

    const attackSucceeds = attackRoll <= attackerStats.attack;
    // Defender holds purely on its OWN roll (defender wins ties).
    const defenseSucceeds = defenseRoll <= defenderStats.defense;

    // Outcome matrix — a kill (and the end of any battle) happens the moment
    // one side succeeds where it counts:
    //  - defender succeeds            -> defender kills the attacker (destroyed)
    //  - defender fails & attack hits -> attacker kills the defender (capture)
    //  - defender fails & attack miss -> EMBATTLED: nobody dies, both stay
    //    locked on the square and keep fighting until one finally lands a kill.
    let outcome: CombatOutcome;
    if (defenseSucceeds) {
      outcome = 'repelled_destroyed';
    } else if (attackSucceeds) {
      outcome = 'capture';
    } else {
      outcome = 'embattled';
    }

    return {
      attacker,
      defender,
      attackRoll,
      defenseRoll,
      attackNeeded: attackerStats.attack,
      defenseNeeded: defenderStats.defense,
      attackerWins: outcome === 'capture',
      outcome,
      from,
      to,
    };
  };

  const applyCombatResult = useCallback((result: CombatResult) => {
    const newBoard: BoardState = { ...boardRef.current };

    const removeOne = (sq: Square, piece: PieceType) => {
      if (newBoard[sq]) {
        const idx = newBoard[sq].indexOf(piece);
        if (idx > -1) {
          newBoard[sq] = [...newBoard[sq]];
          newBoard[sq].splice(idx, 1);
          if (newBoard[sq].length === 0) delete newBoard[sq];
        }
      }
    };
    const addOne = (sq: Square, piece: PieceType) => {
      if (!newBoard[sq]) newBoard[sq] = [];
      else newBoard[sq] = [...newBoard[sq]];
      newBoard[sq].push(piece);
    };

    if (result.outcome === 'capture') {
      // Defender beaten -> attacker takes the square
      removeOne(result.from, result.attacker);
      removeOne(result.to, result.defender);
      addOne(result.to, result.attacker);
      const capturePts = PIECE_POINT_VALUES[pieceKind(result.defender)];
      setScores(prev => addScore(prev, pieceColor(result.attacker), 'captured', capturePts));
      setBursts(prev => [...prev, { id: ++burstIdRef.current, variant: 'attack', value: capturePts }]);
    } else if (result.outcome === 'repelled_destroyed') {
      // Attacker beaten -> attacker is destroyed
      removeOne(result.from, result.attacker);
      const defendPts = PIECE_POINT_VALUES[pieceKind(result.attacker)];
      setScores(prev => addScore(prev, pieceColor(result.defender), 'defended', defendPts));
      setBursts(prev => [...prev, { id: ++burstIdRef.current, variant: 'defense', value: defendPts }]);
    } else {
      // Embattled: attacker charges in (if not already there); both lock on the square
      if (result.from !== result.to) {
        removeOne(result.from, result.attacker);
        addOne(result.to, result.attacker);
      }
    }

    setBoard(newBoard);

    const attackerColor = pieceColor(result.attacker);

    // A square stays embattled while two or more factions still occupy it.
    if (result.outcome === 'embattled') {
      setEmbattled(prev => prev.includes(result.to) ? prev : [...prev, result.to]);
    } else {
      const remaining = newBoard[result.to] || [];
      const factionsHere = new Set(remaining.map(pieceColor));
      if (factionsHere.size < 2) {
        setEmbattled(prev => prev.filter(s => s !== result.to));
      }
    }

    // Combat-outcome audio: a kill (defender captured or attacker destroyed)
    // plays "death", a stalemate plays the distinct "embattled" sound.
    if (result.outcome === 'embattled') {
      playSound('embattled');
    } else {
      playSound('death');
    }

    // Decide victory & next turn from the post-combat board.
    const alive = colorsWithKing(newBoard);
    if (alive.size <= 1) {
      // Last faction with a King standing wins (fallback to the attacker if a tie somehow occurs).
      setWinner(alive.size === 1 ? Array.from(alive)[0] : attackerColor);
      playSound('win');
    } else {
      setCurrentTurn(nextActiveColor(attackerColor, newBoard, numPlayersRef.current));
    }

    const attackerName = PIECE_STATS[pieceKind(result.attacker)].name;
    const defenderName = PIECE_STATS[pieceKind(result.defender)].name;

    let title: string;
    let description: string;
    if (result.outcome === 'capture') {
      title = `${attackerName} captures ${defenderName}!`;
      description = `Defense roll ${result.defenseRoll} (needed ≤${result.defenseNeeded}) failed.`;
    } else if (result.outcome === 'repelled_destroyed') {
      title = `${defenderName} holds and destroys ${attackerName}!`;
      description = `Defense roll ${result.defenseRoll} (≤${result.defenseNeeded}) succeeded — the attacker is slain.`;
    } else {
      title = `Embattled! ${attackerName} vs ${defenderName}`;
      description = `Neither broke through — both hold the square. Click it to fight on.`;
    }

    toast({ title, description });

    setCombatResult(null);
    setIsAnimating(false);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, square: Square, piece: PieceType) => {
    if (isAnimating || winner) return;
    if (embattled.includes(square)) {
      // Pieces locked in battle cannot move until one kills the other
      e.preventDefault();
      return;
    }
    // An eliminated faction (no King left) is frozen — its leftover pieces can't move.
    if (!colorsWithKing(boardRef.current).has(pieceColor(piece))) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${piece}|${square}`);
    // Give the drag a ghost of only this single piece. Without this, Chromium
    // snapshots the entire filtered board subtree (every piece) as the drag image.
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    e.dataTransfer.setDragImage(el, e.clientX - rect.left, e.clientY - rect.top);
    setDraggedPiece({ piece, from: square });
  }, [isAnimating, winner, embattled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSquare: Square) => {
    e.preventDefault();
    if (isAnimating || winner) return;

    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    const [piece, fromSquare] = data.split('|') as [PieceType, Square];

    if (fromSquare === targetSquare) return;

    if (embattled.includes(targetSquare)) {
      // No piece may enter a square already locked in battle
      toast({
        title: "Square is embattled",
        description: "No piece may enter a square locked in battle.",
      });
      setDraggedPiece(null);
      return;
    }

    const targetPieces = board[targetSquare] || [];
    const enemyPiece = targetPieces.find(p => pieceColor(p) !== pieceColor(piece));

    if (enemyPiece) {
      playSound('attack');
      setIsAnimating(true);
      const result = resolveCombat(piece, enemyPiece, fromSquare, targetSquare);
      setCombatResult(result);
      combatTimeoutRef.current = setTimeout(() => {
        combatTimeoutRef.current = null;
        applyCombatResult(result);
      }, 2000);
    } else {
      playSound('move');
      setBoard(prev => {
        const newBoard = { ...prev };

        if (newBoard[fromSquare]) {
          const pieceIndex = newBoard[fromSquare].indexOf(piece);
          if (pieceIndex > -1) {
            newBoard[fromSquare] = [...newBoard[fromSquare]];
            newBoard[fromSquare].splice(pieceIndex, 1);
            if (newBoard[fromSquare].length === 0) delete newBoard[fromSquare];
          }
        }

        if (!newBoard[targetSquare]) newBoard[targetSquare] = [];
        else newBoard[targetSquare] = [...newBoard[targetSquare]];
        newBoard[targetSquare].push(piece);

        return newBoard;
      });

      // Turn passes to the next faction that still has a King.
      setCurrentTurn(nextActiveColor(pieceColor(piece), boardRef.current, numPlayersRef.current));
    }

    setDraggedPiece(null);
  }, [board, isAnimating, winner, embattled, applyCombatResult]);

  // Resolve an ongoing battle: the current player's locked piece swings at the enemy.
  const handleEmbattledClick = useCallback((square: Square) => {
    if (isAnimating || winner) return;
    if (!embattled.includes(square)) return;

    const pieces = boardRef.current[square] || [];
    // The active faction's piece swings; the first opposing piece defends.
    const attacker = pieces.find(p => pieceColor(p) === currentTurn);
    const defender = pieces.find(p => pieceColor(p) !== currentTurn);
    if (!attacker || !defender) return;

    playSound('attack');
    setIsAnimating(true);
    const result = resolveCombat(attacker, defender, square, square);
    setCombatResult(result);
    combatTimeoutRef.current = setTimeout(() => {
      combatTimeoutRef.current = null;
      applyCombatResult(result);
    }, 2000);
  }, [isAnimating, winner, embattled, currentTurn, applyCombatResult]);

  const handleDragEnd = useCallback(() => {
    setDraggedPiece(null);
  }, []);

  // Start a fresh game on a new board for the given theme & player count.
  const startNewGame = (holeIntensity: number, players: number) => {
    if (combatTimeoutRef.current) {
      clearTimeout(combatTimeoutRef.current);
      combatTimeoutRef.current = null;
    }
    const { active, board: newBoard } = generateBoard(holeIntensity, players);
    setActiveSquares(active);
    setBoard(newBoard);
    setCurrentTurn('white');
    setCombatResult(null);
    setIsAnimating(false);
    setWinner(null);
    setEmbattled([]);
    setScores(emptyScoreBoard());
    setBursts([]);
  };

  const regenerate = () => {
    startNewGame(currentTheme.holeIntensity, numPlayers);
    toast({
      title: "New Battlefield",
      description: "A fresh randomized board has been generated.",
    });
  };

  const applyTheme = (id: string) => {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    setTheme(id);
    startNewGame(t.holeIntensity, numPlayers);
    toast({
      title: t.label,
      description: "A new battlefield rises in this realm.",
    });
  };

  const changePlayers = (n: number) => {
    if (n === numPlayers) return;
    setNumPlayers(n);
    startNewGame(currentTheme.holeIntensity, n);
    toast({
      title: `${n} Players`,
      description: `New ${gridForPlayers(n)}×${gridForPlayers(n)} battlefield for ${n} factions.`,
    });
  };

  const applyPieceSet = (id: string) => {
    setPieceSet(id);
    const s = PIECE_SETS.find(x => x.id === id);
    toast({ title: s ? s.label : 'Pieces', description: 'Army style updated.' });
  };

  const handleToggleMute = () => {
    const nowMuted = toggleMuted();
    setMuted(nowMuted);
    if (!nowMuted) playSound('move'); // brief cue that sound is back on
  };

  const handleToggleMusic = () => {
    setMusicOn(toggleMusic());
  };

  const squareSize = boardWidth / gridSize;

  // Thick black outline only on edges that face a "no-go" cell (a hole or off-grid),
  // never between two playable cells — so the board silhouette and holes read strongly
  // while the interior stays clean. Implemented as inset shadows so tiles stay aligned.
  const EDGE = Math.max(5, Math.round(squareSize * 0.09));
  const isLand = (rr: number, cc: number) =>
    rr >= 0 && rr < gridSize && cc >= 0 && cc < gridSize &&
    activeSet.has(`${rr},${cc}`);
  const edgeShadows = (r: number, c: number): string[] => {
    const parts: string[] = [];
    if (!isLand(r - 1, c)) parts.push(`inset 0 ${EDGE}px 0 0 #000`);
    if (!isLand(r + 1, c)) parts.push(`inset 0 -${EDGE}px 0 0 #000`);
    if (!isLand(r, c - 1)) parts.push(`inset ${EDGE}px 0 0 0 #000`);
    if (!isLand(r, c + 1)) parts.push(`inset -${EDGE}px 0 0 0 #000`);
    return parts;
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 lg:p-8 relative overflow-hidden"
      style={{
        background: `radial-gradient(circle at 50% 20%, ${currentTheme.pageGlow}, #2b2f37 62%)`,
      }}
    >

      {/* Victory Modal */}
      {winner && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <Card className="glass-card p-10 text-white border-white/10 max-w-md w-full mx-4 text-center animate-in zoom-in-95 duration-300">
            <div className="relative w-28 h-28 mx-auto mb-4">
              <div className="absolute inset-0" style={{ background: `radial-gradient(circle, ${FACTIONS[winner].glow}, transparent 70%)` }} />
              <img
                src={pieceImage(pieceSet, makePiece(winner, 'K'))}
                alt="King"
                className="relative w-full h-full object-contain"
                style={{ filter: [FACTIONS[winner].tint, 'drop-shadow(0 4px 12px rgba(0,0,0,0.7))'].filter(Boolean).join(' ') }}
              />
            </div>
            <h2 className="text-4xl font-display font-bold mb-2">
              {FACTIONS[winner].label} Wins!
            </h2>
            <p className="text-white/60 mb-8">
              The enemy King has fallen. Victory is decided.
            </p>
            <Button
              onClick={regenerate}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-semibold"
              data-testid="button-play-again"
            >
              <Shuffle className="w-4 h-4 mr-2" />
              Play Again
            </Button>
          </Card>
        </div>
      )}

      {/* Reward burst — celebratory coin animation when points are scored */}
      {bursts.length > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
          data-testid="coin-burst-overlay"
        >
          {bursts.map((b) => (
            <CoinBurst
              key={b.id}
              variant={b.variant}
              value={b.value}
              size={150}
              onDone={() => setBursts((prev) => prev.filter((x) => x.id !== b.id))}
            />
          ))}
        </div>
      )}

      {/* Combat Modal */}
      {combatResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <Card className="glass-card p-8 text-white border-white/10 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-display font-bold text-center mb-6">Combat!</h2>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-center">
                <img src={pieceImage(pieceSet, combatResult.attacker)} alt={PIECE_STATS[pieceKind(combatResult.attacker)].name} className="w-20 h-20 mx-auto mb-2 object-contain" style={{ filter: [FACTIONS[pieceColor(combatResult.attacker)].tint, 'drop-shadow(0 3px 8px rgba(0,0,0,0.7))'].filter(Boolean).join(' ') }} />
                <div className="text-sm text-white/60 mb-2">{FACTIONS[pieceColor(combatResult.attacker)].label} {PIECE_STATS[pieceKind(combatResult.attacker)].name}</div>
                <div className="text-xs text-white/40 mb-3">Attack: ≤{combatResult.attackNeeded}</div>
                <div className={`inline-flex items-center justify-center p-2 rounded-lg ${
                  combatResult.attackRoll <= combatResult.attackNeeded ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  <DiceIcon value={combatResult.attackRoll} />
                </div>
                <div className="text-sm mt-2">
                  {combatResult.attackRoll <= combatResult.attackNeeded ? '✓ Hit!' : '✗ Miss'}
                </div>
              </div>

              <div className="text-4xl text-white/30">⚔️</div>

              <div className="flex-1 text-center">
                <img src={pieceImage(pieceSet, combatResult.defender)} alt={PIECE_STATS[pieceKind(combatResult.defender)].name} className="w-20 h-20 mx-auto mb-2 object-contain" style={{ filter: [FACTIONS[pieceColor(combatResult.defender)].tint, 'drop-shadow(0 3px 8px rgba(0,0,0,0.7))'].filter(Boolean).join(' ') }} />
                <div className="text-sm text-white/60 mb-2">{FACTIONS[pieceColor(combatResult.defender)].label} {PIECE_STATS[pieceKind(combatResult.defender)].name}</div>
                <div className="text-xs text-white/40 mb-3">Defense: ≤{combatResult.defenseNeeded}</div>
                <div className={`inline-flex items-center justify-center p-2 rounded-lg ${
                  combatResult.defenseRoll <= combatResult.defenseNeeded ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  <DiceIcon value={combatResult.defenseRoll} />
                </div>
                <div className="text-sm mt-2">
                  {combatResult.defenseRoll <= combatResult.defenseNeeded ? '✓ Blocked!' : '✗ Failed'}
                </div>
              </div>
            </div>

            <div className={`mt-6 text-center text-xl font-bold ${
              combatResult.outcome === 'capture'
                ? 'text-red-400'
                : combatResult.outcome === 'embattled'
                  ? 'text-amber-400'
                  : 'text-green-400'
            }`}>
              {combatResult.outcome === 'capture'
                ? `${PIECE_STATS[pieceKind(combatResult.attacker)].name} captures!`
                : combatResult.outcome === 'repelled_destroyed'
                  ? `${PIECE_STATS[pieceKind(combatResult.defender)].name} holds & destroys the attacker!`
                  : `Embattled! Both lock the square — fight on.`}
            </div>
          </Card>
        </div>
      )}

      <div className="relative z-10 w-full flex items-center justify-start">

        {/* Game Info Panel (legend) — fixed in the top-right corner, capped to viewport height */}
        <div className="fixed top-2 right-2 z-40 w-[24rem]">
          <Card className="glass-card p-4 space-y-4 text-white border-white/10 max-h-[calc(100vh-1rem)] overflow-y-auto">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h1 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
                  Nerd Chess
                </h1>
                <div className="shrink-0 mt-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleToggleMusic}
                    title={musicOn ? 'Turn off background music' : 'Turn on background music'}
                    aria-label={musicOn ? 'Turn off background music' : 'Turn on background music'}
                    aria-pressed={musicOn}
                    data-testid="button-music-toggle"
                    className={`p-2 rounded-lg border transition-all ${
                      musicOn
                        ? 'border-white/20 bg-white/15 text-white'
                        : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Music className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                    aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                    aria-pressed={muted}
                    data-testid="button-mute-toggle"
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all"
                  >
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-white/60 font-light text-sm">
                Dice combat on a randomized battlefield
              </p>
            </div>

            <div className="py-4 border-y border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-white/60 font-semibold uppercase tracking-wider text-xs">
                <Swords className="w-3.5 h-3.5" /> Turn
              </div>
              <div className="grid grid-cols-2 gap-2">
                {playersInGame.map((color, i) => {
                  const eliminated = !aliveColors.has(color);
                  const isTurn = currentTurn === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCurrentTurn(color)}
                      disabled={eliminated}
                      title={`Set turn to ${FACTIONS[color].label}`}
                      data-testid={`button-turn-${color}`}
                      className={`relative p-3 rounded-xl text-left transition-all duration-300 ${isTurn ? 'ring-2 ring-white/40' : 'bg-white/5 hover:bg-white/10'} ${eliminated ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                      style={isTurn ? { background: FACTIONS[color].glow, boxShadow: `0 0 20px ${FACTIONS[color].glow}` } : undefined}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: FACTIONS[color].ring, boxShadow: '0 0 0 1px rgba(255,255,255,0.45)' }} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${eliminated ? 'line-through' : ''}`}>{FACTIONS[color].label}</span>
                      </div>
                      <div className="font-mono text-sm">{eliminated ? 'Eliminated' : `Player ${i + 1}`}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-white/60 font-semibold uppercase tracking-wider text-xs">
                <span className="flex items-center -space-x-1">
                  <Coin variant="attack" size={18} animated={false} />
                  <Coin variant="defense" size={18} animated={false} />
                </span>
                Points
              </div>
              <div className="grid grid-cols-2 gap-2">
                {playersInGame.map((color) => {
                  const score = scores[color];
                  const eliminated = !aliveColors.has(color);
                  return (
                    <div
                      key={color}
                      className={`rounded-lg border p-2 bg-white/5 transition-all ${currentTurn === color ? 'border-white/30 bg-white/10' : 'border-white/10'} ${eliminated ? 'opacity-50' : ''}`}
                      data-testid={`score-card-${color}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FACTIONS[color].ring, boxShadow: '0 0 0 1px rgba(255,255,255,0.45)' }} />
                          <span className="truncate text-xs font-bold uppercase tracking-wider">{FACTIONS[color].label}</span>
                        </div>
                        <div className="font-mono text-lg font-bold text-white" data-testid={`score-total-${color}`}>
                          {scoreTotal(score)}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px] text-white/50">
                        <div className="flex items-center gap-1" data-testid={`score-captured-${color}`}>
                          <Coin variant="attack" value={score.captured} size={30} animated={false} />
                          <span>Took</span>
                        </div>
                        <div className="flex items-center gap-1" data-testid={`score-defended-${color}`}>
                          <Coin variant="defense" value={score.defended} size={30} animated={false} />
                          <span>Defend</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-white/60 font-semibold uppercase tracking-wider">Piece Stats (Atk/Def/Pts)</div>
              <div className="grid grid-cols-2 gap-1 text-white/50">
                <span>Pawn: 1/2/1</span>
                <span>Rook: 1/5/5</span>
                <span>Knight: 4/2/3</span>
                <span>Bishop: 3/3/3</span>
                <span>Queen: 5/4/9</span>
                <span>King: 6/2/20</span>
              </div>
              <div className="text-white/40 text-xs mt-2">
                Roll ≤ stat on d6 to succeed. Defender wins ties.
              </div>
              <div className="text-amber-400/70 text-xs mt-1">
                ⚔️ Embattled: if neither breaks through, both lock the square. Click it to fight on — no one moves in or out until one dies.
              </div>
            </div>

            <div className="space-y-2">
              <Button
                onClick={regenerate}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-semibold"
                data-testid="button-new-shape"
              >
                <Shuffle className="w-4 h-4 mr-2" />
                New Random Shape
              </Button>
              <Button
                onClick={regenerate}
                variant="outline"
                className="w-full bg-white/5 border-white/10 hover:bg-white/10 hover:text-white transition-all"
                data-testid="button-reset"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Board
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-white/60 font-semibold uppercase tracking-wider text-xs">Players</div>
              <div className="grid grid-cols-3 gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => changePlayers(n)}
                    className={`h-10 rounded-lg border text-sm font-semibold transition-all ${
                      numPlayers === n ? 'border-amber-400 ring-2 ring-amber-400/50 bg-white/10 text-white' : 'border-white/10 hover:border-white/40 bg-white/5 text-white/60'
                    }`}
                    data-testid={`button-players-${n}`}
                  >
                    {n}P
                  </button>
                ))}
              </div>
              <div className="text-white/40 text-[11px]">{numPlayers} factions · {gridSize}×{gridSize} board</div>
            </div>

            <div className="space-y-2">
              <div className="text-white/60 font-semibold uppercase tracking-wider text-xs">Realm</div>
              <div className="grid grid-cols-2 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTheme(t.id)}
                    className={`relative h-12 rounded-lg overflow-hidden border text-xs font-semibold transition-all ${
                      theme === t.id ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-white/10 hover:border-white/40'
                    }`}
                    style={{
                      backgroundImage: `url(${t.tile})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    data-testid={`button-theme-${t.id}`}
                  >
                    <span className="absolute inset-0 bg-black/45" />
                    <span className="relative z-10 flex h-full items-center justify-center px-1 text-center leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-white/60 font-semibold uppercase tracking-wider text-xs">Pieces</div>
              <div className="grid grid-cols-3 gap-2">
                {PIECE_SETS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => applyPieceSet(s.id)}
                    className={`relative flex flex-col items-center justify-end gap-1 h-20 rounded-lg overflow-hidden border p-1 bg-black/40 transition-all ${
                      pieceSet === s.id ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-white/10 hover:border-white/40'
                    }`}
                    data-testid={`button-pieceset-${s.id}`}
                  >
                    <img
                      src={pieceImage(s.id, makePiece('white', 'K'))}
                      alt={s.label}
                      className="h-12 w-12 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]"
                    />
                    <span className="text-[10px] font-semibold leading-tight text-white text-center">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Chess Board */}
        <div
          className="relative"
          style={{ width: boardWidth, height: boardWidth }}
          data-testid="chessboard"
        >
          <div
            className="grid w-full h-full"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
              gridTemplateRows: `repeat(${gridSize}, 1fr)`,
              filter: 'drop-shadow(0 16px 20px rgba(0,0,0,0.85)) drop-shadow(0 2px 3px rgba(0,0,0,0.9))',
            }}
          >
            {Array.from({ length: gridSize }).map((_, r) =>
              Array.from({ length: gridSize }).map((_, c) => {
                const square = `${r},${c}`;
                const isActive = activeSet.has(square);

                if (!isActive) {
                  return <div key={square} style={{ width: squareSize, height: squareSize }} />;
                }

                const pieces = board[square] || [];
                const isLight = (r + c) % 2 === 0;
                const isEmbattled = embattledSet.has(square);
                const tint = isLight
                  ? 'inset 0 0 0 9999px rgba(255,255,255,0.06)'
                  : 'inset 0 0 0 9999px rgba(0,0,0,0.42)';
                const boxShadow = [
                  ...(isEmbattled ? ['inset 0 0 0 3px rgba(251,191,36,0.95)'] : []),
                  tint,
                  ...edgeShadows(r, c),
                ].join(', ');

                return (
                  <div
                    key={square}
                    className={`relative flex items-center justify-center select-none overflow-hidden ${isEmbattled ? 'cursor-pointer animate-pulse z-20' : ''} ${draggedPiece && !isEmbattled ? 'cursor-pointer' : ''}`}
                    style={{
                      width: squareSize,
                      height: squareSize,
                      backgroundImage: `url(${currentTheme.tile})`,
                      backgroundSize: `${boardWidth}px ${boardWidth}px`,
                      backgroundPosition: `${-c * squareSize}px ${-r * squareSize}px`,
                      boxShadow,
                    }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, square)}
                    onClick={isEmbattled ? () => handleEmbattledClick(square) : undefined}
                    data-testid={`square-${square}`}
                  >
                    {isEmbattled && (
                      <div
                        className="absolute top-0 left-0 z-30 pointer-events-none"
                        style={{ fontSize: squareSize * 0.28, lineHeight: 1 }}
                        data-testid={`badge-embattled-${square}`}
                      >
                        ⚔️
                      </div>
                    )}
                    {pieces.map((piece, index) => (
                      <Tooltip key={`${piece}-${index}`}>
                        <TooltipTrigger asChild>
                          <div
                            draggable={!isAnimating && !winner && !isEmbattled}
                            onDragStart={(e) => handleDragStart(e, square, piece)}
                            onDragEnd={handleDragEnd}
                            className={`absolute inset-0 m-auto flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform hover:scale-110 ${isAnimating ? 'pointer-events-none' : ''}`}
                            style={{
                              width: squareSize * 0.92,
                              height: squareSize * 0.92,
                              zIndex: 10 + index,
                              transform: pieces.length > 1 ? `translate(${index * 4}px, ${index * -4}px)` : undefined,
                            }}
                            data-testid={`piece-${square}-${index}`}
                          >
                            <div
                              className="absolute inset-0 m-auto pointer-events-none"
                              style={{
                                width: '80%',
                                height: '80%',
                                borderRadius: '9999px',
                                background: `radial-gradient(circle, ${FACTIONS[pieceColor(piece)].glow}, transparent 66%)`,
                              }}
                            />
                            <img
                              src={pieceImage(pieceSet, piece)}
                              alt={PIECE_STATS[pieceKind(piece)].name}
                              draggable={false}
                              className="relative w-full h-full object-contain pointer-events-none select-none"
                              style={{ filter: [FACTIONS[pieceColor(piece)].tint, 'drop-shadow(0 3px 5px rgba(0,0,0,0.85))'].filter(Boolean).join(' ') }}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent data-testid={`tooltip-piece-${square}-${index}`}>
                          {`${FACTIONS[pieceColor(piece)].label} ${PIECE_STATS[pieceKind(piece)].name}`}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
