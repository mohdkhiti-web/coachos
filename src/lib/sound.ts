/**
 * The interaction sound service. A handful of very short, quiet tones synthesised with the Web Audio API — no audio files, so
 * there is nothing to download and nothing that can 404. Every sound is a single call, `play("drop")`, from an event handler;
 * components never touch audio nodes themselves.
 *
 * The rules it keeps (they are the whole point of a UI sound system that is not annoying):
 *  - it never makes a sound before the person has interacted with the page (browsers forbid it, and it would be rude);
 *  - it is silent when sounds are off, at volume 0, or when audio is unavailable — and never throws;
 *  - the same sound is not repeated inside a few milliseconds (a held key or a fast drag is one cue, not a buzz);
 *  - peak level is low even at 100%: at the default volume these sit well under speech and music.
 */
export const SOUND_NAMES = [
  "select",
  "lift",
  "drop",
  "duplicate",
  "delete",
  "undo",
  "redo",
  "save",
  "error",
  "play",
  "step",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

export { DEFAULT_SOUND_VOLUME, SOUND_VOLUMES } from "@/db/enums";
export type { SoundVolume } from "@/db/enums";

export interface SoundSettings {
  enabled: boolean;
  /** 0–100. */
  volume: number;
}

/** Sounds that are ambient rather than a direct answer to what the person just did: skipped when reduced motion is preferred. */
const AMBIENT: ReadonlySet<SoundName> = new Set(["lift", "step"]);

/** One note of a sound: frequency glide, when it starts (s), how long it lasts (s), relative loudness, waveform. */
interface Note {
  from: number;
  to?: number;
  at: number;
  length: number;
  gain: number;
  wave?: OscillatorType;
}

const RECIPES: Record<SoundName, readonly Note[]> = {
  select: [{ from: 880, to: 940, at: 0, length: 0.05, gain: 0.5, wave: "triangle" }],
  lift: [{ from: 420, to: 480, at: 0, length: 0.05, gain: 0.28, wave: "sine" }],
  drop: [{ from: 340, to: 220, at: 0, length: 0.085, gain: 0.75, wave: "sine" }],
  duplicate: [
    { from: 520, at: 0, length: 0.06, gain: 0.5, wave: "triangle" },
    { from: 700, at: 0.06, length: 0.07, gain: 0.5, wave: "triangle" },
  ],
  delete: [{ from: 300, to: 170, at: 0, length: 0.1, gain: 0.5, wave: "sine" }],
  undo: [{ from: 520, to: 420, at: 0, length: 0.07, gain: 0.45, wave: "triangle" }],
  redo: [{ from: 420, to: 520, at: 0, length: 0.07, gain: 0.45, wave: "triangle" }],
  save: [
    { from: 523, at: 0, length: 0.11, gain: 0.85, wave: "sine" },
    { from: 784, at: 0.1, length: 0.18, gain: 0.85, wave: "sine" },
  ],
  error: [
    { from: 233, at: 0, length: 0.1, gain: 0.7, wave: "triangle" },
    { from: 196, at: 0.12, length: 0.14, gain: 0.7, wave: "triangle" },
  ],
  play: [{ from: 440, to: 660, at: 0, length: 0.14, gain: 0.5, wave: "sine" }],
  step: [{ from: 600, at: 0, length: 0.035, gain: 0.22, wave: "sine" }],
};

/** The loudest a sound gets, as a fraction of full scale, when the volume is 100%. */
export const PEAK_GAIN = 0.26;
/** The shortest time between two plays of the SAME sound, in ms. */
export const MIN_REPEAT_MS = 45;

/** The slice of the Web Audio API the service uses — so a test can supply a recording fake. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}
interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
}
interface OscillatorLike {
  type: OscillatorType;
  frequency: ParamLike;
  connect(node: unknown): unknown;
  start(t?: number): void;
  stop(t?: number): void;
}
interface GainLike {
  gain: ParamLike;
  connect(node: unknown): unknown;
}

export interface SoundEnv {
  createContext(): AudioContextLike | null;
  now(): number;
  prefersReducedMotion(): boolean;
}

const browserEnv: SoundEnv = {
  createContext() {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
  },
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  prefersReducedMotion: () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
};

export interface SoundService {
  /** Mark that the person has interacted with the page: from now on sounds may play. Safe to call any number of times. */
  unlock(): void;
  play(name: SoundName, settings: SoundSettings): boolean;
  /** Has audio been unlocked and is it available? */
  readonly ready: boolean;
}

/** A sound service over the given environment (the browser by default). One per page is enough. */
export function createSoundService(env: SoundEnv = browserEnv): SoundService {
  let ctx: AudioContextLike | null = null;
  let unlocked = false;
  let unavailable = false;
  const last = new Map<SoundName, number>();

  function context(): AudioContextLike | null {
    if (unavailable) return null;
    if (ctx) return ctx;
    try {
      ctx = env.createContext();
    } catch {
      ctx = null;
    }
    if (!ctx) unavailable = true;
    return ctx;
  }

  return {
    get ready() {
      return unlocked && !unavailable;
    },
    unlock() {
      unlocked = true;
    },
    play(name, settings) {
      // never before a first interaction; never when off or muted by volume
      if (!unlocked || !settings.enabled || settings.volume <= 0) return false;
      if (AMBIENT.has(name) && env.prefersReducedMotion()) return false;
      const t = env.now();
      const before = last.get(name);
      if (before !== undefined && t - before < MIN_REPEAT_MS) return false;
      const audio = context();
      if (!audio) return false;
      last.set(name, t);
      try {
        if (audio.state === "suspended") void audio.resume().catch(() => undefined);
        const level = Math.min(100, settings.volume) / 100;
        const start = audio.currentTime;
        for (const note of RECIPES[name]) {
          const osc = audio.createOscillator();
          const amp = audio.createGain();
          osc.type = note.wave ?? "sine";
          const begin = start + note.at;
          const end = begin + note.length;
          osc.frequency.setValueAtTime(note.from, begin);
          if (note.to) osc.frequency.linearRampToValueAtTime(note.to, end);
          // a 6 ms fade in and an exponential fade out: no click at either end
          const peak = Math.max(0.0002, PEAK_GAIN * level * note.gain);
          amp.gain.setValueAtTime(0.0001, begin);
          amp.gain.linearRampToValueAtTime(peak, begin + 0.006);
          amp.gain.exponentialRampToValueAtTime(0.0001, end);
          osc.connect(amp);
          amp.connect(audio.destination);
          osc.start(begin);
          osc.stop(end + 0.02);
        }
        return true;
      } catch {
        unavailable = true; // whatever went wrong, the app carries on silently
        return false;
      }
    },
  };
}

/** The page-wide service. */
export const sound = createSoundService();
