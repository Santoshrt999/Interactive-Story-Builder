import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  /** Bedtime mode: shorter, calmer stories with a goodnight ending. */
  bedtime: boolean;
  /** Background music; on by default, starts on the first user gesture. */
  musicOn: boolean;
  /** `eveningKey` of the last evening the bedtime suggestion was shown. */
  lastBedtimeSuggestion: string | null;
  /** The storyteller voice a parent picked (SpeechSynthesisVoice.name); null = automatic. */
  voiceName: string | null;

  setBedtime: (v: boolean) => void;
  setVoiceName: (name: string | null) => void;
  setMusicOn: (v: boolean) => void;
  markSuggested: (key: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      bedtime: false,
      musicOn: true,
      lastBedtimeSuggestion: null,
      voiceName: null,

      setBedtime: (v) => set({ bedtime: v }),
      setVoiceName: (name) => set({ voiceName: name }),
      setMusicOn: (v) => set({ musicOn: v }),
      markSuggested: (key) => set({ lastBedtimeSuggestion: key }),
    }),
    { name: 'storyweaver:settings' }
  )
);
