// A tiny music-box synth on the Web Audio API. No audio files: every note is
// a sine plus a quiet triangle an octave up, with a soft echo behind it.
//
// The AudioContext is created lazily on the first start() (which the app calls
// from a user gesture) and never before, so nothing makes sound or trips the
// browser's autoplay rules on page load.

import { buildPhrase, PHRASE_BEATS, TEMPO, type MusicMood, type Note } from './phrases';

/** Master level while the narrator is quiet. */
export const MASTER_GAIN = 0.18;
/** Ducked level is master x this: about -12 dB. */
export const DUCK_FACTOR = 0.25;

const DUCK_RAMP_S = 0.3;
const FADE_IN_S = 0.6;
const FADE_OUT_S = 2;
const STOP_RAMP_S = 0.15;

/** The scheduler wakes every 100 ms and queues notes up to 0.5 s ahead. */
const TICK_MS = 100;
const LOOKAHEAD_S = 0.5;

/** Music-box voice. */
const ATTACK_S = 0.005;
const DECAY_S = 1.2;
const VOICE_PEAK = 0.5;
const OVERTONE_LEVEL = 0.25;
const SILENCE = 0.0001;

/** Echo: a feedback delay, mixed in quietly. */
const DELAY_S = 0.35;
const FEEDBACK = 0.25;
const ECHO_MIX = 0.35;

/** Gap before the first note of a (re)started phrase, so nothing is born late. */
const PHRASE_LEAD_S = 0.1;

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export class MusicEngine {
  private readonly ctxFactory: () => AudioContext;
  private ctx: AudioContext | null = null;
  private unavailable = false;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;

  private mood: MusicMood = 'adventure';
  private running = false;
  /** Paused because the page is hidden. */
  private suspended = false;
  private fadingOut = false;
  private ducked = false;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  private seed: number;
  private phrase: Note[] = [];
  private cursor = 0;
  private phraseStart = 0;
  private secPerBeat = 60 / TEMPO.adventure;

  /** Oscillators that may still be sounding or waiting to start. */
  private readonly voices = new Set<OscillatorNode>();

  constructor(ctxFactory: () => AudioContext, seed: number = randomSeed()) {
    this.ctxFactory = ctxFactory;
    this.seed = seed;
  }

  /** The master level the engine plays at when running (duck-aware). */
  get gainValue(): number {
    return this.ducked ? MASTER_GAIN * DUCK_FACTOR : MASTER_GAIN;
  }

  /** True between start() and stop() (or the end of a fade-out). */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Begin playing (or, if already playing, switch mood and make sure the
   * browser has let the audio through). Safe to call repeatedly.
   */
  start(mood: MusicMood): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const wasFading = this.fadingOut;
    this.cancelFadeOut();

    if (this.running) {
      if (wasFading) this.rampMaster(this.gainValue, FADE_IN_S);
      if (mood !== this.mood) this.setMood(mood);
      this.nudgeContext();
      return;
    }

    this.running = true;
    this.mood = mood;
    this.nudgeContext();
    this.beginPhrase(ctx.currentTime + PHRASE_LEAD_S);
    this.rampMaster(this.gainValue, FADE_IN_S);
    if (!this.suspended) this.startTicking();
  }

  /** Switch mood right away: the next notes use the new tempo and range. */
  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    // Drop the rest of the old phrase; the old notes already queued ring out.
    this.beginPhrase(ctx.currentTime + PHRASE_LEAD_S);
    if (!this.suspended) this.tick();
  }

  /** Stop for good (until the next start()): a quick fade, then silence. */
  stop(): void {
    this.cancelFadeOut();
    this.halt(STOP_RAMP_S);
  }

  /**
   * Lower (or restore) the music under the narrator. Idempotent. The flag is
   * remembered even while stopped, so duck(false) always restores full level.
   */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    if (this.running && !this.fadingOut) this.rampMaster(this.gainValue, DUCK_RAMP_S);
  }

  /** Fade to silence over ~2 s, then stop scheduling. start() brings it back. */
  fadeOut(): void {
    if (!this.running || this.fadingOut) return;
    this.fadingOut = true;
    this.rampMaster(0, FADE_OUT_S);
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      this.fadingOut = false;
      this.halt(0.02);
    }, FADE_OUT_S * 1000 + 50);
  }

  /** The page is hidden: stop scheduling and freeze the audio clock. */
  pause(): void {
    const ctx = this.ctx;
    if (!ctx || !this.running || this.suspended) return;
    this.suspended = true;
    this.stopTicking();
    this.settle(ctx.suspend());
  }

  /** The page is visible again: carry on from a fresh phrase, no catch-up burst. */
  resume(): void {
    const ctx = this.ctx;
    if (!ctx || !this.suspended) return;
    this.suspended = false;
    if (!this.running) return;
    this.settle(ctx.resume());
    this.beginPhrase(ctx.currentTime + PHRASE_LEAD_S);
    this.startTicking();
  }

  /* ---------------------------------------------------------------- */

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.unavailable) return null;
    try {
      const ctx = this.ctxFactory();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // Dry path and a quiet feedback echo, both into the master.
      const bus = ctx.createGain();
      const delay = ctx.createDelay(1);
      delay.delayTime.value = DELAY_S;
      const feedback = ctx.createGain();
      feedback.gain.value = FEEDBACK;
      const echo = ctx.createGain();
      echo.gain.value = ECHO_MIX;
      bus.connect(master);
      bus.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(echo);
      echo.connect(master);

      this.ctx = ctx;
      this.master = master;
      this.bus = bus;
      return ctx;
    } catch {
      // No Web Audio here: stay silent, and do not try again on every call.
      this.unavailable = true;
      return null;
    }
  }

  /** Ask a browser that held the context back (autoplay policy) to let it play. */
  private nudgeContext(): void {
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended' && !this.suspended) this.settle(ctx.resume());
  }

  /** Swallow the rejection of suspend()/resume(): audio is a nicety, never an error. */
  private settle(result: Promise<void> | undefined): void {
    void Promise.resolve(result).catch(() => undefined);
  }

  private cancelFadeOut(): void {
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    this.fadingOut = false;
  }

  /** Stop scheduling and silence everything. */
  private halt(rampSeconds: number): void {
    this.stopTicking();
    // A stop must not leave a later start() frozen by an earlier pause().
    this.suspended = false;
    if (!this.running) return;
    this.running = false;
    const ctx = this.ctx;
    if (!ctx) return;
    this.rampMaster(0, rampSeconds);
    const cutoff = ctx.currentTime + rampSeconds + 0.02;
    for (const voice of this.voices) {
      try {
        voice.stop(cutoff);
      } catch {
        // Already stopped.
      }
    }
    this.voices.clear();
  }

  private rampMaster(target: number, seconds: number): void {
    const ctx = this.ctx;
    const param = this.master?.gain;
    if (!ctx || !param) return;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + seconds);
  }

  private startTicking(): void {
    if (this.tickTimer === null) this.tickTimer = setInterval(this.tick, TICK_MS);
    this.tick();
  }

  private stopTicking(): void {
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private beginPhrase(startTime: number): void {
    this.secPerBeat = 60 / TEMPO[this.mood];
    this.phrase = buildPhrase(this.mood, this.seed);
    this.seed = (this.seed + 1) >>> 0;
    this.cursor = 0;
    this.phraseStart = startTime;
  }

  /** Queue every note that falls inside the look-ahead window. */
  private readonly tick = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.running || this.suspended) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD_S;

    // Fallen far behind (a starved timer): start fresh instead of catching up.
    if (this.phraseStart + PHRASE_BEATS * this.secPerBeat < now) {
      this.beginPhrase(now + PHRASE_LEAD_S);
    }

    while (this.phrase.length > 0) {
      if (this.cursor >= this.phrase.length) {
        const next = this.phraseStart + PHRASE_BEATS * this.secPerBeat;
        if (next >= horizon) break;
        this.beginPhrase(next);
        continue;
      }
      const note = this.phrase[this.cursor];
      const when = this.phraseStart + note.startBeat * this.secPerBeat;
      if (when >= horizon) break;
      this.cursor++;
      if (when >= now) this.playNote(note, when);
    }
  };

  /** One music-box note: sine + quiet octave-up triangle, plucked and left to fade. */
  private playNote(note: Note, when: number): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) return;

    const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
    const peak = Math.max(SILENCE * 10, note.velocity * VOICE_PEAK);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(SILENCE, when);
    envelope.gain.linearRampToValueAtTime(peak, when + ATTACK_S);
    envelope.gain.exponentialRampToValueAtTime(SILENCE, when + ATTACK_S + DECAY_S);
    envelope.connect(bus);

    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.value = freq;
    fundamental.connect(envelope);

    const overtone = ctx.createOscillator();
    overtone.type = 'triangle';
    overtone.frequency.value = freq * 2;
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = OVERTONE_LEVEL;
    overtone.connect(overtoneGain);
    overtoneGain.connect(envelope);

    const end = when + ATTACK_S + DECAY_S + 0.05;
    for (const osc of [fundamental, overtone]) {
      this.voices.add(osc);
      osc.onended = () => {
        this.voices.delete(osc);
        osc.disconnect();
      };
      osc.start(when);
      osc.stop(end);
    }
  }
}
