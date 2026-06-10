import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChildProfile, ChapterMeta, StartStoryBody } from '@/api/types';

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

export type StorySetup = Omit<StartStoryBody, 'child_id'>;

interface StoryState {
  // Profile / session
  activeProfile: ChildProfile | null;
  sessionId: string | null;
  storyId: string | null;
  storyTitle: string | null;
  setup: StorySetup | null;

  // Chapters
  chapters: AssembledChapter[];
  currentChapterIndex: number;
  choicesMade: string[];

  /** Completed chapters, accumulated as each one finishes streaming. */
  completedChapters: CompletedChapter[];

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
  }) => void;
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

      chapters: [],
      currentChapterIndex: 0,
      choicesMade: [],
      completedChapters: [],

      isRecording: false,
      curiosityOpen: false,
      pendingCuriosity: null,

      setActiveProfile: (p) => set({ activeProfile: p }),

      startSession: ({ sessionId, storyId, title, setup }) =>
        set({
          sessionId,
          storyId,
          storyTitle: title,
          setup,
          chapters: [],
          currentChapterIndex: 0,
          choicesMade: [],
          completedChapters: [],
          curiosityOpen: false,
          pendingCuriosity: null,
        }),

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
          chapters: [],
          currentChapterIndex: 0,
          choicesMade: [],
          completedChapters: [],
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
