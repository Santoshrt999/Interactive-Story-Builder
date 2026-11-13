import { describe, expect, it } from 'vitest';
import { buildPhrase, PHRASE_BEATS, TEMPO, type MusicMood, type Note } from './phrases';

const PENTATONIC = [0, 2, 4, 7, 9];
const MOODS: MusicMood[] = ['adventure', 'lullaby'];
const SEEDS = Array.from({ length: 200 }, (_, i) => i);

/** Melody notes per second: a rough measure of how busy a phrase is. */
function notesPerSecond(mood: MusicMood, seed: number): number {
  const notes = buildPhrase(mood, seed);
  const seconds = (PHRASE_BEATS * 60) / TEMPO[mood];
  return notes.length / seconds;
}

describe('buildPhrase', () => {
  it('lullaby stays in pentatonic, at or below C5, slower', () => {
    const notes = buildPhrase('lullaby', 1);
    notes.forEach((n) => {
      expect(PENTATONIC).toContain(n.midi % 12);
      expect(n.midi).toBeLessThanOrEqual(72);
    });
    expect(TEMPO.lullaby).toBe(60);
    expect(TEMPO.adventure).toBe(90);
  });

  it('every phrase of every mood is C-major pentatonic and in a gentle range', () => {
    for (const mood of MOODS) {
      for (const seed of SEEDS) {
        for (const n of buildPhrase(mood, seed)) {
          expect(PENTATONIC).toContain(n.midi % 12);
          expect(Number.isInteger(n.midi)).toBe(true);
          expect(n.midi).toBeGreaterThanOrEqual(40);
          expect(n.midi).toBeLessThanOrEqual(mood === 'lullaby' ? 72 : 84);
        }
      }
    }
  });

  it('is deterministic per seed and 8 beats long', () => {
    for (const mood of MOODS) {
      for (const seed of [0, 1, 7, 42, 12345]) {
        const a = buildPhrase(mood, seed);
        const b = buildPhrase(mood, seed);
        expect(a).toEqual(b);

        expect(PHRASE_BEATS).toBe(8);
        const ends = a.map((n) => n.startBeat + n.beats);
        // Fills the phrase: starts on the downbeat, last note ends exactly at beat 8.
        expect(Math.min(...a.map((n) => n.startBeat))).toBe(0);
        expect(Math.max(...ends)).toBe(8);
        a.forEach((n) => {
          expect(n.startBeat).toBeGreaterThanOrEqual(0);
          expect(n.beats).toBeGreaterThan(0);
          expect(n.startBeat + n.beats).toBeLessThanOrEqual(8);
        });
      }
    }
  });

  it('returns notes in time order with velocities in (0, 1]', () => {
    for (const mood of MOODS) {
      for (const seed of SEEDS) {
        const notes: Note[] = buildPhrase(mood, seed);
        expect(notes.length).toBeGreaterThan(2);
        for (let i = 1; i < notes.length; i++) {
          expect(notes[i].startBeat).toBeGreaterThanOrEqual(notes[i - 1].startBeat);
        }
        notes.forEach((n) => {
          expect(n.velocity).toBeGreaterThan(0);
          expect(n.velocity).toBeLessThanOrEqual(1);
        });
      }
    }
  });

  it('varies from seed to seed so a long listen is not a loop', () => {
    for (const mood of MOODS) {
      const distinct = new Set(SEEDS.map((s) => JSON.stringify(buildPhrase(mood, s))));
      expect(distinct.size).toBeGreaterThan(40);
    }
  });

  it('tolerates odd seeds (negative, fractional, NaN) without throwing', () => {
    for (const seed of [-1, -123456, 1.5, 2 ** 40, NaN, Infinity]) {
      for (const mood of MOODS) {
        const notes = buildPhrase(mood, seed);
        expect(notes.length).toBeGreaterThan(0);
        notes.forEach((n) => expect(PENTATONIC).toContain(n.midi % 12));
      }
    }
  });

  it('lullaby is calmer than adventure: fewer notes per second, softer', () => {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const seeds = SEEDS.slice(0, 50);
    expect(avg(seeds.map((s) => notesPerSecond('lullaby', s)))).toBeLessThan(
      avg(seeds.map((s) => notesPerSecond('adventure', s)))
    );
    const meanVelocity = (mood: MusicMood) =>
      avg(seeds.flatMap((s) => buildPhrase(mood, s).map((n) => n.velocity)));
    expect(meanVelocity('lullaby')).toBeLessThan(meanVelocity('adventure'));
  });
});
