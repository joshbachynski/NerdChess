import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Swords, Shuffle, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/dark_abstract_glass_waves_background.png";

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
type Square = string; // "row,col"

interface BoardState {
  [square: string]: PieceType[];
}

interface CombatResult {
  attacker: PieceType;
  defender: PieceType;
  attackRoll: number;
  defenseRoll: number;
  attackNeeded: number;
  defenseNeeded: number;
  attackerWins: boolean;
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

// Generate a random board shape with armies placed on it
function generateBoard(): { active: string[]; board: BoardState } {
  const cells = generateShape();

  // Sort top-to-bottom, left-to-right
  cells.sort((a, b) => {
    const [ra, ca] = a.split(',').map(Number);
    const [rb, cb] = b.split(',').map(Number);
    return ra - rb || ca - cb;
  });

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

  return { active: cells, board };
}

export default function Home() {
  const [initState] = useState(() => generateBoard());
  const [activeSquares, setActiveSquares] = useState<string[]>(initState.active);
  const [board, setBoard] = useState<BoardState>(initState.board);
  const [draggedPiece, setDraggedPiece] = useState<{ piece: PieceType; from: Square } | null>(null);
  const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');
  const [boardWidth, setBoardWidth] = useState(500);
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [winner, setWinner] = useState<'white' | 'black' | null>(null);
  const combatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeSet = new Set(activeSquares);

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
    const defenseSucceeds = defenseRoll <= defenderStats.defense;

    const attackerWins = attackSucceeds && !defenseSucceeds;

    return {
      attacker,
      defender,
      attackRoll,
      defenseRoll,
      attackNeeded: attackerStats.attack,
      defenseNeeded: defenderStats.defense,
      attackerWins,
      from,
      to,
    };
  };

  const applyCombatResult = useCallback((result: CombatResult) => {
    setBoard(prev => {
      const newBoard = { ...prev };

      if (result.attackerWins) {
        // Remove attacker from source
        if (newBoard[result.from]) {
          const pieceIndex = newBoard[result.from].indexOf(result.attacker);
          if (pieceIndex > -1) {
            newBoard[result.from] = [...newBoard[result.from]];
            newBoard[result.from].splice(pieceIndex, 1);
            if (newBoard[result.from].length === 0) delete newBoard[result.from];
          }
        }

        // Remove defender from target
        if (newBoard[result.to]) {
          const defenderIndex = newBoard[result.to].indexOf(result.defender);
          if (defenderIndex > -1) {
            newBoard[result.to] = [...newBoard[result.to]];
            newBoard[result.to].splice(defenderIndex, 1);
          }
        }

        // Place attacker at target
        if (!newBoard[result.to]) newBoard[result.to] = [];
        else newBoard[result.to] = [...newBoard[result.to]];
        newBoard[result.to].push(result.attacker);

      } else {
        // Defender wins: attacker is destroyed
        if (newBoard[result.from]) {
          const pieceIndex = newBoard[result.from].indexOf(result.attacker);
          if (pieceIndex > -1) {
            newBoard[result.from] = [...newBoard[result.from]];
            newBoard[result.from].splice(pieceIndex, 1);
            if (newBoard[result.from].length === 0) delete newBoard[result.from];
          }
        }
      }

      return newBoard;
    });

    setCurrentTurn(prev => prev === 'white' ? 'black' : 'white');

    const attackerName = PIECE_STATS[result.attacker].name;
    const defenderName = PIECE_STATS[result.defender].name;

    toast({
      title: result.attackerWins ? `${attackerName} captures ${defenderName}!` : `${defenderName} defends!`,
      description: result.attackerWins
        ? `Attack ${result.attackRoll} (≤${result.attackNeeded}) hit, Defense ${result.defenseRoll} (≤${result.defenseNeeded}) failed`
        : `Defense roll ${result.defenseRoll} (≤${result.defenseNeeded}) held the line!`,
    });

    // Win condition: a King was captured/destroyed in this combat
    const isKing = (p: PieceType) => p === 'K' || p === 'k';
    if (result.attackerWins && isKing(result.defender)) {
      // The defending King died -> the attacker's side wins
      setWinner(isWhitePiece(result.attacker) ? 'white' : 'black');
    } else if (!result.attackerWins && isKing(result.attacker)) {
      // The attacking King died -> the defender's side wins
      setWinner(isWhitePiece(result.attacker) ? 'black' : 'white');
    }

    setCombatResult(null);
    setIsAnimating(false);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, square: Square, piece: PieceType) => {
    if (isAnimating || winner) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${piece}|${square}`);
    setDraggedPiece({ piece, from: square });
  }, [isAnimating, winner]);

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
  }, [board, isAnimating, winner, applyCombatResult]);

  const handleDragEnd = useCallback(() => {
    setDraggedPiece(null);
  }, []);

  const regenerate = () => {
    if (combatTimeoutRef.current) {
      clearTimeout(combatTimeoutRef.current);
      combatTimeoutRef.current = null;
    }
    const { active, board: newBoard } = generateBoard();
    setActiveSquares(active);
    setBoard(newBoard);
    setCurrentTurn('white');
    setCombatResult(null);
    setIsAnimating(false);
    setWinner(null);
    toast({
      title: "New Battlefield",
      description: "A fresh randomized board has been generated.",
    });
  };

  const squareSize = boardWidth / GRID_SIZE;

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 lg:p-8 bg-background relative overflow-hidden"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-background/40 backdrop-blur-sm z-0" />

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
              combatResult.attackerWins ? 'text-red-400' : 'text-green-400'
            }`}>
              {combatResult.attackerWins
                ? `${PIECE_STATS[combatResult.attacker].name} wins!`
                : `${PIECE_STATS[combatResult.defender].name} survives!`}
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

                if (!isActive) {
                  return <div key={square} style={{ width: squareSize, height: squareSize }} />;
                }

                const pieces = board[square] || [];
                const isLight = (r + c) % 2 === 0;

                return (
                  <div
                    key={square}
                    className={`relative flex items-center justify-center select-none ${
                      isLight ? 'bg-slate-400' : 'bg-slate-700'
                    } shadow-inner ${draggedPiece ? 'cursor-pointer' : ''}`}
                    style={{ width: squareSize, height: squareSize }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, square)}
                    data-testid={`square-${square}`}
                  >
                    {pieces.map((piece, index) => (
                      <div
                        key={`${piece}-${index}`}
                        draggable={!isAnimating && !winner}
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
