import { AnimatePresence, motion } from 'framer-motion';

interface ChapterRevealProps {
  sentences: string[];
}

/**
 * Animated per-sentence story reveal. Each streamed sentence rises and fades
 * in with a gentle stagger, evoking words appearing on an enchanted page.
 */
export function ChapterReveal({ sentences }: ChapterRevealProps) {
  return (
    <p className="font-display text-[1.35rem] leading-relaxed text-ink sm:text-[1.6rem] sm:leading-[1.7]">
      <AnimatePresence initial={false}>
        {sentences.map((sentence, i) => (
          <motion.span
            key={`${i}-${sentence.slice(0, 12)}`}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.55, ease: [0.2, 0.8, 0.3, 1] }}
            className="inline"
          >
            {sentence.trim()}{' '}
          </motion.span>
        ))}
      </AnimatePresence>
    </p>
  );
}
