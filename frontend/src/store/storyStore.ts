import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Chapter,
  ChapterMeta,
  ChildProfile,
  ResumeResponse,
  StartStoryBody,
} from '@/api/types';

/** A chapter as assembled on the client from the SSE stream. */
export interface AssembledChapter {
  meta: ChapterMeta;
  sentences: string[];
}

/** A finished chapter captured for the flip-back book + downloadable keepsake. */
export interface CompletedChapter {
  chapterNumber: number;
  title: string;
  text: string;
  imageUrl: string;
  mood: ChapterMeta['mood'];
  sceneDescription: string;
  vocabulary: string[];
}

/** A finished chapter as the server returns it (on resume), shaped for the book. */
export function toCompletedChapter(c: Chapter): CompletedChapter {
  return {
    chapterNumber: c.chapter_number,
    title: c.chapter_title,
    text: c.chapter_text,
    imageUrl: c.image_url,
    mood: c.mood,
    sceneDescription: c.scene_description,
    vocabulary: c.new_vocabulary,
  };
}

/** The hero the child dreamed up (what the story was started from, minus the child and the mode). */
export type StorySetup = Omit<StartStoryBody, 'child_id' | 'bedtime'>;

/** A normal story's length; bedtime stories are shorter (the server says how much). */
export const DEFAULT_MAX_CHAPTERS = 8;

interface StoryState {
  // Profile / session
  activeProfile: ChildProfile | null;
  sessionId: string | null;
  storyId: string | null;
  storyTitle: string | null;
  setup: StorySetup | null;
  /** This story is a bedtime story (3 chapters, ends in a goodnight). */
  bedtime: boolean;
  /** How many chapters this story has in all. */
  maxChapters: number;

  // Chapters
  chapters: AssembledChapter[];
  currentChapterIndex: number;
  choicesMade: string[];

  /** Completed chapters, accumulated as each one finishes streaming. */
  completedChapters: CompletedChapter[];

  /**
   * This session was just rebuilt from a saved, unfinished story: the book is
   * open on its last page and nothing is streaming. Cleared by the first choice.
   */
  resumed: boolean;
  /** The saved story's last chapter, which drives the choices (or the goodnight) while `resumed`. */
  resumedLastChapter: Chapter | null;

  // UI flags
  isRecording: boolean;
  curiosityOpen: boolean;
  pendingCuriosity: string | null;

  // Actions
  setActiveProfile: (p: ChildProfile | null) => void;
  startSession: (args: {
    sessionId: string;
    storyId: string;
    title: string;
    setup: StorySetup;
    bedtime: boolean;
    maxChapters: number;
  }) => void;
  /** Open a saved story where it stopped. */
  resumeSession: (r: ResumeResponse) => void;
  /** The child picked a choice on a resumed story: from here it streams as usual. */
  clearResumed: () => void;
  addChapter: (chapter: AssembledChapter) => void;
  addCompletedChapter: (chapter: CompletedChapter) => void;
  recordChoice: (choice: string) => void;
  openCuriosity: (question: string) => void;
  closeCuriosity: () => void;
  setRecording: (v: boolean) => void;
  resetStory: () => void;
}

export const useStoryStore = create<StoryState>()(
  persist(
    (set) => ({
      activeProfile: null,
      sessionId: null,
      storyId: null,
      storyTitle: null,
      setup: null,
      bedtime: false,
      maxChapters: DEFAULT_MAX_CHAPTERS,

      chapters: [],
      currentChapterIndex: 0,
      choicesMade: [],
      completedChapters: [],
      resumed: false,
      resumedLastChapter: null,

      isRecording: false,
      curiosityOpen: false,
      pendingCuriosity: null,

      setActiveProfile: (p) => set({ activeProfile: p }),

      startSession: ({ sessionId, storyId, title, setup, bedtime, maxChapters }) =>
        set({
          sessionId,
          storyId,
          storyTitle: title,
          setup,
          bedtime,
          maxChapters,
          chapters: [],
          currentChapterIndex: 0,
          choicesMade: [],
          completedChapters: [],
          resumed: false,
          resumedLastChapter: null,
          curiosityOpen: false,
          pendingCuriosity: null,
        }),

      resumeSession: (r) => {
        const last = r.chapters[r.chapters.length - 1] ?? null;
        set({
          sessionId: r.session_id,
          storyId: r.story_id,
          storyTitle: r.title,
          setup: r.setup,
          bedtime: r.bedtime,
          maxChapters: r.max_chapters,
          chapters: [],
          currentChapterIndex: 0,
          choicesMade: [],
          completedChapters: r.chapters.map(toCompletedChapter),
          // With no chapter saved there is nothing to show: stream as a new story would.
          resumed: last !== null,
          resumedLastChapter: last,
          curiosityOpen: false,
          pendingCuriosity: null,
        });
      },

      clearResumed: () => set({ resumed: false, resumedLastChapter: null }),

      addChapter: (chapter) =>
        set((s) => ({
          chapters: [...s.chapters, chapter],
          currentChapterIndex: s.chapters.length,
        })),

      addCompletedChapter: (chapter) =>
        set((s) =>
          s.completedChapters.some((c) => c.chapterNumber === chapter.chapterNumber)
            ? s
            : { completedChapters: [...s.completedChapters, chapter] }
        ),

      recordChoice: (choice) => set((s) => ({ choicesMade: [...s.choicesMade, choice] })),

      openCuriosity: (question) => set({ curiosityOpen: true, pendingCuriosity: question }),
      closeCuriosity: () => set({ curiosityOpen: false, pendingCuriosity: null }),

      setRecording: (v) => set({ isRecording: v }),

      resetStory: () =>
        set({
          sessionId: null,
          storyId: null,
          storyTitle: null,
          setup: null,
          bedtime: false,
          maxChapters: DEFAULT_MAX_CHAPTERS,
          chapters: [],
          currentChapterIndex: 0,
          choicesMade: [],
          completedChapters: [],
          resumed: false,
          resumedLastChapter: null,
          curiosityOpen: false,
          pendingCuriosity: null,
          isRecording: false,
        }),
    }),
    {
      name: 'storyweaver:v1',
      // Only persist the profile so the child stays "logged in".
      partialize: (s) => ({ activeProfile: s.activeProfile }),
    }
  )
);
