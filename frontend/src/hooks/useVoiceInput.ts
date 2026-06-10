import { useCallback, useEffect, useRef, useState } from 'react';

const SILENCE_MS = 2000;

function getRecognitionCtor(): SpeechRecognitionStatic | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInput {
  supported: boolean;
  isRecording: boolean;
  interim: string;
  finalTranscript: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Web Speech API hook.
 * - Live interim + final transcript.
 * - Auto-stops after 2s of silence and fires onFinal with the accumulated text.
 * - Gracefully reports `supported: false` so callers can show a text fallback.
 */
export function useVoiceInput(onFinal?: (text: string) => void): UseVoiceInput {
  const ctorRef = useRef<SpeechRecognitionStatic | null>(getRecognitionCtor());
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalRef = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const [supported] = useState<boolean>(() => ctorRef.current !== null);
  const [isRecording, setIsRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');

  const clearSilence = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearSilence();
    recognitionRef.current?.stop();
  }, [clearSilence]);

  const armSilence = useCallback(() => {
    clearSilence();
    silenceTimer.current = setTimeout(() => {
      stop();
    }, SILENCE_MS);
  }, [clearSilence, stop]);

  const reset = useCallback(() => {
    finalRef.current = '';
    setFinalTranscript('');
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const Ctor = ctorRef.current;
    if (!Ctor) return;

    // Fresh instance each session for reliability across browsers.
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    finalRef.current = '';
    setFinalTranscript('');
    setInterim('');

    rec.onstart = () => {
      setIsRecording(true);
      armSilence();
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalRef.current = `${finalRef.current} ${transcript}`.trim();
        } else {
          interimText += transcript;
        }
      }
      setFinalTranscript(finalRef.current);
      setInterim(interimText);
      armSilence();
    };

    rec.onerror = () => {
      clearSilence();
      setIsRecording(false);
    };

    rec.onend = () => {
      clearSilence();
      setIsRecording(false);
      setInterim('');
      const text = finalRef.current.trim();
      if (text) onFinalRef.current?.(text);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      // start() throws if already started; ignore.
    }
  }, [armSilence, clearSilence]);

  useEffect(() => {
    return () => {
      clearSilence();
      recognitionRef.current?.abort();
    };
  }, [clearSilence]);

  return { supported, isRecording, interim, finalTranscript, start, stop, reset };
}
