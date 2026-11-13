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
  it('asks the chapter question after a choice', () => {
    expect(shouldAskCuriosity('Why do stars twinkle?', false)).toBe(true);
  });

  it('does not ask once the story is on its final chapter', () => {
    expect(shouldAskCuriosity('Why do stars twinkle?', true)).toBe(false);
  });

  it('does not ask when the chapter has no question', () => {
    expect(shouldAskCuriosity('', false)).toBe(false);
    expect(shouldAskCuriosity(undefined, false)).toBe(false);
  });
});
