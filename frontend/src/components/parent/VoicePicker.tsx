import { useEffect, useMemo, useState } from 'react';
import { useVoices } from '@/hooks/useVoices';
import { isNatural, pickVoice, rankVoices } from '@/lib/voices';
import { narratorVoice } from '@/lib/speechQueue';
import { useSettingsStore } from '@/store/settingsStore';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

const SAMPLE =
  'Once upon a time, a little fox curled up under the stars, and whispered goodnight to the moon.';

/**
 * Parent corner: choose the storyteller's voice from the device's installed
 * voices (best first), with a ▶︎ preview. When no natural voice is installed,
 * explain how to download one on a Mac.
 */
export function VoicePicker() {
  const voices = useVoices();
  const ranked = useMemo(() => rankVoices(voices).slice(0, 8), [voices]);
  const voiceName = useSettingsStore((s) => s.voiceName);
  const setVoiceName = useSettingsStore((s) => s.setVoiceName);
  const bedtime = useSettingsStore((s) => s.bedtime);
  const current = pickVoice(voices, voiceName);
  const hasNatural = ranked.some(isNatural);
  const [previewing, setPreviewing] = useState<string | null>(null);

  // Stop any preview when leaving the page.
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const preview = (voice: SpeechSynthesisVoice) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (previewing === voice.name) {
      setPreviewing(null);
      return;
    }
    const utter = new SpeechSynthesisUtterance(SAMPLE);
    utter.voice = voice;
    utter.lang = voice.lang;
    const { rate, pitch } = narratorVoice(bedtime);
    utter.rate = rate;
    utter.pitch = pitch;
    utter.onend = utter.onerror = () => setPreviewing((p) => (p === voice.name ? null : p));
    setPreviewing(voice.name);
    synth.speak(utter);
  };

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  return (
    <Card>
      <CardTitle>Storyteller&apos;s voice 🎙️</CardTitle>
      <p className="mt-1 text-sm text-parchment/70">
        Pick who reads the stories aloud. Tap ▶︎ to hear a voice.
      </p>

      {!hasNatural && (
        <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-parchment/85">
          <p className="font-semibold text-firefly">Want a softer, more natural voice?</p>
          <p className="mt-1">
            On a Mac, open <b>System Settings → Accessibility → Spoken Content</b>, click the{' '}
            <b>ⓘ</b> next to <b>System voice</b> (or choose <b>Manage Voices…</b>), open{' '}
            <b>English</b> and download <b>Zoe (Premium)</b> or <b>Ava (Premium)</b>. Then reload
            this page — they&apos;ll appear here with a ✨.
          </p>
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="mt-4 text-parchment/70">No English voices found on this device.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Storyteller voice">
          {ranked.map((voice) => {
            const selected = current?.name === voice.name;
            return (
              <li key={voice.name} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setVoiceName(voice.name)}
                  className={cn(
                    'flex min-h-[48px] flex-1 items-center justify-between gap-3 rounded-2xl px-4 text-left transition',
                    selected
                      ? 'bg-firefly/20 ring-2 ring-firefly text-parchment'
                      : 'bg-white/5 text-parchment/85 hover:bg-white/10'
                  )}
                >
                  <span>
                    {isNatural(voice) && <span aria-label="natural voice">✨ </span>}
                    {voice.name}
                    <span className="ml-2 text-xs text-parchment/60">{voice.lang}</span>
                  </span>
                  {selected && <span aria-hidden>✓</span>}
                </button>
                <Button
                  variant="secondary"
                  className="min-h-[48px] min-w-[48px] px-3"
                  aria-label={
                    previewing === voice.name ? `Stop ${voice.name}` : `Hear ${voice.name}`
                  }
                  onClick={() => preview(voice)}
                >
                  {previewing === voice.name ? '⏹' : '▶︎'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {voiceName && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setVoiceName(null)}>
          Use the best voice automatically
        </Button>
      )}
    </Card>
  );
}
