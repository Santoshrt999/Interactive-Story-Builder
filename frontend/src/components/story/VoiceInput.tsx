import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface VoiceInputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  submitLabel?: string;
}

const BAR_DELAYS = ['0s', '0.15s', '0.3s', '0.45s', '0.2s', '0.05s'];

function Waveform() {
  return (
    <div className="flex h-6 items-end gap-[3px]" aria-hidden>
      {BAR_DELAYS.map((delay, i) => (
        <span
          key={i}
          className="animate-wave w-[3px] rounded-full bg-night-900"
          style={{ height: '100%', animationDelay: delay }}
        />
      ))}
    </div>
  );
}

/**
 * Mic-button voice input with pulsing waveform, live interim transcript, and a
 * 2s-silence auto-submit. Falls back to a text field when SpeechRecognition is
 * unavailable. Skip is always handled by the parent.
 */
export function VoiceInput({
  onSubmit,
  placeholder = 'Tap the mic and tell me…',
  submitLabel = 'Send',
}: VoiceInputProps) {
  const [text, setText] = useState('');

  const voice = useVoiceInput((finalText) => {
    setText(finalText);
    onSubmit(finalText);
  });

  // Mirror interim/final speech into the editable field while recording.
  useEffect(() => {
    if (voice.isRecording) {
      const live = `${voice.finalTranscript} ${voice.interim}`.trim();
      if (live) setText(live);
    }
  }, [voice.isRecording, voice.finalTranscript, voice.interim]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed) onSubmit(trimmed);
  };

  if (!voice.supported) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-parchment/70">
          Voice isn&apos;t available here — type your answer instead!
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none rounded-2xl border border-white/10 bg-night-900/40 p-4 text-parchment placeholder:text-parchment/40"
        />
        <Button variant="magic" size="lg" onClick={handleSubmit} disabled={!text.trim()}>
          {submitLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {voice.isRecording && (
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-blossom/50" />
        )}
        <button
          type="button"
          onClick={() => (voice.isRecording ? voice.stop() : voice.start())}
          aria-pressed={voice.isRecording}
          aria-label={voice.isRecording ? 'Stop recording' : 'Start recording'}
          className={cn(
            'relative grid h-24 w-24 place-items-center rounded-full transition-transform active:scale-95',
            'shadow-[var(--shadow-soft)]',
            voice.isRecording
              ? 'bg-gradient-to-br from-blossom to-firefly'
              : 'bg-gradient-to-br from-aurora to-sky'
          )}
        >
          {voice.isRecording ? <Waveform /> : <span className="text-4xl">🎤</span>}
        </button>
      </div>

      <p className="text-sm font-medium text-parchment/80">
        {voice.isRecording ? 'Listening… (I’ll wait, then send)' : 'Tap to speak'}
      </p>

      {(text || voice.interim) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-2xl border border-white/10 bg-night-900/40 p-4 text-center text-parchment"
        >
          <span>{voice.finalTranscript || text}</span>
          {voice.interim && <span className="text-parchment/50"> {voice.interim}</span>}
        </motion.div>
      )}

      {!voice.isRecording && text.trim() && (
        <Button variant="magic" size="lg" onClick={handleSubmit}>
          {submitLabel}
        </Button>
      )}
    </div>
  );
}
