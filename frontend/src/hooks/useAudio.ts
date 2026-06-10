import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';

export interface UseAudio {
  isPlaying: boolean;
  speak: (text: string) => void;
  playUrl: (url: string) => void;
  stop: () => void;
  toggleMuted: () => void;
  muted: boolean;
}

/**
 * Audio playback hook.
 * Phase 1: narration uses the browser's speechSynthesis (no audio URLs yet).
 * `playUrl` is wired through Howler.js for when narration audio arrives later.
 */
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

export function useAudio(): UseAudio {
  const howlRef = useRef<Howl | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

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

  const stop = useCallback(() => {
    if (synthSupported) window.speechSynthesis.cancel();
    howlRef.current?.stop();
    howlRef.current?.unload();
    howlRef.current = null;
    setIsPlaying(false);
  }, [synthSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!synthSupported || mutedRef.current || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      if (voiceRef.current) {
        utter.voice = voiceRef.current;
        utter.lang = voiceRef.current.lang;
      }
      utter.rate = 0.85; // slower, gentle
      utter.pitch = 1.15; // warm, friendly
      utter.onstart = () => setIsPlaying(true);
      utter.onend = () => setIsPlaying(false);
      utter.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utter);
    },
    [synthSupported]
  );

  const playUrl = useCallback(
    (url: string) => {
      if (mutedRef.current) return;
      howlRef.current?.unload();
      const howl = new Howl({
        src: [url],
        html5: true,
        onplay: () => setIsPlaying(true),
        onend: () => setIsPlaying(false),
        onstop: () => setIsPlaying(false),
      });
      howlRef.current = howl;
      howl.play();
    },
    []
  );

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next) {
        if (synthSupported) window.speechSynthesis.cancel();
        howlRef.current?.stop();
        setIsPlaying(false);
      }
      return next;
    });
  }, [synthSupported]);

  useEffect(() => () => stop(), [stop]);

  return { isPlaying, speak, playUrl, stop, toggleMuted, muted };
}
