import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Swords } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/dark_abstract_glass_waves_background.png";

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
type Square = string;

interface BoardState {
  [square: string]: PieceType[];
}

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

export default function Home() {
  const [board, setBoard] = useState<BoardState>(() => JSON.parse(JSON.stringify(INITIAL_POSITION)));
  const [draggedPiece, setDraggedPiece] = useState<{ piece: PieceType; from: Square } | null>(null);
  const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');
  const [boardWidth, setBoardWidth] = useState(500);

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

  const isLightSquare = (file: string, rank: string) => {
    const fileIndex = FILES.indexOf(file);
    const rankIndex = RANKS.indexOf(rank);
    return (fileIndex + rankIndex) % 2 === 0;
  };

  const handleDragStart = useCallback((e: React.DragEvent, square: Square, piece: PieceType) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${piece}|${square}`);
    setDraggedPiece({ piece, from: square });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSquare: Square) => {
    e.preventDefault();
    
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;
    
    const [piece, fromSquare] = data.split('|') as [PieceType, Square];
    
    if (fromSquare === targetSquare) return;

    setBoard(prev => {
      const newBoard = { ...prev };
      
      // Remove piece from source square
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
      
      // Add piece to target square (allowing stacking)
      if (!newBoard[targetSquare]) {
        newBoard[targetSquare] = [];
      } else {
        newBoard[targetSquare] = [...newBoard[targetSquare]];
      }
      newBoard[targetSquare].push(piece);
      
      return newBoard;
    });

    // Toggle turn
    setCurrentTurn(prev => prev === 'white' ? 'black' : 'white');
    setDraggedPiece(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedPiece(null);
  }, []);

  const resetGame = () => {
    setBoard(JSON.parse(JSON.stringify(INITIAL_POSITION)));
    setCurrentTurn('white');
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

      <div className="relative z-10 w-full max-w-6xl flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-center">
        
        {/* Game Info Panel */}
        <div className="w-full max-w-md space-y-4 order-2 lg:order-1">
          <Card className="glass-card p-6 space-y-6 text-white border-white/10">
            <div className="space-y-2">
              <h1 className="text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
                Chess
              </h1>
              <p className="text-white/60 font-light">
                Classic game, modern soul.
              </p>
            </div>

            <div className="flex items-center gap-4 py-4 border-y border-white/10">
              <div className={`p-3 rounded-xl transition-all duration-300 ${currentTurn === 'white' ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-white/5 text-white/50'}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">White</div>
                <div className="font-mono text-2xl">Player 1</div>
              </div>
              <div className="flex-1 h-px bg-white/10 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Swords className="w-4 h-4 text-white/40 bg-slate-900 px-1 box-content" />
                </div>
              </div>
              <div className={`p-3 rounded-xl transition-all duration-300 ${currentTurn === 'black' ? 'bg-black text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/20' : 'bg-white/5 text-white/50'}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">Black</div>
                <div className="font-mono text-2xl">Player 2</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-white/60">
                <span>Current Turn</span>
                <span className="font-medium text-white capitalize">{currentTurn}</span>
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
                const isLight = isLightSquare(file, rank);
                
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
                    {/* Multiple pieces stacked */}
                    {pieces.map((piece, index) => (
                      <div
                        key={`${piece}-${index}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, square, piece)}
                        onDragEnd={handleDragEnd}
                        className={`absolute cursor-grab active:cursor-grabbing transition-transform hover:scale-110 ${
                          piece === piece.toUpperCase() ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-black drop-shadow-[0_2px_4px_rgba(255,255,255,0.3)]'
                        }`}
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
                    
                    {/* Square label (optional, for corners) */}
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
