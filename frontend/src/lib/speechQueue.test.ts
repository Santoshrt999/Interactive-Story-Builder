import { beforeEach, describe, expect, it } from 'vitest';
import { SpeechQueue, narratorVoice, type SynthLike } from './speechQueue';

/** A stand-in for SpeechSynthesisUtterance: just the bits the queue touches. */
interface FakeUtterance {
  text: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

/** Records every call and lets the test decide when an utterance finishes. */
class FakeSynth implements SynthLike {
  calls: string[] = [];
  spoken: FakeUtterance[] = [];

  speak(u: SpeechSynthesisUtterance) {
    const fake = u as unknown as FakeUtterance;
    this.calls.push(`speak:${fake.text}`);
    this.spoken.push(fake);
  }
  cancel() {
    this.calls.push('cancel');
  }
  pause() {
    this.calls.push('pause');
  }
  resume() {
    this.calls.push('resume');
  }

  /** The utterance most recently handed to the synth. */
  get last(): FakeUtterance {
    return this.spoken[this.spoken.length - 1];
  }
  /** Simulate the browser finishing the given (default: latest) utterance. */
  end(u: FakeUtterance = this.last) {
    u.onend?.();
  }
  fail(u: FakeUtterance = this.last) {
    u.onerror?.();
  }
}

const makeUtterance = (text: string) =>
  ({ text, onend: null, onerror: null }) as unknown as SpeechSynthesisUtterance;

let synth: FakeSynth;
let queue: SpeechQueue;
let speakingChanges: boolean[];

beforeEach(() => {
  synth = new FakeSynth();
  queue = new SpeechQueue(synth, makeUtterance);
  speakingChanges = [];
  queue.onSpeakingChange = (s) => speakingChanges.push(s);
});

describe('SpeechQueue', () => {
  it('speaks every sentence in order without cancelling', () => {
    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueue('c');

    // Only the first is handed to the synth; b and c wait their turn.
    expect(synth.calls).toEqual(['speak:a']);

    synth.end();
    expect(synth.calls).toEqual(['speak:a', 'speak:b']);

    synth.end();
    expect(synth.calls).toEqual(['speak:a', 'speak:b', 'speak:c']);

    synth.end();
    expect(synth.calls).not.toContain('cancel');
    expect(synth.spoken.map((u) => u.text)).toEqual(['a', 'b', 'c']);
  });

  it('enqueue while idle starts immediately', () => {
    expect(queue.speaking).toBe(false);
    queue.enqueue('hello');
    expect(synth.calls).toEqual(['speak:hello']);
    expect(queue.speaking).toBe(true);
  });

  it('enqueue while speaking waits for the current sentence to end', () => {
    queue.enqueue('one');
    queue.enqueue('two');
    expect(synth.spoken.map((u) => u.text)).toEqual(['one']);

    // A sentence arriving mid-queue joins the back of the line.
    queue.enqueue('three');
    synth.end();
    synth.end();
    synth.end();
    expect(synth.spoken.map((u) => u.text)).toEqual(['one', 'two', 'three']);
  });

  it('reports speaking once for the whole run, not once per sentence', () => {
    queue.enqueue('a');
    queue.enqueue('b');
    synth.end();
    expect(queue.speaking).toBe(true);
    synth.end();
    expect(queue.speaking).toBe(false);
    expect(speakingChanges).toEqual([true, false]);
  });

  it('clear() cancels and releases speaking state', () => {
    queue.enqueue('a');
    queue.enqueue('b');
    expect(queue.speaking).toBe(true);

    queue.clear();

    expect(synth.calls).toContain('cancel');
    expect(queue.speaking).toBe(false);
    expect(speakingChanges).toEqual([true, false]);
  });

  it('clear() drops sentences that were still waiting', () => {
    queue.enqueue('a');
    queue.enqueue('b');
    queue.clear();
    // The browser reports the cancelled utterance as ended; nothing may follow.
    synth.end(synth.spoken[0]);
    expect(synth.spoken.map((u) => u.text)).toEqual(['a']);
  });

  it('ignores the cancelled utterance finishing after new text was queued', () => {
    queue.enqueue('old');
    queue.clear();
    queue.enqueue('new1');
    queue.enqueue('new2');
    const [old] = synth.spoken;

    // Browsers fire end/error for the cancelled utterance a moment later.
    synth.end(old);
    synth.fail(old);

    expect(synth.spoken.map((u) => u.text)).toEqual(['old', 'new1']);
    expect(queue.speaking).toBe(true);
  });

  it('moves on to the next sentence if one fails to speak', () => {
    queue.enqueue('a');
    queue.enqueue('b');
    synth.fail();
    expect(synth.spoken.map((u) => u.text)).toEqual(['a', 'b']);
  });

  it('ignores blank sentences', () => {
    queue.enqueue('');
    queue.enqueue('   ');
    expect(synth.calls).toEqual([]);
    expect(queue.speaking).toBe(false);
  });

  it('pause() and resume() drive the synth while speaking', () => {
    queue.enqueue('a');
    queue.pause();
    expect(queue.paused).toBe(true);
    expect(synth.calls).toEqual(['speak:a', 'pause']);

    queue.resume();
    expect(queue.paused).toBe(false);
    expect(synth.calls).toEqual(['speak:a', 'pause', 'resume']);
  });

  it('keeps sentences queued while paused and plays them after resume', () => {
    queue.enqueue('a');
    queue.pause();
    queue.enqueue('b');
    expect(synth.spoken.map((u) => u.text)).toEqual(['a']);

    queue.resume();
    synth.end();
    expect(synth.spoken.map((u) => u.text)).toEqual(['a', 'b']);
  });

  it('pause() does nothing when idle, so the next sentence is not swallowed', () => {
    queue.pause();
    expect(queue.paused).toBe(false);
    expect(synth.calls).toEqual([]);
  });

  it('resume() does nothing when not paused', () => {
    queue.enqueue('a');
    queue.resume();
    expect(synth.calls).toEqual(['speak:a']);
  });

  it('clear() while paused un-pauses the synth so new text is audible', () => {
    queue.enqueue('a');
    queue.pause();
    queue.clear();

    expect(synth.calls).toEqual(['speak:a', 'pause', 'cancel', 'resume']);
    expect(queue.paused).toBe(false);
    expect(queue.speaking).toBe(false);

    queue.enqueue('b');
    expect(synth.calls[synth.calls.length - 1]).toBe('speak:b');
  });
});

describe('narratorVoice', () => {
  it('uses the gentle default voice', () => {
    expect(narratorVoice(false)).toEqual({ rate: 0.85, pitch: 1.15 });
  });

  it('slows down and softens for bedtime', () => {
    expect(narratorVoice(true)).toEqual({ rate: 0.72, pitch: 1.05 });
  });
});
