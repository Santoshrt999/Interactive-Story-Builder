// A tiny sentence queue for speech synthesis. Framework-free and DOM-free at
// import time so it can be tested with a fake synth.

/** The slice of `speechSynthesis` the queue needs. */
export interface SynthLike {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}

/** Narrator voice tuning. Bedtime is slower and softer. */
export function narratorVoice(bedtime: boolean): { rate: number; pitch: number } {
  return bedtime ? { rate: 0.72, pitch: 1.05 } : { rate: 0.85, pitch: 1.15 };
}

/**
 * Speaks one utterance at a time, in order. A story arrives one sentence every
 * few milliseconds but takes seconds to read aloud, so sentences wait their
 * turn instead of cancelling each other: `enqueue` never cancels. Only `clear`
 * (a new chapter, mute, leaving) drops what is waiting.
 */
export class SpeechQueue {
  /** Fires only when the queue goes from idle to busy or back. */
  onSpeakingChange?: (speaking: boolean) => void;

  private readonly synth: SynthLike;
  private readonly makeUtterance: (text: string) => SpeechSynthesisUtterance;
  private readonly pending: string[] = [];
  /**
   * The utterance being spoken. Holding it also keeps Chrome from garbage
   * collecting it before `onend` fires. Callbacks from any other (cancelled)
   * utterance are stale and ignored.
   */
  private current: SpeechSynthesisUtterance | null = null;
  private isSpeaking = false;
  private isPaused = false;

  constructor(synth: SynthLike, makeUtterance: (text: string) => SpeechSynthesisUtterance) {
    this.synth = synth;
    this.makeUtterance = makeUtterance;
  }

  /** True from the first queued sentence until the last one has been read. */
  get speaking(): boolean {
    return this.isSpeaking;
  }

  /** True while the user has paused mid-narration. */
  get paused(): boolean {
    return this.isPaused;
  }

  /** Add a sentence to the back of the line; starts at once when idle. */
  enqueue(text: string): void {
    if (!text.trim()) return;
    this.pending.push(text);
    if (!this.current) this.playNext();
  }

  /** Stop talking and forget everything that was waiting. */
  clear(): void {
    this.pending.length = 0;
    this.current = null;
    this.synth.cancel();
    // A paused synth stays paused after cancel(), which would swallow the
    // next utterance, so always hand it back running.
    this.unpause();
    this.setSpeaking(false);
  }

  /** Pause mid-sentence. Nothing to pause when idle. */
  pause(): void {
    if (!this.isSpeaking || this.isPaused) return;
    this.isPaused = true;
    this.synth.pause();
  }

  resume(): void {
    this.unpause();
  }

  private unpause(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.synth.resume();
  }

  private playNext(): void {
    const text = this.pending.shift();
    if (text === undefined) {
      this.current = null;
      this.unpause();
      this.setSpeaking(false);
      return;
    }

    const utterance = this.makeUtterance(text);
    const advance = () => {
      if (this.current !== utterance) return;
      this.current = null;
      this.playNext();
    };
    // A sentence that fails to speak must not stall the ones behind it.
    utterance.onend = advance;
    utterance.onerror = advance;

    this.current = utterance;
    this.setSpeaking(true);
    this.synth.speak(utterance);
  }

  private setSpeaking(speaking: boolean): void {
    if (this.isSpeaking === speaking) return;
    this.isSpeaking = speaking;
    this.onSpeakingChange?.(speaking);
  }
}
