import { AnimatePresence, motion } from 'framer-motion';
import { VoiceInput } from './VoiceInput';
import { Button } from '@/components/ui/Button';

interface CuriosityPromptProps {
  open: boolean;
  question: string | null;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
  submitting?: boolean;
}

/**
 * Socratic curiosity question overlay. Soft card, voice answer, and an
 * always-available Skip so a child is never blocked.
 */
export function CuriosityPrompt({
  open,
  question,
  onAnswer,
  onSkip,
  submitting,
}: CuriosityPromptProps) {
  return (
    <AnimatePresence>
      {open && question && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-night-900/70 backdrop-blur-sm"
            onClick={onSkip}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="A curious question"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="glass relative w-full max-w-lg rounded-[2rem] p-8 text-center shadow-[var(--shadow-glow)]"
          >
            <div className="animate-float-slow mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-firefly to-blossom text-3xl">
              💭
            </div>
            <p className="font-display text-sm uppercase tracking-[0.2em] text-firefly/80">
              A curious thought…
            </p>
            <h3 className="mt-2 mb-6 font-display text-2xl leading-snug text-parchment">
              {question}
            </h3>

            {submitting ? (
              <p className="py-6 text-parchment/70">Thinking about your answer…</p>
            ) : (
              <VoiceInput
                onSubmit={onAnswer}
                placeholder="Share what you think…"
                submitLabel="Tell the story"
              />
            )}

            <Button variant="ghost" size="md" className="mt-5" onClick={onSkip}>
              Skip this question →
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
