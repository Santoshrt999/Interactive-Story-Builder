import { describe, expect, it } from 'vitest';
import type { EndStoryResponse } from '@/api/types';
import { buildStorybookHtml } from './downloadStorybook';

const certificate: EndStoryResponse = {
  story_id: 's1',
  certificate: {
    child_name: 'Server Name',
    character_name: 'Luna',
    achievement: 'Was brave',
    title: 'The Moon Garden',
  },
  vocabulary: [{ word: 'luminous', definition: 'glowing' }],
};

function build(child: { name: string; is_default: boolean } | null) {
  return buildStorybookHtml({
    storyTitle: 'The Moon Garden',
    chapters: [],
    certificate,
    child,
    characterName: 'Luna',
    avatarEmoji: '🦄',
  });
}

describe('buildStorybookHtml child name', () => {
  it('gives the default profile its heart', () => {
    const html = build({ name: 'Shreyanvi', is_default: true });
    expect(html).toContain('<strong>Shreyanvi ❤️</strong>');
    expect(html).toContain('Words Shreyanvi collected');
  });

  it('shows other profiles plainly, whatever their name', () => {
    const html = build({ name: 'Shreyu', is_default: false });
    expect(html).toContain('<strong>Shreyu</strong>');
    expect(html).not.toContain('❤️');
  });

  it('falls back to the certificate’s child name without a profile', () => {
    const html = build(null);
    expect(html).toContain('<strong>Server Name</strong>');
    expect(html).toContain('Words Server Name collected');
  });

  it('escapes the name', () => {
    const html = build({ name: '<b>x</b>', is_default: false });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});
