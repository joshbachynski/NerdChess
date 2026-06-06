import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Swords, Shuffle, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import voidBg from "@assets/generated_images/dark_abstract_glass_waves_background.png";
import meadowBg from "@assets/generated_images/theme_meadow.png";
import scifiBg from "@assets/generated_images/theme_scifi.png";
import cityBg from "@assets/generated_images/theme_city.png";
import cavernBg from "@assets/generated_images/theme_cavern.png";
import dungeonBg from "@assets/generated_images/theme_dungeon.png";
import volcanoBg from "@assets/generated_images/theme_volcano.png";
import type { CSSProperties } from "react";

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
type Square = string; // "row,col"

interface Theme {
  id: string;
  label: string;
  bg: string;
  light: string;        // light tile tint (rgba — background shows through)
  dark: string;         // dark tile tint
  overlay: string;      // page-darkening overlay class
  obstacles: boolean;   // carve impassable interior cells
  obstacleStyle: CSSProperties; // how a carved hazard cell looks
}

const THEMES: Theme[] = [
  {
    id: 'meadow', label: 'Fantasy Meadow', bg: meadowBg,
    light: 'rgba(150, 190, 110, 0.45)', dark: 'rgba(45, 80, 45, 0.62)',
    overlay: 'bg-black/20', obstacles: false, obstacleStyle: {},
  },
  {
    id: 'scifi', label: 'Sci-Fi Station', bg: scifiBg,
    light: 'rgba(120, 180, 210, 0.40)', dark: 'rgba(18, 42, 64, 0.66)',
    overlay: 'bg-black/25', obstacles: false, obstacleStyle: {},
  },
  {
    id: 'city', label: 'Night City', bg: cityBg,
    light: 'rgba(150, 160, 180, 0.42)', dark: 'rgba(30, 36, 52, 0.66)',
    overlay: 'bg-black/30', obstacles: false, obstacleStyle: {},
  },
  {
    id: 'cavern', label: 'Crystal Cavern', bg: cavernBg,
    light: 'rgba(130, 150, 175, 0.42)', dark: 'rgba(26, 36, 54, 0.68)',
    overlay: 'bg-black/35', obstacles: true,
    obstacleStyle: {
      background: 'radial-gradient(circle at 50% 45%, rgba(60, 150, 190, 0.85), rgba(8, 26, 44, 0.96))',
      boxShadow: 'inset 0 0 14px rgba(60, 170, 200, 0.6)',
    },
  },
  {
    id: 'dungeon', label: 'Dungeon', bg: dungeonBg,
    light: 'rgba(150, 138, 112, 0.42)', dark: 'rgba(48, 40, 30, 0.70)',
    overlay: 'bg-black/40', obstacles: true,
    obstacleStyle: {
      background: 'radial-gradient(circle at 50% 45%, rgba(12, 12, 16, 0.95), rgba(0, 0, 0, 0.98))',
      boxShadow: 'inset 0 0 16px rgba(0, 0, 0, 0.95)',
    },
  },
  {
    id: 'volcano', label: 'Volcano', bg: volcanoBg,
    light: 'rgba(150, 100, 88, 0.42)', dark: 'rgba(46, 26, 22, 0.72)',
    overlay: 'bg-black/35', obstacles: true,
    obstacleStyle: {
      background: 'radial-gradient(circle at 50% 45%, rgba(255, 150, 40, 0.95), rgba(150, 30, 10, 0.96))',
      boxShadow: 'inset 0 0 16px rgba(255, 90, 0, 0.9)',
    },
  },
  {
    id: 'void', label: 'Deep Void', bg: voidBg,
    light: 'rgba(148, 163, 184, 0.50)', dark: 'rgba(30, 41, 59, 0.66)',
    overlay: 'bg-black/40', obstacles: false, obstacleStyle: {},
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

const GRID_SIZE = 10;

const BLACK_BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const WHITE_BACK: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

const DiceIcon = ({ value }: { value: number }) => {
  const icons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
  const Icon = icons[value - 1] || Dice1;
  return <Icon className="w-12 h-12" />;
};

const isWhitePiece = (piece: PieceType) => piece === piece.toUpperCase();

// Grow a random connected blob of squares
function generateShape(): string[] {
  const active = new Set<string>();
  const startR = Math.floor(GRID_SIZE / 2);
  const startC = Math.floor(GRID_SIZE / 2);
  active.add(`${startR},${startC}`);

  const target = 46 + Math.floor(Math.random() * 18); // 46-63 cells
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

// Generate a random board shape with armies placed on it
function generateBoard(withObstacles: boolean): { active: string[]; board: BoardState; blocked: string[] } {
  const sortFn = (a: string, b: string) => {
    const [ra, ca] = a.split(',').map(Number);
    const [rb, cb] = b.split(',').map(Number);
    return ra - rb || ca - cb;
  };

  let cells = generateShape();
  cells.sort(sortFn);

  let blocked: string[] = [];
  if (withObstacles) {
    const carved = carveObstacles(cells);
    cells = carved.active;
    cells.sort(sortFn);
    blocked = carved.blocked;
  }

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

function loadSavedState(): { active: string[]; board: BoardState; currentTurn: 'white' | 'black'; winner: 'white' | 'black' | null; embattled: string[]; blocked: string[]; theme: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.active) && parsed.board && typeof parsed.board === 'object') {
      const activeArr: string[] = parsed.active;
      const activeSet = new Set(activeArr);
      // Normalize: blocked cells can never overlap active cells, and no piece
      // may sit on a non-active (carved/blocked) square — guards against stale state.
      const blocked: string[] = (Array.isArray(parsed.blocked) ? parsed.blocked : []).filter(
        (c: string) => !activeSet.has(c)
      );
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
    const g = generateBoard(t.obstacles);
    return { active: g.active, board: g.board, currentTurn: 'white' as const, winner: null, embattled: [] as string[], blocked: g.blocked, theme: DEFAULT_THEME };
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ active: activeSquares, board, currentTurn, winner, embattled, blocked, theme }));
    } catch {
      // ignore storage failures
    }
  }, [activeSquares, board, currentTurn, winner, embattled, blocked, theme]);

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
        const target = 1120; // 2x of the previous 560
        const max = Math.min(window.innerWidth - 80, window.innerHeight - 80);
        setBoardWidth(Math.min(target, max));
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

    setCurrentTurn(prev => prev === 'white' ? 'black' : 'white');

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

      setCurrentTurn(prev => prev === 'white' ? 'black' : 'white');
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
    const { active, board: newBoard, blocked: newBlocked } = generateBoard(currentTheme.obstacles);
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
    const { active, board: newBoard, blocked: newBlocked } = generateBoard(t.obstacles);
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
      description: t.obstacles
        ? "A new battlefield rises — beware the hazards within."
        : "A new battlefield rises in this realm.",
    });
  };

  const squareSize = boardWidth / GRID_SIZE;

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 lg:p-8 bg-background relative overflow-hidden"
      style={{
        backgroundImage: `url(${currentTheme.bg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className={`absolute inset-0 ${currentTheme.overlay} z-0`} />

      {/* Victory Modal */}
      {winner && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <Card className="glass-card p-10 text-white border-white/10 max-w-md w-full mx-4 text-center animate-in zoom-in-95 duration-300">
            <div className="text-7xl mb-4">{winner === 'white' ? '♔' : '♚'}</div>
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
                <div className="text-6xl mb-2">{PIECE_UNICODE[combatResult.attacker]}</div>
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
                <div className="text-6xl mb-2">{PIECE_UNICODE[combatResult.defender]}</div>
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

      <div className="relative z-10 w-full flex items-center justify-center">

        {/* Game Info Panel (legend) — scaled to 50% in the top-right corner */}
        <div className="fixed top-2 right-2 z-40 origin-top-right scale-[0.5] w-[28rem]">
          <Card className="glass-card p-6 space-y-6 text-white border-white/10">
            <div className="space-y-2">
              <h1 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
                Nerd Chess
              </h1>
              <p className="text-white/60 font-light text-sm">
                Dice combat on a randomized battlefield
              </p>
            </div>

            <div className="flex items-center gap-4 py-4 border-y border-white/10">
              <div className={`p-3 rounded-xl transition-all duration-300 ${currentTurn === 'white' ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-white/5 text-white/50'}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">White</div>
                <div className="font-mono text-lg">Player 1</div>
              </div>
              <div className="flex-1 h-px bg-white/10 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Swords className="w-4 h-4 text-white/40 bg-slate-900 px-1 box-content" />
                </div>
              </div>
              <div className={`p-3 rounded-xl transition-all duration-300 ${currentTurn === 'black' ? 'bg-black text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/20' : 'bg-white/5 text-white/50'}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">Black</div>
                <div className="font-mono text-lg">Player 2</div>
              </div>
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
                      backgroundImage: `url(${t.bg})`,
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
                      className="relative shadow-inner"
                      style={{ width: squareSize, height: squareSize, ...currentTheme.obstacleStyle }}
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

                return (
                  <div
                    key={square}
                    className={`relative flex items-center justify-center select-none shadow-inner ${isEmbattled ? 'ring-2 ring-inset ring-amber-400 cursor-pointer animate-pulse' : ''} ${draggedPiece && !isEmbattled ? 'cursor-pointer' : ''}`}
                    style={{ width: squareSize, height: squareSize, backgroundColor: isLight ? currentTheme.light : currentTheme.dark }}
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
                      <div
                        key={`${piece}-${index}`}
                        draggable={!isAnimating && !winner && !isEmbattled}
                        onDragStart={(e) => handleDragStart(e, square, piece)}
                        onDragEnd={handleDragEnd}
                        className={`absolute cursor-grab active:cursor-grabbing transition-transform hover:scale-110 ${
                          isWhitePiece(piece) ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-black drop-shadow-[0_2px_4px_rgba(255,255,255,0.3)]'
                        } ${isAnimating ? 'pointer-events-none' : ''}`}
                        style={{
                          fontSize: squareSize * 0.68,
                          lineHeight: 1,
                          zIndex: 10 + index,
                          transform: pieces.length > 1 ? `translate(${index * 4}px, ${index * -4}px)` : undefined,
                        }}
                        data-testid={`piece-${square}-${index}`}
                      >
                        {PIECE_UNICODE[piece]}
                      </div>
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
