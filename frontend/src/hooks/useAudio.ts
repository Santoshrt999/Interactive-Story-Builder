import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';
import { SpeechQueue, narratorVoice } from '@/lib/speechQueue';
import { useSettingsStore } from '@/store/settingsStore';

export interface UseAudio {
  /** Narration is audibly playing (not paused, not idle). */
  isPlaying: boolean;
  /** The child paused the narrator mid-sentence. */
  isPaused: boolean;
  /** Queue a sentence after whatever is already being read. */
  enqueue: (text: string) => void;
  /** Drop the queue and read this text right away. */
  speakNow: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  playUrl: (url: string) => void;
  toggleMuted: () => void;
  muted: boolean;
}

/** Names of warm, child-friendly female voices, in order of preference. */
const PREFERRED_VOICE_NAMES = [
  'Samantha',
  'Karen',
  'Tessa',
  'Moira',
  'Google UK English Female',
  'Microsoft Zira',
];

/** Heuristic hints that a voice is likely a female English voice. */
const FEMALE_HINTS = ['female', 'woman', 'girl', 'zira', 'samantha', 'victoria', 'serena', 'fiona'];

/** Pick the softest, friendliest female English voice available. */
function pickFriendlyVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  for (const name of PREFERRED_VOICE_NAMES) {
    const match = voices.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (match) return match;
  }

  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const femaleEnglish = english.find((v) =>
    FEMALE_HINTS.some((hint) => v.name.toLowerCase().includes(hint))
  );
  if (femaleEnglish) return femaleEnglish;

  return english[0] ?? voices[0];
}

/**
 * Audio playback hook.
 * Narration uses the browser's speechSynthesis through a SpeechQueue, so every
 * sentence is read in order instead of the latest one cutting off the rest.
 * `playUrl` is wired through Howler.js for when narration audio arrives later.
 */
export function useAudio(): UseAudio {
  const howlRef = useRef<Howl | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [urlPlaying, setUrlPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  // Read at utterance-creation time so a bedtime switch applies to the next sentence.
  const bedtime = useSettingsStore((s) => s.bedtime);
  const bedtimeRef = useRef(bedtime);
  bedtimeRef.current = bedtime;

  const synthSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Voices load asynchronously; choose one once they're available.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!synthSupported) return;
    const loadVoices = () => {
      const voice = pickFriendlyVoice(window.speechSynthesis.getVoices());
      if (voice) voiceRef.current = voice;
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [synthSupported]);

  const queueRef = useRef<SpeechQueue | null>(null);
  const getQueue = useCallback((): SpeechQueue | null => {
    if (!synthSupported) return null;
    if (!queueRef.current) {
      const queue = new SpeechQueue(window.speechSynthesis, (text) => {
        const utter = new SpeechSynthesisUtterance(text);
        const voice = voiceRef.current;
        if (voice) {
          utter.voice = voice;
          utter.lang = voice.lang;
        }
        const { rate, pitch } = narratorVoice(bedtimeRef.current);
        utter.rate = rate; // slower, gentle
        utter.pitch = pitch; // warm, friendly
        return utter;
      });
      queue.onSpeakingChange = (isSpeaking) => {
        setSpeaking(isSpeaking);
        // An idle queue can't be paused (it also un-pauses the synth).
        if (!isSpeaking) setPaused(false);
      };
      queueRef.current = queue;
    }
    return queueRef.current;
  }, [synthSupported]);

  const stop = useCallback(() => {
    getQueue()?.clear();
    howlRef.current?.stop();
    howlRef.current?.unload();
    howlRef.current = null;
    setUrlPlaying(false);
  }, [getQueue]);

  const enqueue = useCallback(
    (text: string) => {
      if (mutedRef.current) return;
      getQueue()?.enqueue(text);
    },
    [getQueue]
  );

  const speakNow = useCallback(
    (text: string) => {
      // clear() also hands a paused synth back running, so this is audible.
      getQueue()?.clear();
      setPaused(false);
      if (mutedRef.current) return;
      getQueue()?.enqueue(text);
    },
    [getQueue]
  );

  const pause = useCallback(() => {
    const queue = getQueue();
    queue?.pause();
    setPaused(queue?.paused ?? false);
  }, [getQueue]);

  const resume = useCallback(() => {
    getQueue()?.resume();
    setPaused(false);
  }, [getQueue]);

  const playUrl = useCallback(
    (url: string) => {
      if (mutedRef.current) return;
      howlRef.current?.unload();
      const howl = new Howl({
        src: [url],
        html5: true,
        onplay: () => setUrlPlaying(true),
        onend: () => setUrlPlaying(false),
        onstop: () => setUrlPlaying(false),
      });
      howlRef.current = howl;
      howl.play();
    },
    []
  );

  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      getQueue()?.clear();
      howlRef.current?.stop();
      setUrlPlaying(false);
    }
  }, [getQueue]);

  useEffect(() => () => stop(), [stop]);

  return {
    isPlaying: (speaking && !paused) || urlPlaying,
    isPaused: paused,
    enqueue,
    speakNow,
    pause,
    resume,
    stop,
    playUrl,
    toggleMuted,
    muted,
  };
}
