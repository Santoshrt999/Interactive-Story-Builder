import { describe, expect, test } from 'vitest';
import { baseName, isNatural, pickVoice, rankVoices, voiceQuality } from './voices';

const v = (name: string, lang = 'en-US') => ({ name, lang });

// What this Mac reports today (compact voices only) plus typical downloads.
const MAC_COMPACT = [
  v('Albert'), v('Bubbles'), v('Daniel', 'en-GB'), v('Flo (English (US))'),
  v('Grandma (English (US))'), v('Karen', 'en-AU'), v('Kathy'), v('Moira', 'en-IE'),
  v('Samantha'), v('Shelley (English (US))'), v('Tessa', 'en-ZA'), v('Whisper'),
  v('Thomas', 'fr-FR'),
];

describe('baseName / voiceQuality', () => {
  test('strips the bracketed suffix', () => {
    expect(baseName('Zoe (Premium)')).toBe('zoe');
    expect(baseName('Flo (English (US))')).toBe('flo');
    expect(baseName('Samantha')).toBe('samantha');
  });
  test('detects Premium and Enhanced voices', () => {
    expect(voiceQuality('Ava (Premium)')).toBe('premium');
    expect(voiceQuality('Samantha (Enhanced)')).toBe('enhanced');
    expect(voiceQuality('Samantha')).toBe('standard');
    expect(isNatural(v('Zoe (Premium)'))).toBe(true);
    expect(isNatural(v('Karen'))).toBe(false);
  });
});

describe('rankVoices', () => {
  test('never offers novelty, male or non-English voices', () => {
    const names = rankVoices(MAC_COMPACT).map((x) => x.name);
    for (const bad of ['Albert', 'Bubbles', 'Daniel', 'Whisper', 'Thomas', 'Flo (English (US))']) {
      expect(names).not.toContain(bad);
    }
    expect(names[0]).toBe('Samantha');
    expect(names).toEqual(expect.arrayContaining(['Karen', 'Tessa', 'Moira']));
  });

  test('downloaded Premium voices outrank everything, Zoe first', () => {
    const ranked = rankVoices([
      ...MAC_COMPACT,
      v('Ava (Premium)'),
      v('Zoe (Premium)'),
      v('Samantha (Enhanced)'),
    ]).map((x) => x.name);
    expect(ranked.slice(0, 3)).toEqual(['Zoe (Premium)', 'Ava (Premium)', 'Samantha (Enhanced)']);
  });

  test('a Premium voice not on the friendly list still ranks above compact ones', () => {
    const ranked = rankVoices([v('Samantha'), v('Shelby (Premium)')]).map((x) => x.name);
    expect(ranked).toEqual(['Shelby (Premium)', 'Samantha']);
  });

  test('removes duplicate names', () => {
    expect(rankVoices([v('Samantha'), v('Samantha')])).toHaveLength(1);
  });
});

describe('pickVoice', () => {
  const voices = [...MAC_COMPACT, v('Zoe (Premium)')];

  test('uses the saved choice when it is installed', () => {
    expect(pickVoice(voices, 'Karen')?.name).toBe('Karen');
  });
  test('falls back to the best voice when the saved one is gone', () => {
    expect(pickVoice(voices, 'Ava (Premium)')?.name).toBe('Zoe (Premium)');
    expect(pickVoice(voices, null)?.name).toBe('Zoe (Premium)');
  });
  test('falls back to any English voice, then null', () => {
    expect(pickVoice([v('Albert')], null)?.name).toBe('Albert');
    expect(pickVoice([], null)).toBeNull();
  });
});
