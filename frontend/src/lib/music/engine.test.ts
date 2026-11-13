import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicEngine } from './engine';
import { PHRASE_BEATS, TEMPO } from './phrases';

/* ---------- A hand-written fake of the slice of Web Audio the engine uses ---------- */

class FakeParam {
  value: number;
  /** Final value of every ramp is applied immediately: tests read the target. */
  ramps: Array<{ kind: 'linear' | 'exp'; value: number; endTime: number }> = [];
  sets: Array<{ value: number; time: number }> = [];
  cancels = 0;
  constructor(initial = 0) {
    this.value = initial;
  }
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.sets.push({ value: v, time: t });
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.ramps.push({ kind: 'linear', value: v, endTime: t });
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.ramps.push({ kind: 'exp', value: v, endTime: t });
    return this;
  }
  cancelScheduledValues() {
    this.cancels++;
    return this;
  }
}

class FakeNode {
  connections: FakeNode[] = [];
  connect(dest: FakeNode) {
    this.connections.push(dest);
    return dest;
  }
  disconnect() {
    this.connections = [];
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeDelay extends FakeNode {
  delayTime = new FakeParam(0);
}

class FakeOsc extends FakeNode {
  type: OscillatorType = 'sine';
  frequency = new FakeParam(440);
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  start(t: number) {
    this.startedAt = t;
  }
  stop(t: number) {
    this.stoppedAt = t;
  }
}

class FakeContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  delays: FakeDelay[] = [];
  oscs: FakeOsc[] = [];
  suspendCalls = 0;
  resumeCalls = 0;
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createDelay() {
    const d = new FakeDelay();
    this.delays.push(d);
    return d;
  }
  createOscillator() {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  suspend() {
    this.suspendCalls++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  resume() {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }
}

/* ---------- Helpers ---------- */

const MASTER = 0.18;
const DUCKED = 0.18 * 0.25;

function setup(seed = 7) {
  const ctx = new FakeContext();
  const factory = vi.fn(() => ctx as unknown as AudioContext);
  const engine = new MusicEngine(factory, seed);
  /** The master gain is the one wired straight into the destination. */
  const master = () => ctx.gains.find((g) => g.connections.includes(ctx.destination))!;
  /** Advance the audio clock and the 100 ms scheduler together. */
  const run = (seconds: number) => {
    const steps = Math.round(seconds / 0.1);
    for (let i = 0; i < steps; i++) {
      ctx.currentTime += 0.1;
      vi.advanceTimersByTime(100);
    }
  };
  return { ctx, factory, engine, master, run };
}

/** MIDI note of a sine oscillator (the fundamental of each music-box voice). */
const midiOf = (o: FakeOsc) => Math.round(69 + 12 * Math.log2(o.frequency.value / 440));
const fundamentals = (ctx: FakeContext) => ctx.oscs.filter((o) => o.type === 'sine');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('MusicEngine gain and ducking', () => {
  it('plays at master gain 0.18 and ducks to a quarter of it over 0.3 s', () => {
    const { ctx, engine, master } = setup();
    engine.start('lullaby');
    expect(engine.gainValue).toBeCloseTo(MASTER);
    expect(master().gain.value).toBeCloseTo(MASTER);

    ctx.currentTime = 10;
    engine.duck(true);
    expect(engine.gainValue).toBeCloseTo(DUCKED);
    expect(DUCKED / MASTER).toBeCloseTo(0.25); // about -12 dB
    expect(master().gain.value).toBeCloseTo(DUCKED);
    const ramp = master().gain.ramps.at(-1)!;
    expect(ramp.endTime).toBeCloseTo(10.3);

    engine.duck(false);
    expect(engine.gainValue).toBeCloseTo(MASTER);
    expect(master().gain.value).toBeCloseTo(MASTER);
  });

  it('duck() is idempotent', () => {
    const { engine, master } = setup();
    engine.start('lullaby');
    engine.duck(true);
    const rampsAfterFirst = master().gain.ramps.length;
    engine.duck(true);
    engine.duck(true);
    expect(master().gain.ramps.length).toBe(rampsAfterFirst);
    expect(engine.gainValue).toBeCloseTo(DUCKED);

    engine.duck(false);
    const rampsAfterRestore = master().gain.ramps.length;
    engine.duck(false);
    expect(master().gain.ramps.length).toBe(rampsAfterRestore);
    expect(engine.gainValue).toBeCloseTo(MASTER);
  });

  it('duck(false) restores gain after stop', () => {
    const { engine, master } = setup();
    engine.start('adventure');
    engine.duck(true);
    expect(engine.gainValue).toBeCloseTo(DUCKED);

    engine.stop();
    engine.duck(false);
    expect(engine.gainValue).toBeCloseTo(MASTER);

    // And the next start plays at full master level, not the stale ducked level.
    engine.start('adventure');
    expect(master().gain.value).toBeCloseTo(MASTER);
  });

  it('a ducked engine that is stopped and restarted while the narrator talks stays ducked', () => {
    const { engine, master } = setup();
    engine.start('adventure');
    engine.duck(true);
    engine.stop();
    engine.start('adventure');
    expect(master().gain.value).toBeCloseTo(DUCKED);
  });

  it('duck() before start is remembered but does not create the audio context', () => {
    const { factory, engine } = setup();
    engine.duck(true);
    expect(factory).not.toHaveBeenCalled();
    expect(engine.gainValue).toBeCloseTo(DUCKED);
  });
});

describe('MusicEngine voice and effects', () => {
  it('builds a feedback delay of about 0.35 s with 0.25 feedback', () => {
    const { ctx, engine } = setup();
    engine.start('lullaby');
    expect(ctx.delays).toHaveLength(1);
    const delay = ctx.delays[0];
    expect(delay.delayTime.value).toBeCloseTo(0.35);
    const feedback = ctx.gains.find(
      (g) => g.connections.includes(delay) && delay.connections.includes(g)
    );
    expect(feedback).toBeDefined();
    expect(feedback!.gain.value).toBeCloseTo(0.25);
  });

  it('each note is a sine plus a quiet triangle an octave up, with a 5 ms attack and ~1.2 s decay', () => {
    const { ctx, engine } = setup();
    engine.start('lullaby');
    const sine = ctx.oscs.find((o) => o.type === 'sine')!;
    const tri = ctx.oscs.find((o) => o.type === 'triangle')!;
    expect(sine).toBeDefined();
    expect(tri).toBeDefined();
    // The first note's two oscillators are created back to back.
    const pairStart = ctx.oscs.indexOf(sine);
    const partner = ctx.oscs[pairStart + 1];
    expect(partner.type).toBe('triangle');
    expect(partner.frequency.value).toBeCloseTo(sine.frequency.value * 2);

    // Triangle runs through a quiet gain; both feed one envelope.
    const triGain = partner.connections[0] as FakeGain;
    expect(triGain.gain.value).toBeLessThan(0.5);
    const env = sine.connections[0] as FakeGain;
    expect(triGain.connections).toContain(env);

    const t0 = sine.startedAt!;
    const [attack, decay] = env.gain.ramps;
    expect(attack.kind).toBe('linear');
    expect(attack.endTime - t0).toBeCloseTo(0.005, 5);
    expect(decay.kind).toBe('exp');
    expect(decay.endTime - attack.endTime).toBeCloseTo(1.2, 5);
    expect(decay.value).toBeLessThan(0.001);
    expect(sine.stoppedAt!).toBeGreaterThan(decay.endTime);
  });
});

describe('MusicEngine scheduler', () => {
  it('schedules notes at most 0.5 s ahead and never in the past', () => {
    const { ctx, engine, run } = setup();
    engine.start('adventure');
    let seen = 0;
    for (let i = 0; i < 100; i++) {
      run(0.1);
      for (const o of ctx.oscs.slice(seen)) {
        expect(o.startedAt!).toBeLessThanOrEqual(ctx.currentTime + 0.5 + 1e-9);
        expect(o.startedAt!).toBeGreaterThanOrEqual(ctx.currentTime - 0.1 - 1e-9);
      }
      seen = ctx.oscs.length;
    }
    expect(fundamentals(ctx).length).toBeGreaterThan(20);
  });

  it('keeps time to the mood tempo: a lullaby phrase spans 8 s, adventure 8 beats at 90 bpm', () => {
    for (const mood of ['lullaby', 'adventure'] as const) {
      const { ctx, engine, run } = setup();
      engine.start(mood);
      run(40);
      const starts = fundamentals(ctx).map((o) => o.startedAt!);
      // Notes land on the beat grid (eighth-note subdivisions at the very least).
      const spb = 60 / TEMPO[mood];
      const origin = starts[0];
      starts.forEach((t) => {
        const beats = (t - origin) / spb;
        expect(Math.abs(beats * 4 - Math.round(beats * 4))).toBeLessThan(1e-6);
      });
      // Phrases chain without a gap: some note starts in every phrase-length window.
      const phrase = PHRASE_BEATS * spb;
      const lastStart = Math.max(...starts);
      expect(lastStart).toBeGreaterThan(origin + phrase * 3);
    }
  });

  it('starts a different phrase each cycle', () => {
    const { ctx, engine, run } = setup(100);
    engine.start('lullaby');
    run(40);
    const spb = 60 / TEMPO.lullaby;
    const origin = fundamentals(ctx)[0].startedAt!;
    const byPhrase = new Map<number, string[]>();
    for (const o of fundamentals(ctx)) {
      const idx = Math.floor((o.startedAt! - origin) / (PHRASE_BEATS * spb) + 1e-9);
      byPhrase.set(idx, [...(byPhrase.get(idx) ?? []), `${(o.startedAt! - origin).toFixed(3)}:${midiOf(o)}`]);
    }
    // Compare phrase shapes (note, offset within the phrase) across cycles.
    const shapes = [...byPhrase.entries()].map(([idx, notes]) =>
      notes.map((n) => {
        const [t, m] = n.split(':');
        return `${(Number(t) - idx * PHRASE_BEATS * spb).toFixed(2)}:${m}`;
      }).join(',')
    );
    expect(shapes.length).toBeGreaterThanOrEqual(4);
    expect(new Set(shapes).size).toBeGreaterThan(shapes.length - 2);
  });

  it('stop() halts scheduling and silences voices that have not played yet', () => {
    const { ctx, engine, master, run } = setup();
    engine.start('adventure');
    run(2);
    const count = ctx.oscs.length;
    ctx.currentTime += 0.05;
    engine.stop();
    expect(master().gain.value).toBe(0);
    run(5);
    expect(ctx.oscs.length).toBe(count);
    // Every voice is cut off promptly (within a fraction of a second of the stop).
    ctx.oscs.forEach((o) => {
      expect(o.stoppedAt!).toBeLessThanOrEqual(ctx.currentTime - 5 + 0.3);
    });
  });

  it('start() is idempotent while running and creates the context once', () => {
    const once = setup();
    once.engine.start('adventure');
    once.run(2);

    const thrice = setup();
    thrice.engine.start('adventure');
    thrice.engine.start('adventure');
    thrice.engine.start('adventure');
    thrice.run(2);

    expect(thrice.factory).toHaveBeenCalledTimes(1);
    // Same seed, same time: repeated start() calls must not add notes or schedulers.
    expect(thrice.ctx.oscs.length).toBe(once.ctx.oscs.length);
    expect(thrice.ctx.oscs.map((o) => o.startedAt)).toEqual(once.ctx.oscs.map((o) => o.startedAt));
  });

  it('setMood switches live to the slower, lower lullaby', () => {
    const { ctx, engine, run } = setup();
    engine.start('adventure');
    run(6);
    ctx.currentTime += 0.05;
    engine.setMood('lullaby');
    const switchedAt = ctx.currentTime;
    run(40);

    // Skip the few notes already queued under the old mood (<= 0.5 s ahead).
    const after = fundamentals(ctx).filter((o) => o.startedAt! >= switchedAt + 0.6);
    expect(after.length).toBeGreaterThan(5);
    after.forEach((o) => expect(midiOf(o)).toBeLessThanOrEqual(72));
    // 60 bpm: no two lullaby notes closer than half a beat (0.5 s).
    const times = [...new Set(after.map((o) => o.startedAt!))].sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.5 - 1e-6);
  });

  it('start(mood) while running in another mood switches the mood', () => {
    const { ctx, engine, run } = setup();
    engine.start('adventure');
    run(2);
    engine.start('lullaby');
    const switchedAt = ctx.currentTime;
    run(30);
    const after = fundamentals(ctx).filter((o) => o.startedAt! >= switchedAt + 0.6);
    expect(after.length).toBeGreaterThan(3);
    after.forEach((o) => expect(midiOf(o)).toBeLessThanOrEqual(72));
  });
});

describe('MusicEngine fadeOut', () => {
  it('ramps master gain to 0 over ~2 s, then stops scheduling', () => {
    const { ctx, engine, master, run } = setup();
    engine.start('lullaby');
    run(1);
    ctx.currentTime = 5;
    engine.fadeOut();
    const ramp = master().gain.ramps.at(-1)!;
    expect(ramp.value).toBe(0);
    expect(ramp.endTime).toBeCloseTo(7, 5);

    run(1.5); // still fading: still scheduling
    const midFade = ctx.oscs.length;
    expect(midFade).toBeGreaterThan(0);

    run(1); // past 2 s: halted
    const afterFade = ctx.oscs.length;
    run(10);
    expect(ctx.oscs.length).toBe(afterFade);
    expect(engine.isRunning).toBe(false);
  });

  it('toggling music back on afterwards restarts normally', () => {
    const { ctx, engine, master, run } = setup();
    engine.start('lullaby');
    run(1);
    engine.fadeOut();
    run(3);
    const silent = ctx.oscs.length;

    engine.start('lullaby');
    expect(engine.isRunning).toBe(true);
    expect(master().gain.value).toBeCloseTo(MASTER);
    run(10);
    expect(ctx.oscs.length).toBeGreaterThan(silent);
  });

  it('start() during the fade cancels the pending halt', () => {
    const { ctx, engine, master, run } = setup();
    engine.start('lullaby');
    run(1);
    engine.fadeOut();
    run(1);
    engine.start('lullaby');
    run(5);
    expect(engine.isRunning).toBe(true);
    expect(master().gain.value).toBeCloseTo(MASTER);
    const n = ctx.oscs.length;
    run(3);
    expect(ctx.oscs.length).toBeGreaterThan(n);
  });

  it('does not let duck() fight the fade', () => {
    const { engine, master, run } = setup();
    engine.start('lullaby');
    engine.fadeOut();
    engine.duck(true);
    run(0.5);
    expect(master().gain.value).toBe(0);
  });
});

describe('MusicEngine page visibility', () => {
  it('pause() stops scheduling and suspends the clock; resume() picks up without a burst', () => {
    const { ctx, engine, run } = setup();
    engine.start('adventure');
    run(2);
    const before = ctx.oscs.length;

    engine.pause();
    expect(ctx.suspendCalls).toBe(1);
    // A hidden tab: timers may fire, but nothing may be scheduled.
    vi.advanceTimersByTime(5000);
    expect(ctx.oscs.length).toBe(before);

    // Time passes (clock jumps, as when a tab is throttled), then the tab is shown.
    ctx.currentTime += 120;
    engine.resume();
    expect(ctx.resumeCalls).toBeGreaterThan(0);
    const resumeAt = ctx.currentTime;
    run(0.5);
    const burst = ctx.oscs.slice(before);
    expect(burst.length).toBeGreaterThan(0);
    expect(burst.length).toBeLessThan(40);
    burst.forEach((o) => {
      expect(o.startedAt!).toBeGreaterThanOrEqual(resumeAt - 1e-9);
    });
  });

  it('a lagging timer drops notes that are already in the past instead of piling them up', () => {
    const { ctx, engine, run } = setup();
    engine.start('adventure');
    run(1);
    const before = ctx.oscs.length;
    ctx.currentTime += 60; // the scheduler was starved for a minute
    vi.advanceTimersByTime(100);
    const added = ctx.oscs.length - before;
    expect(added).toBeLessThan(20);
    ctx.oscs.slice(before).forEach((o) => {
      expect(o.startedAt!).toBeGreaterThanOrEqual(ctx.currentTime - 1e-9);
    });
  });

  it('resume() after stop() does not restart the music', () => {
    const { ctx, engine } = setup();
    engine.start('adventure');
    engine.pause();
    engine.stop();
    engine.resume();
    const n = ctx.oscs.length;
    vi.advanceTimersByTime(3000);
    expect(ctx.oscs.length).toBe(n);
    expect(engine.isRunning).toBe(false);
  });

  it('a stop() while paused does not leave the next start() muted', () => {
    const { ctx, engine, run } = setup();
    engine.start('adventure');
    engine.pause();
    engine.stop();
    engine.start('adventure');
    const n = ctx.oscs.length;
    run(2);
    expect(ctx.oscs.length).toBeGreaterThan(n);
    expect(ctx.state).toBe('running');
  });

  it('pause() before start is a no-op', () => {
    const { ctx, engine } = setup();
    engine.pause();
    engine.resume();
    expect(ctx.suspendCalls).toBe(0);
  });
});

describe('MusicEngine without Web Audio', () => {
  it('is a silent no-op when the context cannot be created', () => {
    const factory = vi.fn(() => {
      throw new Error('AudioContext is not supported');
    });
    const engine = new MusicEngine(factory);
    expect(() => {
      engine.start('lullaby');
      engine.setMood('adventure');
      engine.duck(true);
      engine.pause();
      engine.resume();
      engine.fadeOut();
      engine.stop();
      engine.duck(false);
    }).not.toThrow();
    expect(engine.isRunning).toBe(false);
    expect(engine.gainValue).toBeCloseTo(MASTER);
    // It does not hammer the factory on every call.
    engine.start('lullaby');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('does not create the audio context on construction', () => {
    const factory = vi.fn(() => new FakeContext() as unknown as AudioContext);
    new MusicEngine(factory);
    expect(factory).not.toHaveBeenCalled();
  });
});
