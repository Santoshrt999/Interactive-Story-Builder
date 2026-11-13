/* eslint-disable react-refresh/only-export-components -- the provider and its hook belong together */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { MusicEngine } from '@/lib/music/engine';
import type { MusicMood } from '@/lib/music/phrases';
import { useSettingsStore } from '@/store/settingsStore';

export interface UseMusic {
  /** Music is audibly playing right now. */
  playing: boolean;
  /** Music is switched on (and has not been faded out for the night). */
  enabled: boolean;
  /** Turn music off, or back on. */
  toggle: () => void;
  /** Lower the music under the narrator (-12 dB) or bring it back. Idempotent. */
  duck: (on: boolean) => void;
  /** Fade out over ~2 s and stay quiet until the music is toggled back on. */
  fadeOut: () => void;
}

const NOOP_MUSIC: UseMusic = {
  playing: false,
  enabled: false,
  toggle: () => undefined,
  duck: () => undefined,
  fadeOut: () => undefined,
};

const MusicContext = createContext<UseMusic>(NOOP_MUSIC);

/** Browsers without Web Audio throw here; the engine turns that into silence. */
function createAudioContext(): AudioContext {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not supported');
  return new Ctor();
}

const GESTURE_EVENTS = ['pointerdown', 'keydown'] as const;

/**
 * Owns the one MusicEngine for the app. Nothing is created or played until the
 * first pointer or key gesture (browsers require one), and only if music is on.
 */
export function MusicProvider({ children }: { children: ReactNode }) {
  const musicOn = useSettingsStore((s) => s.musicOn);
  const setMusicOn = useSettingsStore((s) => s.setMusicOn);
  const bedtime = useSettingsStore((s) => s.bedtime);
  const mood: MusicMood = bedtime ? 'lullaby' : 'adventure';

  const [engine] = useState(() => new MusicEngine(createAudioContext));
  const [playing, setPlaying] = useState(false);
  // Faded out (e.g. the bedtime story ended): quiet until toggled back on.
  // Session-only on purpose, so the saved "music on" preference is untouched.
  const [faded, setFaded] = useState(false);

  // The first gesture has happened, so audio is allowed to start.
  const gestureSeen = useRef(false);

  // Latest values for the long-lived gesture listener.
  const latest = useRef({ musicOn, faded, mood });
  latest.current = { musicOn, faded, mood };

  // Follow the setting and the mood (Bedtime switches live).
  useEffect(() => {
    if (!musicOn) {
      engine.stop();
      setPlaying(false);
      return;
    }
    if (!gestureSeen.current || faded) return;
    engine.start(mood);
    setPlaying(engine.isRunning);
  }, [engine, musicOn, faded, mood]);

  // Start on the first gesture, if music is on.
  useEffect(() => {
    if (gestureSeen.current) return;
    const detach = () => {
      for (const type of GESTURE_EVENTS) window.removeEventListener(type, onGesture);
    };
    function onGesture() {
      gestureSeen.current = true;
      detach();
      const { musicOn: on, faded: isFaded, mood: currentMood } = latest.current;
      if (on && !isFaded) {
        engine.start(currentMood);
        setPlaying(engine.isRunning);
      }
    }
    for (const type of GESTURE_EVENTS) window.addEventListener(type, onGesture);
    return detach;
  }, [engine]);

  // A hidden tab should not keep queueing notes.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) engine.pause();
      else engine.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [engine]);

  useEffect(() => () => engine.stop(), [engine]);

  const toggle = useCallback(() => {
    // A click is a gesture too, so a first-ever toggle may start the audio.
    gestureSeen.current = true;
    const { musicOn: on, faded: isFaded, mood: currentMood } = latest.current;
    if (on && !isFaded) {
      setMusicOn(false); // the effect above stops the engine
      return;
    }
    setFaded(false);
    if (!on) setMusicOn(true);
    engine.start(currentMood); // inside the click, so the browser lets it through
    setPlaying(engine.isRunning);
  }, [engine, setMusicOn]);

  const duck = useCallback((on: boolean) => engine.duck(on), [engine]);

  const fadeOut = useCallback(() => {
    if (!engine.isRunning) return;
    engine.fadeOut();
    setFaded(true);
    setPlaying(false);
  }, [engine]);

  const value = useMemo<UseMusic>(
    () => ({ playing, enabled: musicOn && !faded, toggle, duck, fadeOut }),
    [playing, musicOn, faded, toggle, duck, fadeOut]
  );

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic(): UseMusic {
  return useContext(MusicContext);
}
