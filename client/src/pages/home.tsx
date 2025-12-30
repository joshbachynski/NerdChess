import { useState, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Swords } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/dark_abstract_glass_waves_background.png";

export default function Home() {
  const [game] = useState(() => new Chess());
  const [fen, setFen] = useState(game.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  
  // Responsive board width
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
    handleResize(); // Initial call
    
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function makeAMove(move: any) {
    try {
      console.log("Attempting move:", move);
      const result = game.move(move);
      console.log("Move result:", result);
      setFen(game.fen());
      
      if (result) {
        setMoveHistory(prev => [...prev, result.san]);
        return result;
      }
    } catch (error) {
      console.error("Move error:", error);
      return null;
    }
    return null;
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    console.log("onDrop:", sourceSquare, targetSquare);
    
    // Attempt move without promotion first (for normal moves)
    let move = null;
    try {
      move = makeAMove({
        from: sourceSquare,
        to: targetSquare,
      });
    } catch (e) {
      // ignore
    }

    // If that failed, try with promotion to queen (for pawn promotion moves)
    if (move === null) {
      try {
        move = makeAMove({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
      } catch (e) {
        // ignore
      }
    }

    if (move === null) return false;

    // Game over checks
    if (game.isGameOver()) {
      if (game.isCheckmate()) {
        toast({
          title: "Checkmate!",
          description: `Game over. ${game.turn() === 'w' ? 'Black' : 'White'} wins!`,
        });
      } else if (game.isDraw()) {
        toast({
          title: "Draw",
          description: "Game ended in a draw.",
        });
      } else {
        toast({
          title: "Game Over",
          description: "Game ended.",
        });
      }
    } else if (game.inCheck()) {
      toast({
        title: "Check!",
        description: `${game.turn() === 'w' ? 'White' : 'Black'} is in check.`,
      });
    }

    return true;
  }

  function resetGame() {
    game.reset();
    setFen(game.fen());
    setMoveHistory([]);
    toast({
      title: "Game Reset",
      description: "New game started.",
    });
  }

  return (
    <div 
      className="min-h-screen w-full flex items-center justify-center p-4 lg:p-8 bg-background relative overflow-hidden"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-background/40 backdrop-blur-sm z-0" />

      <div className="relative z-10 w-full max-w-6xl flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-center">
        
        {/* Game Info Panel (Left) */}
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
              <div className={`p-3 rounded-xl transition-all duration-300 ${game.turn() === 'w' ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-white/5 text-white/50'}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">White</div>
                <div className="font-mono text-2xl">Player 1</div>
              </div>
              <div className="flex-1 h-px bg-white/10 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Swords className="w-4 h-4 text-white/40 bg-slate-900 px-1 box-content" />
                </div>
              </div>
              <div className={`p-3 rounded-xl transition-all duration-300 ${game.turn() === 'b' ? 'bg-black text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/20' : 'bg-white/5 text-white/50'}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">Black</div>
                <div className="font-mono text-2xl">Player 2</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-white/60">
                <span>Status</span>
                <span className={`font-medium ${game.inCheck() ? 'text-red-400' : 'text-white'}`}>
                  {game.isCheckmate() ? 'Checkmate' : 
                   game.inCheck() ? 'Check' : 
                   game.isDraw() ? 'Draw' : 
                   'Active'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-white/60">
                <span>Moves</span>
                <span className="font-mono">{Math.floor((moveHistory.length + 1) / 2)}</span>
              </div>
            </div>

            <Button 
              onClick={resetGame} 
              variant="outline" 
              className="w-full bg-white/5 border-white/10 hover:bg-white/10 hover:text-white transition-all"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Board
            </Button>
          </Card>
        </div>

        {/* Chess Board (Center) */}
        <div className="order-1 lg:order-2 shadow-2xl shadow-black/50 rounded-lg overflow-hidden ring-1 ring-white/10">
          {/* @ts-ignore */}
          <Chessboard 
            position={fen} 
            onPieceDrop={onDrop}
            boardWidth={boardWidth}
            customDarkSquareStyle={{ backgroundColor: '#334155' }} // Slate-700
            customLightSquareStyle={{ backgroundColor: '#94a3b8' }} // Slate-400
            customDropSquareStyle={{ boxShadow: 'inset 0 0 1px 6px rgba(129, 140, 248, 0.75)' }} // Indigo ring
            animationDuration={200}
          />
        </div>

        {/* Move History (Right) - Optional, kept simpler for now or could be added later */}
      </div>
    </div>
  );
}
