import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, ResumeResponse } from '@/api/types';
import { toCompletedChapter, useStoryStore } from './storyStore';

// The store persists the profile via window.localStorage, which the node test environment lacks.
vi.hoisted(() => {
  const data = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  vi.stubGlobal('window', { localStorage });
});

function chapter(n: number, overrides: Partial<Chapter> = {}): Chapter {
  return {
    chapter_number: n,
    chapter_title: `Chapter ${n} title`,
    chapter_text: `Text of chapter ${n}. It has two sentences.`,
    choices: [`a${n}`, `b${n}`, `c${n}`],
    scene_description: `Scene ${n}`,
    mood: 'calm',
    new_vocabulary: [`word${n}`],
    curiosity_question: `Question ${n}?`,
    image_url: `/images/${n}.png`,
    is_final: false,
    ...overrides,
  };
}

function resumeResponse(overrides: Partial<ResumeResponse> = {}): ResumeResponse {
  return {
    session_id: 'sess-1',
    story_id: 'story-1',
    title: 'Luna and the Sleepy Moon',
    bedtime: true,
    max_chapters: 3,
    setup: {
      character_name: 'Luna',
      character_archetype: 'kind',
      world: 'forest',
      theme: 'friendship',
    },
    chapters: [chapter(1), chapter(2)],
    ...overrides,
  };
}

beforeEach(() => {
  useStoryStore.getState().resetStory();
});

describe('toCompletedChapter', () => {
  it('maps a server chapter to a book page', () => {
    expect(toCompletedChapter(chapter(2))).toEqual({
      chapterNumber: 2,
      title: 'Chapter 2 title',
      text: 'Text of chapter 2. It has two sentences.',
      imageUrl: '/images/2.png',
      mood: 'calm',
      sceneDescription: 'Scene 2',
      vocabulary: ['word2'],
    });
  });
});

describe('resumeSession', () => {
  it('restores the session and the whole book, and marks it resumed', () => {
    useStoryStore.getState().resumeSession(resumeResponse());
    const s = useStoryStore.getState();

    expect(s.sessionId).toBe('sess-1');
    expect(s.storyId).toBe('story-1');
    expect(s.storyTitle).toBe('Luna and the Sleepy Moon');
    expect(s.setup).toEqual({
      character_name: 'Luna',
      character_archetype: 'kind',
      world: 'forest',
      theme: 'friendship',
    });
    expect(s.bedtime).toBe(true);
    expect(s.maxChapters).toBe(3);
    expect(s.completedChapters.map((c) => c.chapterNumber)).toEqual([1, 2]);
    expect(s.completedChapters[1]?.text).toBe('Text of chapter 2. It has two sentences.');
    expect(s.resumed).toBe(true);
  });

  it('keeps the last chapter, with its choices, to show once the book opens', () => {
    useStoryStore.getState().resumeSession(resumeResponse());
    const last = useStoryStore.getState().resumedLastChapter;

    expect(last?.chapter_number).toBe(2);
    expect(last?.choices).toEqual(['a2', 'b2', 'c2']);
    expect(last?.curiosity_question).toBe('Question 2?');
  });

  it('keeps is_final so the last chapter ends in goodnight, not choices', () => {
    useStoryStore
      .getState()
      .resumeSession(
        resumeResponse({ chapters: [chapter(1), chapter(2), chapter(3, { is_final: true })] })
      );

    expect(useStoryStore.getState().resumedLastChapter?.is_final).toBe(true);
  });

  it('clears whatever the previous story left behind', () => {
    const before = useStoryStore.getState();
    before.recordChoice('an old choice');
    before.openCuriosity('An old question?');
    useStoryStore.getState().resumeSession(resumeResponse());
    const s = useStoryStore.getState();

    expect(s.choicesMade).toEqual([]);
    expect(s.curiosityOpen).toBe(false);
    expect(s.pendingCuriosity).toBeNull();
    expect(s.chapters).toEqual([]);
  });

  it('is not "resumed" when the server has no chapters yet (the stream opens normally)', () => {
    useStoryStore.getState().resumeSession(resumeResponse({ chapters: [] }));
    const s = useStoryStore.getState();

    expect(s.completedChapters).toEqual([]);
    expect(s.resumedLastChapter).toBeNull();
    expect(s.resumed).toBe(false);
  });
});

describe('clearResumed', () => {
  it('turns "resumed" off once the child picks a choice', () => {
    useStoryStore.getState().resumeSession(resumeResponse());
    useStoryStore.getState().clearResumed();
    const s = useStoryStore.getState();

    expect(s.resumed).toBe(false);
    expect(s.resumedLastChapter).toBeNull();
    // The book stays as it was.
    expect(s.completedChapters).toHaveLength(2);
  });
});

describe('a new or reset story is never "resumed"', () => {
  const start = {
    sessionId: 'sess-2',
    storyId: 'story-2',
    title: 'New',
    setup: {
      character_name: 'Max',
      character_archetype: 'brave' as const,
      world: 'space' as const,
      theme: 'courage' as const,
    },
    bedtime: false,
    maxChapters: 8,
  };

  it('startSession clears the resumed state', () => {
    useStoryStore.getState().resumeSession(resumeResponse());
    useStoryStore.getState().startSession(start);
    const s = useStoryStore.getState();

    expect(s.resumed).toBe(false);
    expect(s.resumedLastChapter).toBeNull();
    expect(s.completedChapters).toEqual([]);
  });

  it('resetStory clears the resumed state', () => {
    useStoryStore.getState().resumeSession(resumeResponse());
    useStoryStore.getState().resetStory();
    const s = useStoryStore.getState();

    expect(s.resumed).toBe(false);
    expect(s.resumedLastChapter).toBeNull();
  });
});
