import { useId } from "react";
import { Swords, Shield } from "lucide-react";

export type CoinVariant = "attack" | "defense";

export interface CoinProps {
  /** "attack" = awarded for capturing a piece, "defense" = awarded for surviving an attack. */
  variant: CoinVariant;
  /** Points the coin is worth. Shown as the big number on the face. Omit to show the emblem only. */
  value?: number;
  /** Rendered diameter in pixels. Defaults to 64. */
  size?: number;
  /** Slow float + shine sweep. Defaults to true. */
  animated?: boolean;
  className?: string;
}

/**
 * Suggested coin sizes per piece, so a captured Queen mints a bigger coin than a
 * Pawn. Pure graphics helper — wire it to your own scoring however you like.
 */
export type PieceKey = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

export const COIN_SIZES: Record<PieceKey, number> = {
  pawn: 44,
  knight: 56,
  bishop: 60,
  rook: 68,
  queen: 84,
  king: 96,
};

const THEME: Record<CoinVariant, {
  rimTop: string; rimBot: string;
  faceIn: string; faceOut: string;
  ring: string; edge: string;
  ink: string; glow: string;
}> = {
  attack: {
    rimTop: "#ffe487", rimBot: "#9a6b07",
    faceIn: "#fff7d4", faceOut: "#e3a521",
    ring: "#b07d10", edge: "#6e4a03",
    ink: "#6b4503", glow: "#fff1b8",
  },
  defense: {
    rimTop: "#e9f4ff", rimBot: "#345a7d",
    faceIn: "#f5faff", faceOut: "#8fb6d8",
    ring: "#4a719a", edge: "#26415a",
    ink: "#2c4a68", glow: "#dcefff",
  },
};

export function Coin({ variant, value, size = 64, animated = true, className = "" }: CoinProps) {
  const uid = useId().replace(/[:]/g, "");
  const t = THEME[variant];
  const Emblem = variant === "attack" ? Swords : Shield;
  const hasValue = value !== undefined && value !== null;

  const rimId = `coin-rim-${uid}`;
  const faceId = `coin-face-${uid}`;
  const glossId = `coin-gloss-${uid}`;

  return (
    <div
      className={`coin ${animated ? "coin--anim" : ""} ${className}`}
      style={{ width: size, height: size }}
      data-testid={`coin-${variant}${hasValue ? `-${value}` : ""}`}
      role="img"
      aria-label={
        hasValue
          ? `${value} ${variant === "attack" ? "capture" : "defense"} points`
          : `${variant} coin`
      }
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="coin__face">
        <defs>
          <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.rimTop} />
            <stop offset="100%" stopColor={t.rimBot} />
          </linearGradient>
          <radialGradient id={faceId} cx="50%" cy="38%" r="68%">
            <stop offset="0%" stopColor={t.faceIn} />
            <stop offset="100%" stopColor={t.faceOut} />
          </radialGradient>
          <radialGradient id={glossId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Coin body + milled (ridged) edge */}
        <circle cx="50" cy="50" r="48" fill={`url(#${rimId})`} stroke={t.edge} strokeWidth="1.5" />
        <circle
          cx="50" cy="50" r="45.5"
          fill="none" stroke={t.edge} strokeWidth="3.5"
          strokeDasharray="1.5 2.3" opacity="0.45"
        />

        {/* Raised face + engraved inner ring */}
        <circle cx="50" cy="50" r="41" fill={`url(#${faceId})`} stroke={t.edge} strokeWidth="0.6" opacity="0.95" />
        <circle cx="50" cy="50" r="35.5" fill="none" stroke={t.ring} strokeWidth="1.4" opacity="0.55" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.25" />

        {/* Top gloss highlight */}
        <ellipse cx="50" cy="33" rx="29" ry="17" fill={`url(#${glossId})`} opacity="0.5" />
      </svg>

      {/* Emblem + value, embossed */}
      <div className="coin__content" style={{ color: t.ink }}>
        <Emblem
          className="coin__emblem"
          style={{ width: size * 0.26, height: size * 0.26 }}
          strokeWidth={2.4}
          aria-hidden="true"
        />
        {hasValue && (
          <span className="coin__value" style={{ fontSize: size * 0.34, lineHeight: 1 }}>
            {value}
          </span>
        )}
      </div>

      {animated && <span className="coin__shine" />}
    </div>
  );
}

export default Coin;
