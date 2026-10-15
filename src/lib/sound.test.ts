import { describe, expect, it } from "vitest";
import {
  createSoundService,
  MIN_REPEAT_MS,
  PEAK_GAIN,
  SOUND_NAMES,
  type AudioContextLike,
  type SoundEnv,
} from "./sound";

/** A recording stand-in for the Web Audio API: every oscillator and gain the service creates is captured. */
function fakeAudio() {
  const oscillators: Array<{ freq: number[]; started: number; stopped: number }> = [];
  const peaks: number[] = [];
  let resumed = 0;
  const ctx: AudioContextLike = {
    currentTime: 1,
    state: "suspended",
    destination: {},
    resume: async () => {
      resumed++;
    },
    createOscillator() {
      const rec = { freq: [] as number[], started: -1, stopped: -1 };
      oscillators.push(rec);
      return {
        type: "sine",
        frequency: {
          value: 0,
          setValueAtTime: (v: number) => void rec.freq.push(v),
          linearRampToValueAtTime: (v: number) => void rec.freq.push(v),
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
        start: (t = 0) => void (rec.started = t),
        stop: (t = 0) => void (rec.stopped = t),
      };
    },
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime: () => undefined,
          linearRampToValueAtTime: (v: number) => void peaks.push(v),
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      };
    },
  };
  return { ctx, oscillators, peaks, resumed: () => resumed };
}

function setup(over: Partial<SoundEnv> = {}) {
  const audio = fakeAudio();
  let clock = 1000;
  const env: SoundEnv = {
    createContext: () => audio.ctx,
    now: () => clock,
    prefersReducedMotion: () => false,
    ...over,
  };
  return {
    audio,
    service: createSoundService(env),
    tick: (ms: number) => void (clock += ms),
  };
}
const on = { enabled: true, volume: 50 };

describe("the sound service", () => {
  it("is silent until the person has interacted with the page", () => {
    const { service, audio } = setup();
    expect(service.play("select", on)).toBe(false);
    expect(audio.oscillators).toHaveLength(0);
    service.unlock();
    expect(service.play("select", on)).toBe(true);
    expect(audio.oscillators.length).toBeGreaterThan(0);
  });

  it("resumes a suspended audio context (the browser's autoplay rule) instead of forcing it", () => {
    const { service, audio } = setup();
    service.unlock();
    service.play("drop", on);
    expect(audio.resumed()).toBe(1);
  });

  it("does nothing when sounds are off or the volume is 0", () => {
    const { service, audio } = setup();
    service.unlock();
    expect(service.play("save", { enabled: false, volume: 50 })).toBe(false);
    expect(service.play("save", { enabled: true, volume: 0 })).toBe(false);
    expect(audio.oscillators).toHaveLength(0);
  });

  it("scales loudness with the volume, and stays quiet even at 100%", () => {
    const quiet = setup();
    quiet.service.unlock();
    quiet.service.play("save", { enabled: true, volume: 25 });
    const loud = setup();
    loud.service.unlock();
    loud.service.play("save", { enabled: true, volume: 100 });
    expect(loud.audio.peaks[0]!).toBeGreaterThan(quiet.audio.peaks[0]!);
    expect(Math.max(...loud.audio.peaks)).toBeLessThanOrEqual(PEAK_GAIN);
    // 25 % is a quarter of 100 %
    expect(quiet.audio.peaks[0]! / loud.audio.peaks[0]!).toBeCloseTo(0.25, 2);
  });

  it("does not repeat the same sound inside a few milliseconds, but other sounds are independent", () => {
    const { service, audio, tick } = setup();
    service.unlock();
    expect(service.play("select", on)).toBe(true);
    const made = audio.oscillators.length;
    expect(service.play("select", on)).toBe(false); // a held key is one cue, not a buzz
    expect(service.play("drop", on)).toBe(true);
    tick(MIN_REPEAT_MS + 1);
    expect(service.play("select", on)).toBe(true);
    expect(audio.oscillators.length).toBeGreaterThan(made);
  });

  it("skips ambient cues (lift, step) when reduced motion is preferred, but keeps the answers to actions", () => {
    const { service } = setup({ prefersReducedMotion: () => true });
    service.unlock();
    expect(service.play("lift", on)).toBe(false);
    expect(service.play("step", on)).toBe(false);
    expect(service.play("drop", on)).toBe(true);
    expect(service.play("save", on)).toBe(true);
  });

  it("carries on silently when audio is unavailable or throws", () => {
    const none = setup({ createContext: () => null });
    none.service.unlock();
    expect(none.service.play("save", on)).toBe(false);
    expect(none.service.ready).toBe(false);

    const throwing = setup({
      createContext: () => {
        throw new Error("no audio here");
      },
    });
    throwing.service.unlock();
    expect(() => throwing.service.play("save", on)).not.toThrow();
    expect(throwing.service.play("save", on)).toBe(false);
  });

  it("every named sound plays and is short", () => {
    for (const name of SOUND_NAMES) {
      const { service, audio } = setup();
      service.unlock();
      expect(service.play(name, on), name).toBe(true);
      const longest = Math.max(...audio.oscillators.map((o) => o.stopped - audio.ctx.currentTime));
      expect(longest, name).toBeLessThan(0.5); // half a second at the very most
    }
  });

  it("the save cue is the most noticeable, and the drag cue the quietest", () => {
    const peak = (name: (typeof SOUND_NAMES)[number]) => {
      const { service, audio } = setup();
      service.unlock();
      service.play(name, on);
      return Math.max(...audio.peaks);
    };
    expect(peak("save")).toBeGreaterThan(peak("select"));
    expect(peak("lift")).toBeLessThan(peak("select"));
  });
});
