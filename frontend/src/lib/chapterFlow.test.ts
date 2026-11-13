import { describe, expect, it } from 'vitest';
import { chapterEnding, chapterLabel, shouldAskCuriosity } from './chapterFlow';

describe('chapterEnding', () => {
  it('offers choices after an ordinary chapter', () => {
    expect(chapterEnding({ is_final: false })).toBe('choices');
  });

  it('says goodnight after the final chapter', () => {
    expect(chapterEnding({ is_final: true })).toBe('goodnight');
  });
});

describe('chapterLabel', () => {
  it('reads "Chapter N of M"', () => {
    expect(chapterLabel(1, 3)).toBe('Chapter 1 of 3');
    expect(chapterLabel(3, 3)).toBe('Chapter 3 of 3');
    expect(chapterLabel(5, 8)).toBe('Chapter 5 of 8');
  });

  it('never shows a chapter below 1 or above the story length', () => {
    expect(chapterLabel(0, 3)).toBe('Chapter 1 of 3');
    expect(chapterLabel(4, 3)).toBe('Chapter 3 of 3');
  });
});

describe('shouldAskCuriosity', () => {
  const q = 'Why do stars twinkle?';

  it('asks the chapter question after a choice in a normal story', () => {
    expect(shouldAskCuriosity(q, { bedtime: false, chapterNumber: 2, maxChapters: 8 })).toBe(true);
  });

  it('asks after chapter 1 of a bedtime story', () => {
    expect(shouldAskCuriosity(q, { bedtime: true, chapterNumber: 1, maxChapters: 3 })).toBe(true);
  });

  it('skips the question when the next bedtime chapter is the goodnight chapter', () => {
    expect(shouldAskCuriosity(q, { bedtime: true, chapterNumber: 2, maxChapters: 3 })).toBe(false);
  });

  it('does not ask when the chapter has no question', () => {
    const ctx = { bedtime: false, chapterNumber: 1, maxChapters: 8 };
    expect(shouldAskCuriosity('', ctx)).toBe(false);
    expect(shouldAskCuriosity(undefined, ctx)).toBe(false);
    expect(shouldAskCuriosity(null, ctx)).toBe(false);
  });
});
