import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Coin } from "@/components/Coin";

// Different sizes for different pieces, matching the live score values on the board.
const PIECES = [
  { piece: "Pawn", size: 46, capture: 1, defense: 1 },
  { piece: "Knight", size: 58, capture: 3, defense: 3 },
  { piece: "Bishop", size: 62, capture: 3, defense: 3 },
  { piece: "Rook", size: 72, capture: 5, defense: 5 },
  { piece: "Queen", size: 88, capture: 9, defense: 9 },
  { piece: "King", size: 100, capture: 20, defense: 20 },
];

function Section({
  title,
  blurb,
  variant,
  field,
}: {
  title: string;
  blurb: string;
  variant: "attack" | "defense";
  field: "capture" | "defense";
}) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
      data-testid={`section-${variant}`}
    >
      <h2 className="font-display text-xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm font-light text-white/55">{blurb}</p>
      <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-6">
        {PIECES.map((p) => (
          <div key={p.piece} className="flex flex-col items-center gap-2">
            <Coin variant={variant} value={p[field]} size={p.size} />
            <span className="text-xs font-medium tracking-wide text-white/70">{p.piece}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Coins() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0e1726] via-[#101b14] to-[#0c1320] px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="space-y-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white"
            data-testid="link-back-home"
          >
            <ArrowLeft className="h-4 w-4" /> Back to the board
          </Link>
          <h1 className="font-display text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-white to-sky-200">
            Battle Bounty
          </h1>
          <p className="max-w-2xl font-light text-white/60">
            Minted coins for the spoils of war. Capture coins are struck in gold; defense coins in
            tempered steel. Bigger pieces mint bigger coins. Live board scores use these same values.
          </p>
        </header>

        {/* Hero pair */}
        <div className="flex flex-wrap items-center justify-center gap-14 rounded-2xl border border-white/10 bg-white/[0.03] py-10">
          <div className="flex flex-col items-center gap-3">
            <Coin variant="attack" value={9} size={130} />
            <span className="text-sm text-white/70">Capture</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <Coin variant="defense" value={9} size={130} />
            <span className="text-sm text-white/70">Defense</span>
          </div>
        </div>

        <Section
          title="Capture bounty"
          blurb="Awarded when you take an enemy piece. Gold, crossed swords."
          variant="attack"
          field="capture"
        />
        <Section
          title="Guard bounty"
          blurb="Awarded when you survive an attack. Steel, raised shield."
          variant="defense"
          field="defense"
        />

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 backdrop-blur-sm">
          <p className="font-medium text-white/80">How to use</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/30 p-4 text-xs leading-relaxed text-white/80">{`import { Coin, COIN_SIZES } from "@/components/Coin";

// when a capture happens in your logic:
<Coin variant="attack"  value={9} size={COIN_SIZES.queen} />

// when a piece defends successfully:
<Coin variant="defense" value={9} size={COIN_SIZES.queen} />`}</pre>
        </div>
      </div>
    </div>
  );
}
