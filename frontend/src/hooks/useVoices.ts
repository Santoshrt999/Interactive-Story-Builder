import { useEffect, useState } from 'react';

/**
 * The device's speech voices. They load asynchronously (and change when the
 * parent downloads a new voice), so re-read them on `voiceschanged`.
 */
export function useVoices(): SpeechSynthesisVoice[] {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    supported ? window.speechSynthesis.getVoices() : []
  );

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  return voices;
}
