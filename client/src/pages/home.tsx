import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Swords, Shuffle, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import meadowTile from "@assets/generated_images/tile_meadow.png";
import scifiTile from "@assets/generated_images/tile_scifi.png";
import cityTile from "@assets/generated_images/tile_city.png";
import cavernTile from "@assets/generated_images/tile_cavern.png";
import dungeonTile from "@assets/generated_images/tile_dungeon.png";
import volcanoTile from "@assets/generated_images/tile_volcano.png";
import voidTile from "@assets/generated_images/tile_void.png";
import type { CSSProperties } from "react";

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
type Square = string; // "row,col"

interface Theme {
  id: string;
  label: string;
  tile: string;         // seamless top-down material texture that paints the board
  pageGlow: string;     // accent color for the dark page vignette
  obstacles: boolean;   // carve themed impassable hazard cells
  obstacleStyle: CSSProperties; // how a hazard cell looks
  holeIntensity: number; // 0-1: how often this map type has interior holes/corridors, and how many
}

const THEMES: Theme[] = [
  {
    id: 'meadow', label: 'Fantasy Meadow', tile: meadowTile,
    pageGlow: 'rgba(54, 96, 54, 0.55)', obstacles: false, obstacleStyle: {}, holeIntensity: 0.45,
  },
  {
    id: 'scifi', label: 'Sci-Fi Station', tile: scifiTile,
    pageGlow: 'rgba(28, 86, 128, 0.55)', obstacles: false, obstacleStyle: {}, holeIntensity: 0.9,
  },
  {
    id: 'city', label: 'Night City', tile: cityTile,
    pageGlow: 'rgba(56, 66, 108, 0.5)', obstacles: false, obstacleStyle: {}, holeIntensity: 0.8,
  },
  {
    id: 'cavern', label: 'Crystal Cavern', tile: cavernTile,
    pageGlow: 'rgba(36, 88, 128, 0.55)', obstacles: true, holeIntensity: 0.85,
    obstacleStyle: {
      background: 'radial-gradient(circle at 50% 45%, rgba(60, 150, 190, 0.85), rgba(8, 26, 44, 0.96))',
      boxShadow: 'inset 0 0 14px rgba(60, 170, 200, 0.6)',
    },
  },
  {
    id: 'dungeon', label: 'Dungeon', tile: dungeonTile,
    pageGlow: 'rgba(78, 68, 48, 0.5)', obstacles: true, holeIntensity: 0.9,
    obstacleStyle: {
      background: 'radial-gradient(circle at 50% 45%, rgba(12, 12, 16, 0.95), rgba(0, 0, 0, 0.98))',
      boxShadow: 'inset 0 0 16px rgba(0, 0, 0, 0.95)',
    },
  },
  {
    id: 'volcano', label: 'Volcano', tile: volcanoTile,
    pageGlow: 'rgba(140, 56, 18, 0.55)', obstacles: true, holeIntensity: 0.75,
    obstacleStyle: {
      background: 'radial-gradient(circle at 50% 45%, rgba(255, 150, 40, 0.95), rgba(150, 30, 10, 0.96))',
      boxShadow: 'inset 0 0 16px rgba(255, 90, 0, 0.9)',
    },
  },
  {
    id: 'void', label: 'Deep Void', tile: voidTile,
    pageGlow: 'rgba(78, 48, 118, 0.55)', obstacles: false, obstacleStyle: {}, holeIntensity: 0.7,
  },
];

const DEFAULT_THEME = 'meadow';

interface BoardState {
  [square: string]: PieceType[];
}

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

const PIECE_STATS: { [key: string]: { attack: number; defense: number; name: string } } = {
  'P': { attack: 1, defense: 2, name: 'Pawn' },
  'p': { attack: 1, defense: 2, name: 'Pawn' },
  'R': { attack: 1, defense: 5, name: 'Rook' },
  'r': { attack: 1, defense: 5, name: 'Rook' },
  'N': { attack: 4, defense: 2, name: 'Knight' },
  'n': { attack: 4, defense: 2, name: 'Knight' },
  'B': { attack: 3, defense: 3, name: 'Bishop' },
  'b': { attack: 3, defense: 3, name: 'Bishop' },
  'Q': { attack: 5, defense: 4, name: 'Queen' },
  'q': { attack: 5, defense: 4, name: 'Queen' },
  'K': { attack: 6, defense: 2, name: 'King' },
  'k': { attack: 6, defense: 2, name: 'King' },
};

const PIECE_UNICODE: { [key in PieceType]: string } = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
};

const GRID_SIZE = 12;

const BLACK_BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const WHITE_BACK: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

const DiceIcon = ({ value }: { value: number }) => {
  const icons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
  const Icon = icons[value - 1] || Dice1;
  return <Icon className="w-12 h-12" />;
};

const isWhitePiece = (piece: PieceType) => piece === piece.toUpperCase();

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

const PIECE_TYPE_NAME: { [key in PieceType]: string } = {
  'K': 'king', 'Q': 'queen', 'R': 'rook', 'B': 'bishop', 'N': 'knight', 'P': 'pawn',
  'k': 'king', 'q': 'queen', 'r': 'rook', 'b': 'bishop', 'n': 'knight', 'p': 'pawn',
};
// White pieces wear the "light" finish, black pieces the "dark" finish.
const pieceImage = (setId: string, piece: PieceType): string =>
  pieceUrl(`piece_${setId}_${isWhitePiece(piece) ? 'light' : 'dark'}_${PIECE_TYPE_NAME[piece]}.png`);

// Grow a random connected blob of squares
function generateShape(): string[] {
  const active = new Set<string>();
  const startR = Math.floor(GRID_SIZE / 2);
  const startC = Math.floor(GRID_SIZE / 2);
  active.add(`${startR},${startC}`);

  const target = 72 + Math.floor(Math.random() * 21); // 72-92 cells (solid organic blob)
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let guard = 0;

  while (active.size < target && guard < 8000) {
    guard++;
    const cells = Array.from(active);
    const [r, c] = cells[Math.floor(Math.random() * cells.length)].split(',').map(Number);
    const [dr, dc] = dirs[Math.floor(Math.random() * 4)];
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
      active.add(`${nr},${nc}`);
    }
  }

  return Array.from(active);
}

function cellNeighbors(cell: string): string[] {
  const [r, c] = cell.split(',').map(Number);
  return [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]
    .filter(([nr, nc]) => nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE)
    .map(([nr, nc]) => `${nr},${nc}`);
}

// Is every active cell reachable from every other (4-connectivity)?
function isConnected(activeArr: string[]): boolean {
  if (activeArr.length === 0) return true;
  const set = new Set(activeArr);
  const seen = new Set<string>([activeArr[0]]);
  const stack = [activeArr[0]];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of cellNeighbors(cur)) {
      if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  return seen.size === set.size;
}

// Carve a few impassable interior clusters (lava pits / chasms) while keeping
// the playable area connected and the army rows intact.
function carveObstacles(sortedCells: string[]): { active: string[]; blocked: string[] } {
  const protectCount = 18; // keep top & bottom army cells (16 each) + buffer
  const protectedSet = new Set([
    ...sortedCells.slice(0, protectCount),
    ...sortedCells.slice(-protectCount),
  ]);
  const candidates = sortedCells.filter(c => !protectedSet.has(c));
  if (candidates.length < 6) return { active: sortedCells, blocked: [] };

  const active = new Set(sortedCells);
  const blocked = new Set<string>();
  const numClusters = 2 + Math.floor(Math.random() * 3); // 2-4 clusters

  for (let k = 0; k < numClusters; k++) {
    const avail = candidates.filter(c => active.has(c) && !blocked.has(c));
    if (!avail.length) break;
    const seed = avail[Math.floor(Math.random() * avail.length)];
    const clusterSize = 1 + Math.floor(Math.random() * 3); // 1-3 cells
    const cluster: string[] = [seed];
    const frontier = [seed];
    while (cluster.length < clusterSize) {
      const from = frontier[Math.floor(Math.random() * frontier.length)];
      const opts = cellNeighbors(from).filter(
        n => active.has(n) && !blocked.has(n) && !protectedSet.has(n) && !cluster.includes(n)
      );
      if (!opts.length) break;
      const pick = opts[Math.floor(Math.random() * opts.length)];
      cluster.push(pick);
      frontier.push(pick);
    }
    const trial = new Set(active);
    cluster.forEach(c => trial.delete(c));
    if (isConnected(Array.from(trial))) {
      cluster.forEach(c => { active.delete(c); blocked.add(c); });
    }
  }

  return { active: Array.from(active), blocked: Array.from(blocked) };
}

// Punch interior holes & corridors into the board. A "hole" is simply a missing tile
// (an empty gap with edges) inside the grouping — NOT a special square. `intensity` (0-1)
// controls both how likely a board is to have any holes and how many/how long they are.
function punchHoles(sortedCells: string[], intensity: number): string[] {
  if (intensity <= 0) return sortedCells;
  // High-intensity map types almost always have holes/corridors; low ones are often solid.
  if (Math.random() > intensity) return sortedCells;

  const protectCount = 18; // shield the army rows top & bottom
  const protectedSet = new Set([
    ...sortedCells.slice(0, protectCount),
    ...sortedCells.slice(-protectCount),
  ]);
  const active = new Set(sortedCells);
  const minCells = 40;
  const numHoles = 1 + Math.floor(Math.random() * (2 + Math.round(intensity * 4))); // ~1-6 by intensity
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const interiorCandidates = () =>
    Array.from(active).filter(
      c => !protectedSet.has(c) && cellNeighbors(c).filter(n => active.has(n)).length >= 3
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
        const opts = cellNeighbors(from).filter(
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
      if (!isConnected(Array.from(active))) {
        hole.forEach(c => active.add(c));
      }
    }
  }

  return Array.from(active);
}

// Generate a random board shape with armies placed on it
function generateBoard(holeIntensity: number): { active: string[]; board: BoardState; blocked: string[] } {
  const sortFn = (a: string, b: string) => {
    const [ra, ca] = a.split(',').map(Number);
    const [rb, cb] = b.split(',').map(Number);
    return ra - rb || ca - cb;
  };

  let cells = generateShape();
  cells.sort(sortFn);

  // Holes & corridors (empty interior gaps, never special tiles) at a theme-appropriate rate.
  cells = punchHoles(cells, holeIntensity);
  cells.sort(sortFn);

  const blocked: string[] = [];

  const board: BoardState = {};

  // Black army occupies the topmost squares
  const blackCells = cells.slice(0, 16);
  blackCells.slice(0, 8).forEach((cell, i) => { board[cell] = [BLACK_BACK[i]]; });
  blackCells.slice(8, 16).forEach((cell) => { board[cell] = ['p']; });

  // White army occupies the bottommost squares
  const whitePawnCells = cells.slice(-16, -8);
  const whiteBackCells = cells.slice(-8);
  whitePawnCells.forEach((cell) => { board[cell] = ['P']; });
  whiteBackCells.forEach((cell, i) => { board[cell] = [WHITE_BACK[i]]; });

  return { active: cells, board, blocked };
}

const STORAGE_KEY = 'nerd-chess-state';

function loadSavedState(): { active: string[]; board: BoardState; currentTurn: 'white' | 'black'; winner: 'white' | 'black' | null; embattled: string[]; blocked: string[]; theme: string; pieceSet: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.active) && parsed.board && typeof parsed.board === 'object') {
      const activeArr: string[] = parsed.active;
      const activeSet = new Set(activeArr);
      // Special hazard tiles are retired — drop any legacy `blocked` cells from old saves
      // so the board is only tiles + empty holes (no special squares).
      const blocked: string[] = [];
      const board: BoardState = {};
      for (const [sq, pieces] of Object.entries(parsed.board as BoardState)) {
        if (activeSet.has(sq)) board[sq] = pieces;
      }
      return {
        active: activeArr,
        board,
        currentTurn: parsed.currentTurn === 'black' ? 'black' : 'white',
        winner: parsed.winner === 'white' || parsed.winner === 'black' ? parsed.winner : null,
        embattled: (Array.isArray(parsed.embattled) ? parsed.embattled : []).filter((c: string) => activeSet.has(c)),
        blocked,
        theme: THEMES.some(t => t.id === parsed.theme) ? parsed.theme : DEFAULT_THEME,
        pieceSet: PIECE_SETS.some(s => s.id === parsed.pieceSet) ? parsed.pieceSet : DEFAULT_SET,
      };
    }
  } catch {
    // ignore corrupted state
  }
  return null;
}

export default function Home() {
  const [initState] = useState(() => {
    const saved = loadSavedState();
    if (saved) return saved;
    const t = THEMES.find(x => x.id === DEFAULT_THEME) || THEMES[0];
    const g = generateBoard(t.holeIntensity);
    return { active: g.active, board: g.board, currentTurn: 'white' as const, winner: null, embattled: [] as string[], blocked: g.blocked, theme: DEFAULT_THEME, pieceSet: DEFAULT_SET };
  });
  const [activeSquares, setActiveSquares] = useState<string[]>(initState.active);
  const [board, setBoard] = useState<BoardState>(initState.board);
  const [draggedPiece, setDraggedPiece] = useState<{ piece: PieceType; from: Square } | null>(null);
  const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>(initState.currentTurn);
  const [boardWidth, setBoardWidth] = useState(500);
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [winner, setWinner] = useState<'white' | 'black' | null>(initState.winner);
  const [embattled, setEmbattled] = useState<string[]>(initState.embattled);
  const [blocked, setBlocked] = useState<string[]>(initState.blocked);
  const [theme, setTheme] = useState<string>(initState.theme);
  const [pieceSet, setPieceSet] = useState<string>(initState.pieceSet);
  const combatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-fresh snapshot of the board for use inside delayed combat callbacks
  const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);

  const activeSet = new Set(activeSquares);
  const embattledSet = new Set(embattled);
  const blockedSet = new Set(blocked);
  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];

  // Persist game state so a page reload / hot-reload never loses the game
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ active: activeSquares, board, currentTurn, winner, embattled, blocked, theme, pieceSet }));
    } catch {
      // ignore storage failures
    }
  }, [activeSquares, board, currentTurn, winner, embattled, blocked, theme, pieceSet]);

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
        // Reserve room on the right for the fixed legend panel (22rem + gap) so the board never slides under it.
        const reserved = 392;
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
    const attackerStats = PIECE_STATS[attacker];
    const defenderStats = PIECE_STATS[defender];

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
    } else if (result.outcome === 'repelled_destroyed') {
      // Attacker beaten -> attacker is destroyed
      removeOne(result.from, result.attacker);
    } else {
      // Embattled: attacker charges in (if not already there); both lock on the square
      if (result.from !== result.to) {
        removeOne(result.from, result.attacker);
        addOne(result.to, result.attacker);
      }
    }

    setBoard(newBoard);

    // Maintain the set of squares currently locked in battle
    if (result.outcome === 'embattled') {
      setEmbattled(prev => prev.includes(result.to) ? prev : [...prev, result.to]);
    } else {
      const remaining = newBoard[result.to] || [];
      const hasWhite = remaining.some(isWhitePiece);
      const hasBlack = remaining.some(p => !isWhitePiece(p));
      if (!(hasWhite && hasBlack)) {
        setEmbattled(prev => prev.filter(s => s !== result.to));
      }
    }

    // Turn follows whoever just acted: after a white attacker it's black's turn, and vice versa.
    setCurrentTurn(isWhitePiece(result.attacker) ? 'black' : 'white');

    const attackerName = PIECE_STATS[result.attacker].name;
    const defenderName = PIECE_STATS[result.defender].name;

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

    // Win condition: a King died in this combat
    const isKing = (p: PieceType) => p === 'K' || p === 'k';
    if (result.outcome === 'capture' && isKing(result.defender)) {
      // The defending King was captured -> the attacker's side wins
      setWinner(isWhitePiece(result.attacker) ? 'white' : 'black');
    } else if (result.outcome === 'repelled_destroyed' && isKing(result.attacker)) {
      // The attacking King was destroyed -> the defender's side wins
      setWinner(isWhitePiece(result.attacker) ? 'black' : 'white');
    }

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
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${piece}|${square}`);
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
    const enemyPiece = targetPieces.find(p => isWhitePiece(p) !== isWhitePiece(piece));

    if (enemyPiece) {
      setIsAnimating(true);
      const result = resolveCombat(piece, enemyPiece, fromSquare, targetSquare);
      setCombatResult(result);
      combatTimeoutRef.current = setTimeout(() => {
        combatTimeoutRef.current = null;
        applyCombatResult(result);
      }, 2000);
    } else {
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

      // Turn follows whoever just moved: after a white piece moves it's black's turn, and vice versa.
      setCurrentTurn(isWhitePiece(piece) ? 'black' : 'white');
    }

    setDraggedPiece(null);
  }, [board, isAnimating, winner, embattled, applyCombatResult]);

  // Resolve an ongoing battle: the current player's locked piece swings at the enemy.
  const handleEmbattledClick = useCallback((square: Square) => {
    if (isAnimating || winner) return;
    if (!embattled.includes(square)) return;

    const pieces = boardRef.current[square] || [];
    const wantWhite = currentTurn === 'white';
    const attacker = pieces.find(p => isWhitePiece(p) === wantWhite);
    const defender = pieces.find(p => isWhitePiece(p) !== wantWhite);
    if (!attacker || !defender) return;

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

  const regenerate = () => {
    if (combatTimeoutRef.current) {
      clearTimeout(combatTimeoutRef.current);
      combatTimeoutRef.current = null;
    }
    const { active, board: newBoard, blocked: newBlocked } = generateBoard(currentTheme.holeIntensity);
    setActiveSquares(active);
    setBoard(newBoard);
    setBlocked(newBlocked);
    setCurrentTurn('white');
    setCombatResult(null);
    setIsAnimating(false);
    setWinner(null);
    setEmbattled([]);
    toast({
      title: "New Battlefield",
      description: "A fresh randomized board has been generated.",
    });
  };

  const applyTheme = (id: string) => {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    if (combatTimeoutRef.current) {
      clearTimeout(combatTimeoutRef.current);
      combatTimeoutRef.current = null;
    }
    const { active, board: newBoard, blocked: newBlocked } = generateBoard(t.holeIntensity);
    setTheme(id);
    setActiveSquares(active);
    setBoard(newBoard);
    setBlocked(newBlocked);
    setCurrentTurn('white');
    setCombatResult(null);
    setIsAnimating(false);
    setWinner(null);
    setEmbattled([]);
    toast({
      title: t.label,
      description: "A new battlefield rises in this realm.",
    });
  };

  const applyPieceSet = (id: string) => {
    setPieceSet(id);
    const s = PIECE_SETS.find(x => x.id === id);
    toast({ title: s ? s.label : 'Pieces', description: 'Army style updated.' });
  };

  const squareSize = boardWidth / GRID_SIZE;

  // Thick black outline only on edges that face a "no-go" cell (a hole or off-grid),
  // never between two playable cells — so the board silhouette and holes read strongly
  // while the interior stays clean. Implemented as inset shadows so tiles stay aligned.
  const EDGE = Math.max(5, Math.round(squareSize * 0.09));
  const isLand = (rr: number, cc: number) =>
    rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE &&
    (activeSet.has(`${rr},${cc}`) || blockedSet.has(`${rr},${cc}`));
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
            <img
              src={pieceImage(pieceSet, winner === 'white' ? 'K' : 'k')}
              alt="King"
              className="w-28 h-28 mx-auto mb-4 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]"
            />
            <h2 className="text-4xl font-display font-bold mb-2">
              {winner === 'white' ? 'White' : 'Black'} Wins!
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

      {/* Combat Modal */}
      {combatResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <Card className="glass-card p-8 text-white border-white/10 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-display font-bold text-center mb-6">Combat!</h2>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-center">
                <img src={pieceImage(pieceSet, combatResult.attacker)} alt={PIECE_STATS[combatResult.attacker].name} className="w-20 h-20 mx-auto mb-2 object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.7)]" />
                <div className="text-sm text-white/60 mb-2">{PIECE_STATS[combatResult.attacker].name}</div>
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
                <img src={pieceImage(pieceSet, combatResult.defender)} alt={PIECE_STATS[combatResult.defender].name} className="w-20 h-20 mx-auto mb-2 object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.7)]" />
                <div className="text-sm text-white/60 mb-2">{PIECE_STATS[combatResult.defender].name}</div>
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
                ? `${PIECE_STATS[combatResult.attacker].name} captures!`
                : combatResult.outcome === 'repelled_destroyed'
                  ? `${PIECE_STATS[combatResult.defender].name} holds & destroys the attacker!`
                  : `Embattled! Both lock the square — fight on.`}
            </div>
          </Card>
        </div>
      )}

      <div className="relative z-10 w-full flex items-center justify-start">

        {/* Game Info Panel (legend) — fixed in the top-right corner, capped to viewport height */}
        <div className="fixed top-2 right-2 z-40 w-[22rem]">
          <Card className="glass-card p-4 space-y-4 text-white border-white/10 max-h-[calc(100vh-1rem)] overflow-y-auto">
            <div className="space-y-2">
              <h1 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
                Nerd Chess
              </h1>
              <p className="text-white/60 font-light text-sm">
                Dice combat on a randomized battlefield
              </p>
            </div>

            <div className="flex items-center gap-4 py-4 border-y border-white/10">
              <button
                type="button"
                onClick={() => setCurrentTurn('white')}
                title="Set turn to White"
                data-testid="button-turn-white"
                className={`p-3 rounded-xl transition-all duration-300 text-left cursor-pointer ${currentTurn === 'white' ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">White</div>
                <div className="font-mono text-lg">Player 1</div>
              </button>
              <button
                type="button"
                onClick={() => setCurrentTurn(prev => prev === 'white' ? 'black' : 'white')}
                title="Switch turn"
                aria-label="Switch turn"
                data-testid="button-turn-toggle"
                className="flex-1 h-10 relative flex items-center justify-center cursor-pointer group">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                <Swords className="relative w-4 h-4 text-white/40 group-hover:text-white/80 transition-colors bg-slate-900 px-1 box-content" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentTurn('black')}
                title="Set turn to Black"
                data-testid="button-turn-black"
                className={`p-3 rounded-xl transition-all duration-300 text-left cursor-pointer ${currentTurn === 'black' ? 'bg-black text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/20' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">Black</div>
                <div className="font-mono text-lg">Player 2</div>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-white/60 font-semibold uppercase tracking-wider">Piece Stats (Atk/Def)</div>
              <div className="grid grid-cols-2 gap-1 text-white/50">
                <span>♙ Pawn: 1/2</span>
                <span>♖ Rook: 1/5</span>
                <span>♘ Knight: 4/2</span>
                <span>♗ Bishop: 3/3</span>
                <span>♕ Queen: 5/4</span>
                <span>♔ King: 6/2</span>
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
                      src={pieceImage(s.id, 'K')}
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
              gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
              filter: 'drop-shadow(0 16px 20px rgba(0,0,0,0.85)) drop-shadow(0 2px 3px rgba(0,0,0,0.9))',
            }}
          >
            {Array.from({ length: GRID_SIZE }).map((_, r) =>
              Array.from({ length: GRID_SIZE }).map((_, c) => {
                const square = `${r},${c}`;
                const isActive = activeSet.has(square);

                if (blockedSet.has(square)) {
                  return (
                    <div
                      key={square}
                      className="relative overflow-hidden"
                      style={{
                        width: squareSize,
                        height: squareSize,
                        ...currentTheme.obstacleStyle,
                        boxShadow: [currentTheme.obstacleStyle.boxShadow as string | undefined, ...edgeShadows(r, c)].filter(Boolean).join(', ') || undefined,
                      }}
                      data-testid={`blocked-${square}`}
                    />
                  );
                }

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
                            <img
                              src={pieceImage(pieceSet, piece)}
                              alt={PIECE_STATS[piece].name}
                              draggable={false}
                              className="w-full h-full object-contain pointer-events-none select-none drop-shadow-[0_3px_5px_rgba(0,0,0,0.85)]"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent data-testid={`tooltip-piece-${square}-${index}`}>
                          {`${isWhitePiece(piece) ? 'White' : 'Black'} ${PIECE_STATS[piece].name}`}
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
