import { motion } from 'framer-motion';
import type { EndStoryResponse } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { StarField } from '@/components/ui/StarField';
import { nameWithHeart } from '@/lib/theme';

interface StoryCertificateProps {
  data: EndStoryResponse;
  avatarEmoji: string;
  onDone: () => void;
  /** Override the certificate's child name (e.g. to add a ♥ for Shreyu). */
  childName?: string;
  /** When embedded inside a larger page, drop the full-screen wrapper + stars. */
  embedded?: boolean;
  /** Optional download action shown alongside the "another adventure" button. */
  onDownload?: () => void;
}

/** Celebration screen shown after POST /story/end. */
export function StoryCertificate({
  data,
  avatarEmoji,
  onDone,
  childName,
  embedded = false,
  onDownload,
}: StoryCertificateProps) {
  const { certificate, vocabulary } = data;
  const displayChild = nameWithHeart(childName ?? certificate.child_name);

  const card = (
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        className="relative w-full max-w-2xl rounded-[2.5rem] border-4 border-firefly/60 bg-parchment p-10 text-center text-ink shadow-[var(--shadow-glow)]"
      >
        <div className="animate-float-slow mx-auto mb-2 text-6xl">{avatarEmoji}</div>
        <p className="font-display text-sm uppercase tracking-[0.3em] text-ink/50">
          Certificate of Adventure
        </p>
        <h1 className="mt-3 font-display text-4xl text-blossom sm:text-5xl">
          {certificate.title}
        </h1>
        <p className="mt-4 text-lg text-ink/80">
          Awarded to <strong>{displayChild}</strong> and their hero{' '}
          <strong>{certificate.character_name}</strong>
        </p>
        <p className="mx-auto mt-3 max-w-md text-ink/70">{certificate.achievement}</p>

        {vocabulary.length > 0 && (
          <div className="mt-8 rounded-[1.5rem] bg-ink/5 p-5 text-left">
            <p className="mb-3 font-display text-lg text-ink">Words you collected 📖</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {vocabulary.map((v) => (
                <li key={v.word} className="text-sm">
                  <span className="font-display text-blossom">{v.word}</span> —{' '}
                  <span className="text-ink/70">{v.definition}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {onDownload && (
            <Button variant="secondary" size="lg" onClick={onDownload}>
              ⬇️ Download storybook
            </Button>
          )}
          <Button variant="magic" size="xl" onClick={onDone}>
            🎉 Another adventure!
          </Button>
        </div>
      </motion.div>
  );

  if (embedded) {
    return <div className="grid place-items-center">{card}</div>;
  }

  return (
    <div className="relative grid min-h-dvh place-items-center p-6">
      <StarField count={48} />
      {card}
    </div>
  );
}
