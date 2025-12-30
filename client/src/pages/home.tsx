import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Swords, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/dark_abstract_glass_waves_background.png";

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
type Square = string;

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

const INITIAL_POSITION: BoardState = {
  a8: ['r'], b8: ['n'], c8: ['b'], d8: ['q'], e8: ['k'], f8: ['b'], g8: ['n'], h8: ['r'],
  a7: ['p'], b7: ['p'], c7: ['p'], d7: ['p'], e7: ['p'], f7: ['p'], g7: ['p'], h7: ['p'],
  a2: ['P'], b2: ['P'], c2: ['P'], d2: ['P'], e2: ['P'], f2: ['P'], g2: ['P'], h2: ['P'],
  a1: ['R'], b1: ['N'], c1: ['B'], d1: ['Q'], e1: ['K'], f1: ['B'], g1: ['N'], h1: ['R'],
};

const PIECE_UNICODE: { [key in PieceType]: string } = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const DiceIcon = ({ value }: { value: number }) => {
  const icons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
  const Icon = icons[value - 1] || Dice1;
  return <Icon className="w-12 h-12" />;
};

const isWhitePiece = (piece: PieceType) => piece === piece.toUpperCase();

export default function Home() {
  const [board, setBoard] = useState<BoardState>(() => JSON.parse(JSON.stringify(INITIAL_POSITION)));
  const [draggedPiece, setDraggedPiece] = useState<{ piece: PieceType; from: Square } | null>(null);
  const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');
  const [boardWidth, setBoardWidth] = useState(500);
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 640) {
        setBoardWidth(window.innerWidth - 48);
      } else {
        setBoardWidth(560);
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
    
    // Defender wins if they succeed, attacker only wins if they succeed AND defender fails
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
        // Attacker wins: remove attacker from source, remove defender, place attacker at target
        if (newBoard[result.from]) {
          const pieceIndex = newBoard[result.from].indexOf(result.attacker);
          if (pieceIndex > -1) {
            newBoard[result.from] = [...newBoard[result.from]];
            newBoard[result.from].splice(pieceIndex, 1);
            if (newBoard[result.from].length === 0) {
              delete newBoard[result.from];
            }
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
        if (!newBoard[result.to]) {
          newBoard[result.to] = [];
        } else {
          newBoard[result.to] = [...newBoard[result.to]];
        }
        newBoard[result.to].push(result.attacker);
        
      } else {
        // Defender wins: remove attacker from source (attacker is destroyed)
        if (newBoard[result.from]) {
          const pieceIndex = newBoard[result.from].indexOf(result.attacker);
          if (pieceIndex > -1) {
            newBoard[result.from] = [...newBoard[result.from]];
            newBoard[result.from].splice(pieceIndex, 1);
            if (newBoard[result.from].length === 0) {
              delete newBoard[result.from];
            }
          }
        }
      }
      
      return newBoard;
    });
    
    setCurrentTurn(prev => prev === 'white' ? 'black' : 'white');
    
    // Show toast with result
    const attackerName = PIECE_STATS[result.attacker].name;
    const defenderName = PIECE_STATS[result.defender].name;
    
    toast({
      title: result.attackerWins ? `${attackerName} captures ${defenderName}!` : `${defenderName} defends!`,
      description: result.attackerWins 
        ? `Attack roll ${result.attackRoll} (needed ≤${result.attackNeeded}) succeeded, Defense roll ${result.defenseRoll} (needed ≤${result.defenseNeeded}) failed`
        : `Defense roll ${result.defenseRoll} (needed ≤${result.defenseNeeded}) succeeded!`,
    });
    
    setCombatResult(null);
    setIsAnimating(false);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, square: Square, piece: PieceType) => {
    if (isAnimating) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${piece}|${square}`);
    setDraggedPiece({ piece, from: square });
  }, [isAnimating]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSquare: Square) => {
    e.preventDefault();
    if (isAnimating) return;
    
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;
    
    const [piece, fromSquare] = data.split('|') as [PieceType, Square];
    
    if (fromSquare === targetSquare) return;

    const targetPieces = board[targetSquare] || [];
    
    // Check if there's an enemy piece at target
    const enemyPiece = targetPieces.find(p => isWhitePiece(p) !== isWhitePiece(piece));
    
    if (enemyPiece) {
      // Combat!
      setIsAnimating(true);
      const result = resolveCombat(piece, enemyPiece, fromSquare, targetSquare);
      setCombatResult(result);
      
      // Auto-resolve after animation
      setTimeout(() => {
        applyCombatResult(result);
      }, 2000);
      
    } else {
      // Normal move (no combat)
      setBoard(prev => {
        const newBoard = { ...prev };
        
        if (newBoard[fromSquare]) {
          const pieceIndex = newBoard[fromSquare].indexOf(piece);
          if (pieceIndex > -1) {
            newBoard[fromSquare] = [...newBoard[fromSquare]];
            newBoard[fromSquare].splice(pieceIndex, 1);
            if (newBoard[fromSquare].length === 0) {
              delete newBoard[fromSquare];
            }
          }
        }
        
        if (!newBoard[targetSquare]) {
          newBoard[targetSquare] = [];
        } else {
          newBoard[targetSquare] = [...newBoard[targetSquare]];
        }
        newBoard[targetSquare].push(piece);
        
        return newBoard;
      });

      setCurrentTurn(prev => prev === 'white' ? 'black' : 'white');
    }
    
    setDraggedPiece(null);
  }, [board, isAnimating, applyCombatResult]);

  const handleDragEnd = useCallback(() => {
    setDraggedPiece(null);
  }, []);

  const resetGame = () => {
    setBoard(JSON.parse(JSON.stringify(INITIAL_POSITION)));
    setCurrentTurn('white');
    setCombatResult(null);
    setIsAnimating(false);
    toast({
      title: "Game Reset",
      description: "New game started.",
    });
  };

  const squareSize = boardWidth / 8;

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

      {/* Combat Modal */}
      {combatResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <Card className="glass-card p-8 text-white border-white/10 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-display font-bold text-center mb-6">Combat!</h2>
            
            <div className="flex items-center justify-between gap-4">
              {/* Attacker */}
              <div className="flex-1 text-center">
                <div className="text-6xl mb-2">{PIECE_UNICODE[combatResult.attacker]}</div>
                <div className="text-sm text-white/60 mb-2">{PIECE_STATS[combatResult.attacker].name}</div>
                <div className="text-xs text-white/40 mb-3">Attack: {combatResult.attackNeeded}+</div>
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
              
              {/* Defender */}
              <div className="flex-1 text-center">
                <div className="text-6xl mb-2">{PIECE_UNICODE[combatResult.defender]}</div>
                <div className="text-sm text-white/60 mb-2">{PIECE_STATS[combatResult.defender].name}</div>
                <div className="text-xs text-white/40 mb-3">Defense: {combatResult.defenseNeeded}+</div>
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

      <div className="relative z-10 w-full max-w-6xl flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-center">
        
        {/* Game Info Panel */}
        <div className="w-full max-w-md space-y-4 order-2 lg:order-1">
          <Card className="glass-card p-6 space-y-6 text-white border-white/10">
            <div className="space-y-2">
              <h1 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
                Nerd Chess
              </h1>
              <p className="text-white/60 font-light text-sm">
                Dice-based combat like Axis & Allies
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

            {/* Stats Reference */}
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

            <Button 
              onClick={resetGame} 
              variant="outline" 
              className="w-full bg-white/5 border-white/10 hover:bg-white/10 hover:text-white transition-all"
              data-testid="button-reset"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Board
            </Button>
          </Card>
        </div>

        {/* Chess Board */}
        <div 
          className="order-1 lg:order-2 shadow-2xl shadow-black/50 rounded-lg overflow-hidden ring-1 ring-white/10"
          style={{ width: boardWidth, height: boardWidth }}
          data-testid="chessboard"
        >
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
            {RANKS.map(rank => 
              FILES.map(file => {
                const square = `${file}${rank}`;
                const pieces = board[square] || [];
                const fileIndex = FILES.indexOf(file);
                const rankIndex = RANKS.indexOf(rank);
                const isLight = (fileIndex + rankIndex) % 2 === 0;
                
                return (
                  <div
                    key={square}
                    className={`relative flex items-center justify-center select-none ${
                      isLight ? 'bg-slate-400' : 'bg-slate-700'
                    } ${draggedPiece ? 'cursor-pointer' : ''}`}
                    style={{ width: squareSize, height: squareSize }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, square)}
                    data-testid={`square-${square}`}
                  >
                    {pieces.map((piece, index) => (
                      <div
                        key={`${piece}-${index}`}
                        draggable={!isAnimating}
                        onDragStart={(e) => handleDragStart(e, square, piece)}
                        onDragEnd={handleDragEnd}
                        className={`absolute cursor-grab active:cursor-grabbing transition-transform hover:scale-110 ${
                          isWhitePiece(piece) ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-black drop-shadow-[0_2px_4px_rgba(255,255,255,0.3)]'
                        } ${isAnimating ? 'pointer-events-none' : ''}`}
                        style={{
                          fontSize: squareSize * 0.7,
                          lineHeight: 1,
                          zIndex: 10 + index,
                          transform: pieces.length > 1 ? `translate(${index * 4}px, ${index * -4}px)` : undefined,
                        }}
                        data-testid={`piece-${square}-${index}`}
                      >
                        {PIECE_UNICODE[piece]}
                      </div>
                    ))}
                    
                    {file === 'a' && (
                      <span className="absolute top-0.5 left-1 text-xs font-mono opacity-50 text-white/70">
                        {rank}
                      </span>
                    )}
                    {rank === '1' && (
                      <span className="absolute bottom-0.5 right-1 text-xs font-mono opacity-50 text-white/70">
                        {file}
                      </span>
                    )}
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
