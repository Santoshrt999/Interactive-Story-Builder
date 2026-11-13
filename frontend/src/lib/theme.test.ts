import { describe, expect, it } from 'vitest';
import { nameWithHeart } from './theme';

describe('nameWithHeart', () => {
  it('adds a heart to the default profile', () => {
    expect(nameWithHeart({ name: 'Shreyanvi', is_default: true })).toBe('Shreyanvi ❤️');
  });

  it('follows is_default, not the name', () => {
    expect(nameWithHeart({ name: 'Shreyu', is_default: false })).toBe('Shreyu');
    expect(nameWithHeart({ name: 'Shreyanvi', is_default: false })).toBe('Shreyanvi');
    // A renamed default keeps its heart.
    expect(nameWithHeart({ name: 'Shreya', is_default: true })).toBe('Shreya ❤️');
  });
});
