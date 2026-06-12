import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Coin, CoinBurst, type CoinVariant } from "@/components/Coin";

// Different sizes for different pieces — a captured Queen mints a bigger coin
// than a Pawn. Values here are illustrative; wire your own scoring later.
const PIECES = [
  { piece: "Pawn", size: 46, capture: 1, defense: 1 },
  { piece: "Knight", size: 58, capture: 3, defense: 2 },
  { piece: "Bishop", size: 62, capture: 3, defense: 2 },
  { piece: "Rook", size: 72, capture: 5, defense: 3 },
  { piece: "Queen", size: 88, capture: 9, defense: 4 },
  { piece: "King", size: 100, capture: 12, defense: 5 },
];

function Section({
  title,
  blurb,
  variant,
  field,
}: {
  title: string;
  blurb: string;
  variant: CoinVariant;
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

// A self-replaying demo of the "reward earned" animation. Auto-loops every few
// seconds and can be replayed on demand — remounting CoinBurst via `key` replays it.
function BurstDemo({
  variant,
  value,
  label,
}: {
  variant: CoinVariant;
  value: number;
  label: string;
}) {
  const [run, setRun] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setRun((n) => n + 1), 2600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-[160px] w-[160px] items-center justify-center">
        <CoinBurst key={run} variant={variant} value={value} size={92} />
      </div>
      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10"
        data-testid={`button-replay-${variant}`}
      >
        <RotateCcw className="h-3.5 w-3.5" /> {label}
      </button>
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
            tempered steel. Bigger pieces mint bigger coins. These are graphics only — drop the{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-amber-200">Coin</code> or{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-sky-200">CoinBurst</code> component
            in wherever your scoring fires.
          </p>
        </header>

        {/* Spinning medallions */}
        <div className="flex flex-wrap items-center justify-center gap-16 rounded-2xl border border-white/10 bg-white/[0.03] py-12">
          <div className="flex flex-col items-center gap-3">
            <Coin variant="attack" size={120} spin animated={false} />
            <span className="text-sm text-white/70">Capture</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <Coin variant="defense" size={120} spin animated={false} />
            <span className="text-sm text-white/70">Defense</span>
          </div>
        </div>

        {/* The "reward earned" animation */}
        <div
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
          data-testid="section-burst"
        >
          <h2 className="font-display text-xl font-bold text-white">Reward earned</h2>
          <p className="mt-1 text-sm font-light text-white/55">
            The full celebration: the coin flips and bounces in, sparks fly out, a shockwave ripples,
            and the points float up. It loops here so you can see it — fire it once per reward in-game.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-20 gap-y-8">
            <BurstDemo variant="attack" value={9} label="Replay capture" />
            <BurstDemo variant="defense" value={4} label="Replay defense" />
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
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/30 p-4 text-xs leading-relaxed text-white/80">{`import { Coin, CoinBurst, COIN_SIZES } from "@/components/Coin";

// a static coin (e.g. in a score tray):
<Coin variant="attack" value={9} size={COIN_SIZES.queen} />

// the full "reward earned" animation — give it a changing key to replay,
// and unmount it when onDone fires:
<CoinBurst variant="attack" value={9} size={COIN_SIZES.queen} onDone={cleanup} />

// a value-less spinning medallion:
<Coin variant="defense" size={120} spin animated={false} />`}</pre>
        </div>
      </div>
    </div>
  );
}
