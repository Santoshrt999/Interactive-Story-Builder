import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface StoryChoiceCardsProps {
  choices: readonly [string, string, string];
  onChoose: (choice: string) => void;
  disabled?: boolean;
}

const ACCENTS = [
  'from-blossom/90 to-firefly/80',
  'from-aurora/90 to-sky/80',
  'from-mint/90 to-sky/80',
];

const ICONS = ['🌟', '🍃', '🔮'];

/** Three branching choice cards that slide up at the end of a chapter. */
export function StoryChoiceCards({ choices, onChoose, disabled }: StoryChoiceCardsProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 font-display text-lg text-parchment/90">What happens next?</p>
      {choices.map((choice, i) => (
        <motion.button
          key={`${i}-${choice}`}
          type="button"
          disabled={disabled}
          onClick={() => onChoose(choice)}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 * i, duration: 0.5, ease: [0.2, 0.8, 0.3, 1] }}
          whileHover={disabled ? undefined : { scale: 1.02, y: -2 }}
          whileTap={disabled ? undefined : { scale: 0.98 }}
          className={cn(
            'group relative flex w-full items-center gap-4 overflow-hidden rounded-[1.5rem] p-5 text-left',
            'min-h-[72px] border border-white/10 shadow-[var(--shadow-soft)]',
            'bg-gradient-to-br',
            ACCENTS[i],
            'text-night-900 transition-[filter] hover:brightness-105',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-night-900/15 text-2xl"
          >
            {ICONS[i]}
          </span>
          <span className="font-display text-lg leading-snug">{choice}</span>
          <span
            aria-hidden
            className="ml-auto text-2xl opacity-0 transition-opacity group-hover:opacity-100"
          >
            →
          </span>
        </motion.button>
      ))}
    </div>
  );
}
