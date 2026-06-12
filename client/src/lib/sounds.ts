// Lightweight Web Audio sound engine for Nerd Chess.
// Synthesizes short, distinct tones on demand — no audio assets to load.
// Each play spins up fresh oscillator/gain nodes, so rapid repeated triggers
// and overlapping events never cut each other off.

export type SoundName = 'move' | 'attack' | 'embattled' | 'death' | 'win';

const MUTE_KEY = 'nerd-chess-muted';

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === 'true';
} catch {
  // ignore storage failures
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  // Browsers start the context suspended until a user gesture; resume on demand.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

// A single tone with an attack/decay envelope.
interface Tone {
  freq: number;        // starting frequency (Hz)
  endFreq?: number;    // optional glide target
  type?: OscillatorType;
  start: number;       // seconds, relative to play time
  duration: number;    // seconds
  gain?: number;       // peak gain (0-1)
}

function playTone(audio: AudioContext, t: Tone): void {
  const osc = audio.createOscillator();
  const env = audio.createGain();
  const now = audio.currentTime + t.start;
  const peak = t.gain ?? 0.2;

  osc.type = t.type ?? 'sine';
  osc.frequency.setValueAtTime(t.freq, now);
  if (t.endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, t.endFreq), now + t.duration);
  }

  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, now + t.duration);

  osc.connect(env);
  env.connect(audio.destination);
  osc.start(now);
  osc.stop(now + t.duration + 0.02);
}

// A short burst of filtered noise — used for the "attack" swing.
function playNoise(audio: AudioContext, start: number, duration: number, gain: number): void {
  const now = audio.currentTime + start;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = audio.createBufferSource();
  src.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1800, now);
  filter.frequency.exponentialRampToValueAtTime(600, now + duration);
  filter.Q.value = 0.8;

  const env = audio.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(filter);
  filter.connect(env);
  env.connect(audio.destination);
  src.start(now);
  src.stop(now + duration + 0.02);
}

const RECIPES: Record<SoundName, (audio: AudioContext) => void> = {
  // Soft, quick wooden blip — a piece settling onto a square.
  move: (audio) => {
    playTone(audio, { freq: 440, endFreq: 660, type: 'triangle', start: 0, duration: 0.12, gain: 0.18 });
  },
  // Metallic swing: noise sweep plus a sharp ring.
  attack: (audio) => {
    playNoise(audio, 0, 0.18, 0.22);
    playTone(audio, { freq: 880, endFreq: 320, type: 'sawtooth', start: 0, duration: 0.2, gain: 0.16 });
  },
  // Tense, unresolved two-note clash — neither side breaks through.
  embattled: (audio) => {
    playTone(audio, { freq: 330, type: 'square', start: 0, duration: 0.16, gain: 0.13 });
    playTone(audio, { freq: 349, type: 'square', start: 0.04, duration: 0.22, gain: 0.13 });
  },
  // Descending, hollow fall — a piece is destroyed.
  death: (audio) => {
    playTone(audio, { freq: 400, endFreq: 90, type: 'sawtooth', start: 0, duration: 0.4, gain: 0.22 });
    playTone(audio, { freq: 200, endFreq: 60, type: 'sine', start: 0.02, duration: 0.45, gain: 0.18 });
  },
  // Bright rising arpeggio — victory.
  win: (audio) => {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      playTone(audio, { freq, type: 'triangle', start: i * 0.12, duration: 0.28, gain: 0.2 });
    });
  },
};

export function playSound(name: SoundName): void {
  if (muted) return;
  const audio = getCtx();
  if (!audio) return;
  try {
    RECIPES[name](audio);
  } catch {
    // never let audio errors break gameplay
  }
}
