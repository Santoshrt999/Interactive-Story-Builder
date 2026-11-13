// Generated music-box phrases. Pure data, no audio: the engine turns these
// notes into sound. Every phrase is 8 beats of C-major pentatonic, so any two
// phrases sound fine back to back and nothing ever clashes.

export type MusicMood = 'adventure' | 'lullaby';

export interface Note {
  /** MIDI note number (60 = middle C). */
  midi: number;
  /** Where the note starts within the phrase, in beats (0 to < 8). */
  startBeat: number;
  /** How long the slot lasts, in beats. */
  beats: number;
  /** Softness, 0 to 1. */
  velocity: number;
}

/** Beats per minute. Bedtime is half as busy and a third slower. */
export const TEMPO: Record<MusicMood, number> = { adventure: 90, lullaby: 60 };

/** Every phrase is exactly this many beats long. */
export const PHRASE_BEATS = 8;

/** C major pentatonic: C D E G A. */
const PENTATONIC_PITCH_CLASSES = [0, 2, 4, 7, 9];
/** The restful notes a phrase can end on: C, E, G. */
const RESTING_PITCH_CLASSES = [0, 4, 7];

interface MoodShape {
  /** Melody range, inclusive (MIDI). The lullaby stays at or below C5. */
  low: number;
  high: number;
  /** Rhythms as slot lengths in beats; each sums to PHRASE_BEATS. */
  rhythms: number[][];
  /** Chance that a middle note is left out, leaving a breath of silence. */
  restChance: number;
  /** Velocity on the beat and off it. */
  accent: number;
  soft: number;
  /** Probability weights of melodic steps, in scale degrees. */
  steps: Array<[step: number, weight: number]>;
}

const SHAPES: Record<MusicMood, MoodShape> = {
  adventure: {
    low: 60, // C4
    high: 84, // C6
    rhythms: [
      Array<number>(16).fill(0.5),
      [0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1],
      [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1],
      [0.75, 0.75, 0.5, 0.75, 0.75, 0.5, 0.75, 0.75, 0.5, 0.75, 0.75, 0.5],
      [1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 1, 1],
    ],
    restChance: 0.08,
    accent: 0.72,
    soft: 0.5,
    steps: [
      [-2, 1],
      [-1, 3],
      [0, 0.5],
      [1, 3],
      [2, 1.5],
      [3, 0.5],
    ],
  },
  lullaby: {
    low: 55, // G3
    high: 72, // C5
    rhythms: [
      [1, 1, 2, 1, 1, 2],
      [2, 1, 1, 2, 2],
      [1, 1, 1, 1, 2, 2],
      [1.5, 0.5, 1, 1, 1.5, 0.5, 2],
      [2, 2, 2, 2],
      [1, 1, 1, 1, 1, 1, 2],
    ],
    restChance: 0.14,
    accent: 0.52,
    soft: 0.38,
    steps: [
      [-2, 0.5],
      [-1, 4],
      [0, 0.3],
      [1, 4],
      [2, 0.7],
    ],
  },
};

/** A small, fast, seedable random number generator (mulberry32). */
function seededRandom(seed: number): () => number {
  let a = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scaleBetween(low: number, high: number): number[] {
  const scale: number[] = [];
  for (let midi = low; midi <= high; midi++) {
    if (PENTATONIC_PITCH_CLASSES.includes(midi % 12)) scale.push(midi);
  }
  return scale;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function pickWeighted(options: Array<[number, number]>, random: () => number): number {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1][0];
}

/** Index of the scale note closest to `from` that is a restful chord tone. */
function nearestRestingIndex(scale: number[], from: number): number {
  let best = from;
  let bestDistance = Infinity;
  scale.forEach((midi, index) => {
    if (!RESTING_PITCH_CLASSES.includes(midi % 12)) return;
    const distance = Math.abs(index - from);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * One 8-beat phrase: a gentle wandering melody plus a soft low root (and, on
 * the second half, a fifth or sixth) underneath. The same seed always gives the
 * same notes; the engine uses a new seed each cycle so it never feels looped.
 */
export function buildPhrase(mood: MusicMood, seed: number): Note[] {
  const shape = SHAPES[mood];
  const random = seededRandom(seed);
  const scale = scaleBetween(shape.low, shape.high);
  const rhythm = pick(shape.rhythms, random);

  const notes: Note[] = [];

  // Warm bed underneath: C on beat 0, then C, G or A on beat 4.
  notes.push({ midi: 48, startBeat: 0, beats: PHRASE_BEATS / 2, velocity: shape.soft * 0.9 });
  notes.push({
    midi: pick([48, 55, 45], random),
    startBeat: PHRASE_BEATS / 2,
    beats: PHRASE_BEATS / 2,
    velocity: shape.soft * 0.8,
  });

  // Melody: a random walk over the scale, ending on a restful note.
  let index = nearestRestingIndex(scale, Math.floor(random() * scale.length));
  let beat = 0;
  rhythm.forEach((slot, slotIndex) => {
    const isFirst = slotIndex === 0;
    const isLast = slotIndex === rhythm.length - 1;

    if (!isFirst) {
      index = clamp(index + pickWeighted(shape.steps, random), 0, scale.length - 1);
      // The walk bounces off the ends of the range instead of sticking to them.
      if (index === 0 || index === scale.length - 1) {
        index = clamp(index + (index === 0 ? 1 : -1) * Math.floor(random() * 2), 0, scale.length - 1);
      }
    }
    if (isLast) index = nearestRestingIndex(scale, index);

    const resting = !isFirst && !isLast && random() < shape.restChance;
    if (!resting) {
      const onBeat = Number.isInteger(beat);
      const jitter = (random() - 0.5) * 0.16;
      notes.push({
        midi: scale[index],
        startBeat: beat,
        beats: slot,
        velocity: clamp((onBeat ? shape.accent : shape.soft) + jitter, 0.15, 1),
      });
    }
    beat += slot;
  });

  return notes.sort((a, b) => a.startBeat - b.startBeat);
}
