// Lightweight Web Audio sound engine for Nerd Chess.
// Synthesizes short, characterful battle sounds on demand — no audio assets to
// load. Voices are layered/detuned for body, noise transients add impact, and a
// shared convolution reverb gives everything a sense of space. Each play spins
// up fresh nodes, so rapid repeated triggers never cut each other off.

export type SoundName = 'move' | 'attack' | 'embattled' | 'death' | 'win';

const MUTE_KEY = 'nerd-chess-muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === 'true';
} catch {
  // ignore storage failures
}

// A short, smooth decaying-noise impulse response for the convolution reverb.
function makeImpulse(audio: AudioContext, duration: number, decay: number): AudioBuffer {
  const rate = audio.sampleRate;
  const len = Math.max(1, Math.floor(rate * duration));
  const buf = audio.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    // Master bus -> soft limiter -> speakers, so overlapping hits stay clean.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);

    // Parallel reverb send for spatial depth.
    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 1.1, 2.6);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.55;
    reverb.connect(wetGain);
    wetGain.connect(comp);
  }
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

// Route a finished voice to the dry master bus and, optionally, the reverb send.
function connectOut(audio: AudioContext, node: AudioNode, wet: number): void {
  if (master) node.connect(master);
  if (wet > 0 && reverb) {
    const send = audio.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(reverb);
  }
}

interface Tone {
  freq: number;          // starting frequency (Hz)
  endFreq?: number;      // optional glide target
  type?: OscillatorType;
  start?: number;        // seconds, relative to play time
  duration: number;      // seconds
  gain?: number;         // peak gain (0-1)
  attack?: number;       // attack time (s)
  voices?: number;       // stacked detuned oscillators for thickness
  detune?: number;       // total detune spread across voices (cents)
  wet?: number;          // reverb send amount (0-1)
}

function tone(audio: AudioContext, t: Tone): void {
  const now = audio.currentTime + (t.start ?? 0);
  const peak = t.gain ?? 0.2;
  const attack = t.attack ?? 0.008;
  const voices = t.voices ?? 1;

  const env = audio.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(peak, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + t.duration);

  for (let v = 0; v < voices; v++) {
    const osc = audio.createOscillator();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, now);
    if (t.endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, t.endFreq), now + t.duration);
    }
    if (voices > 1 && t.detune) {
      osc.detune.setValueAtTime((v - (voices - 1) / 2) * (t.detune / Math.max(1, voices - 1)), now);
    }
    osc.connect(env);
    osc.start(now);
    osc.stop(now + t.duration + 0.05);
  }

  connectOut(audio, env, t.wet ?? 0);
}

interface Noise {
  start?: number;
  duration: number;
  gain?: number;
  filter?: BiquadFilterType;
  f0?: number;           // filter freq start
  f1?: number;           // filter freq end (sweep)
  q?: number;
  wet?: number;
}

function noise(audio: AudioContext, n: Noise): void {
  const now = audio.currentTime + (n.start ?? 0);
  const frames = Math.max(1, Math.floor(audio.sampleRate * n.duration));
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = audio.createBufferSource();
  src.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = n.filter ?? 'bandpass';
  const f0 = n.f0 ?? 1800;
  const f1 = n.f1 ?? f0;
  filter.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + n.duration);
  filter.Q.value = n.q ?? 0.8;

  const env = audio.createGain();
  const peak = n.gain ?? 0.2;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(peak, now + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, now + n.duration);

  src.connect(filter);
  filter.connect(env);
  connectOut(audio, env, n.wet ?? 0);
  src.start(now);
  src.stop(now + n.duration + 0.05);
}

const RECIPES: Record<SoundName, (audio: AudioContext) => void> = {
  // Piece settling onto a square: a soft woody "tock" with a faint tap transient.
  move: (audio) => {
    tone(audio, { freq: 210, endFreq: 125, type: 'triangle', duration: 0.13, gain: 0.16, attack: 0.004 });
    noise(audio, { duration: 0.035, gain: 0.07, filter: 'lowpass', f0: 2600, f1: 800, q: 0.5 });
  },
  // Steel-on-steel clash: a swipe of bright noise plus an inharmonic ringing edge.
  attack: (audio) => {
    noise(audio, { duration: 0.12, gain: 0.16, filter: 'bandpass', f0: 3600, f1: 1200, q: 0.7, wet: 0.18 });
    tone(audio, { freq: 1760, endFreq: 760, type: 'sawtooth', duration: 0.2, gain: 0.1, voices: 2, detune: 22, wet: 0.28 });
    tone(audio, { freq: 2640, type: 'square', duration: 0.09, gain: 0.045, wet: 0.28 });
  },
  // Locked standoff: two detuned low voices beat against each other over a rumble — unresolved.
  embattled: (audio) => {
    tone(audio, { freq: 155, type: 'sawtooth', duration: 0.5, gain: 0.1, voices: 2, detune: 10, wet: 0.22 });
    tone(audio, { freq: 164, type: 'square', start: 0.02, duration: 0.46, gain: 0.06, wet: 0.22 });
    noise(audio, { duration: 0.5, gain: 0.04, filter: 'lowpass', f0: 320, f1: 130, q: 0.4 });
  },
  // A piece destroyed: a punchy low thud, a descending wail, and a crunchy impact.
  death: (audio) => {
    tone(audio, { freq: 220, endFreq: 42, type: 'sine', duration: 0.5, gain: 0.26, attack: 0.003, wet: 0.22 });
    tone(audio, { freq: 330, endFreq: 70, type: 'sawtooth', start: 0.01, duration: 0.4, gain: 0.12, wet: 0.22 });
    noise(audio, { duration: 0.16, gain: 0.14, filter: 'lowpass', f0: 1400, f1: 200, q: 0.6, wet: 0.22 });
  },
  // Victory: a rising major arpeggio resolving into a sustained chord with a bell shimmer.
  win: (audio) => {
    const arp = [392.0, 523.25, 659.25, 783.99]; // G4 C5 E5 G5
    arp.forEach((freq, i) => {
      tone(audio, { freq, type: 'triangle', start: i * 0.1, duration: 0.3, gain: 0.16, voices: 2, detune: 7, wet: 0.3 });
    });
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    chord.forEach((freq) => {
      tone(audio, { freq, type: 'triangle', start: 0.42, duration: 0.7, gain: 0.11, voices: 2, detune: 6, wet: 0.4 });
    });
    tone(audio, { freq: 2093, type: 'sine', start: 0.42, duration: 0.8, gain: 0.05, wet: 0.5 });
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

// ---------------------------------------------------------------------------
// Background music: a looping 8-bit chiptune sequence, synthesized live with
// the same square/triangle voices as the SFX. No files, seamless loop. Music
// has its own bus and on/off preference, independent of the SFX mute.
// ---------------------------------------------------------------------------

const MUSIC_KEY = 'nerd-chess-music';
const MUSIC_LEVEL = 0.14;          // music sits gently under the SFX
const BPM = 132;
const STEP = 60 / BPM / 4;         // one sixteenth note, in seconds
const LOOKAHEAD = 0.2;             // schedule this far ahead (s)

let musicEnabled = false;          // persisted user preference
let musicPlaying = false;          // is the scheduler actually running
let musicBus: GainNode | null = null;
let musicTimer: number | null = null;
let nextStepTime = 0;
let stepIndex = 0;
let autoStartHandler: (() => void) | null = null;

try {
  musicEnabled = localStorage.getItem(MUSIC_KEY) === 'true';
} catch {
  // ignore storage failures
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// vi–IV–I–V progression (Am F C G), one bar each — a classic heroic loop.
const PROG = [
  { bass: 45, tones: [69, 72, 76, 81] }, // Am  (A2 | A4 C5 E5 A5)
  { bass: 41, tones: [65, 69, 72, 77] }, // F   (F2 | F4 A4 C5 F5)
  { bass: 48, tones: [72, 76, 79, 84] }, // C   (C3 | C5 E5 G5 C6)
  { bass: 43, tones: [67, 71, 74, 79] }, // G   (G2 | G4 B4 D5 G5)
];

// 16 sixteenth-steps of melody per bar (index into chord tones; -1 = rest).
const MELODY = [0, 2, 1, 3, 2, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3, -1];

function buildMusicBus(audio: AudioContext): void {
  if (musicBus || !master) return;
  const lp = audio.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;       // soften harsh square edges -> "tinny", not piercing
  lp.Q.value = 0.3;
  musicBus = audio.createGain();
  musicBus.gain.value = 0.0001;
  musicBus.connect(lp);
  lp.connect(master);
  if (reverb) {
    const send = audio.createGain();
    send.gain.value = 0.12;
    lp.connect(send);
    send.connect(reverb);
  }
}

function musicNote(audio: AudioContext, freq: number, time: number, dur: number, type: OscillatorType, gain: number): void {
  if (!musicBus) return;
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(gain, time + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(env);
  env.connect(musicBus);
  osc.start(time);
  osc.stop(time + dur + 0.03);
}

function scheduleStep(audio: AudioContext, index: number, time: number): void {
  const bar = Math.floor(index / 16) % PROG.length;
  const s = index % 16;
  const chord = PROG[bar];
  // Bass: a triangle root on every quarter note.
  if (s % 4 === 0) {
    musicNote(audio, midi(chord.bass), time, STEP * 3.5, 'triangle', 0.2);
  }
  // Melody: a square-wave arpeggio.
  const mi = MELODY[s];
  if (mi >= 0) {
    musicNote(audio, midi(chord.tones[mi]), time, STEP * 0.9, 'square', 0.1);
    // A soft octave-up sparkle on the upbeats for shimmer.
    if (s % 4 === 2) {
      musicNote(audio, midi(chord.tones[mi] + 12), time, STEP * 0.5, 'square', 0.03);
    }
  }
}

function scheduler(): void {
  if (!ctx || !musicPlaying) return;
  // Background tabs throttle setInterval, so ctx.currentTime can race far ahead.
  // Skip the missed steps (keeping the bar position aligned) so we don't dump a
  // burst of overlapping past-timestamped notes when the tab regains focus.
  if (nextStepTime < ctx.currentTime) {
    const missed = Math.ceil((ctx.currentTime - nextStepTime) / STEP);
    stepIndex += missed;
    nextStepTime += missed * STEP;
  }
  while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(ctx, stepIndex, nextStepTime);
    nextStepTime += STEP;
    stepIndex++;
  }
}

export function startMusic(): void {
  const audio = getCtx();
  if (!audio || musicPlaying) return;
  buildMusicBus(audio);
  if (!musicBus) return;
  // Defensive: never let a stale interval survive into a new playback.
  if (musicTimer != null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  musicPlaying = true;
  stepIndex = 0;
  nextStepTime = audio.currentTime + 0.1;
  musicBus.gain.cancelScheduledValues(audio.currentTime);
  musicBus.gain.setValueAtTime(0.0001, audio.currentTime);
  musicBus.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, audio.currentTime + 0.8);
  musicTimer = window.setInterval(scheduler, 25);
  scheduler();
}

export function stopMusic(): void {
  if (!musicPlaying) return;
  musicPlaying = false;
  if (musicTimer != null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (ctx && musicBus) {
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now);
    musicBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  }
}

export function isMusicOn(): boolean {
  return musicEnabled;
}

export function toggleMusic(): boolean {
  // An explicit toggle is authoritative — drop any pending auto-start.
  clearAutoStart();
  musicEnabled = !musicEnabled;
  try {
    localStorage.setItem(MUSIC_KEY, musicEnabled ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
  if (musicEnabled) startMusic();
  else stopMusic();
  return musicEnabled;
}

function clearAutoStart(): void {
  if (typeof window === 'undefined' || !autoStartHandler) return;
  window.removeEventListener('pointerdown', autoStartHandler);
  window.removeEventListener('keydown', autoStartHandler);
  autoStartHandler = null;
}

// If music was left on in a previous session, resume on the first user gesture
// (browsers block audio until the user interacts).
export function initMusicAutoStart(): void {
  if (typeof window === 'undefined' || !musicEnabled) return;
  clearAutoStart(); // never stack listeners (StrictMode double-mount / re-init)
  const handler = () => {
    clearAutoStart();
    if (musicEnabled) startMusic();
  };
  autoStartHandler = handler;
  window.addEventListener('pointerdown', handler);
  window.addEventListener('keydown', handler);
}

// Hot Module Replacement: when this module is swapped during development, tear
// down the old audio graph and its scheduler so a stale loop can't keep playing
// alongside the freshly-loaded module (the classic "two songs at once" bug).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopMusic();
    clearAutoStart();
    try {
      ctx?.close();
    } catch {
      // ignore — context may already be closing
    }
  });
}
