/**
 * Two small guards, kept free of I/O so they can be tested without a browser or a database.
 *
 * A headless browser is the heaviest thing this app runs, so exports are protected twice (uploads and public share pages
 * reuse the rate window): a `Gate` bounds how many
 * documents render at once (and how many may wait), and a `RateWindow` bounds how often one person may ask.
 */

export class GateFull extends Error {
  constructor() {
    super("render queue is full");
    this.name = "GateFull";
  }
}

/** At most `limit` jobs run at once; up to `maxQueue` more wait their turn; the rest are refused immediately. */
export class Gate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly limit: number,
    private readonly maxQueue: number,
  ) {}

  get running() {
    return this.active;
  }
  get queued() {
    return this.waiting.length;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      if (this.waiting.length >= this.maxQueue) throw new GateFull();
      await new Promise<void>((resolve) => this.waiting.push(resolve)); // a finishing job hands its slot over
    } else {
      this.active += 1;
    }
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next)
        next(); // the slot passes straight to the next in line (active stays the same)
      else this.active -= 1;
    }
  }
}

/** A sliding window: `allow(key)` is true at most `max` times per `windowMs` for each key. */
export class RateWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5_000) this.sweep(now); // bounded memory: forget people who stopped asking
    return true;
  }

  private sweep(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
