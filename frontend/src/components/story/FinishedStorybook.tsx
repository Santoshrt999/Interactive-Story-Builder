import { motion } from 'framer-motion';
import type { EndStoryResponse } from '@/api/types';
import type { CompletedChapter } from '@/store/storyStore';
import { Button } from '@/components/ui/Button';
import { StarField } from '@/components/ui/StarField';
import { StoryBook } from './StoryBook';
import { StoryCertificate } from './StoryCertificate';
import { downloadStorybook } from '@/lib/downloadStorybook';

interface FinishedStorybookProps {
  data: EndStoryResponse;
  storyTitle: string | null;
  chapters: CompletedChapter[];
  avatarEmoji: string;
  childName: string;
  characterName: string;
  onDone: () => void;
}

/**
 * The end-of-story keepsake: flip through the whole finished book, view the
 * certificate, and download a printable HTML storybook.
 */
export function FinishedStorybook({
  data,
  storyTitle,
  chapters,
  avatarEmoji,
  childName,
  characterName,
  onDone,
}: FinishedStorybookProps) {
  const handleDownload = () => {
    downloadStorybook({
      storyTitle,
      chapters,
      certificate: data,
      childName,
      characterName,
      avatarEmoji,
    });
  };

  return (
    <div className="relative min-h-dvh">
      <StarField count={36} />

      <header className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
        <span className="font-display text-lg text-parchment/80">
          🎉 The end — your finished storybook
        </span>
        <Button variant="magic" size="sm" onClick={handleDownload}>
          ⬇️ Download my storybook
        </Button>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 pb-10">
        {chapters.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="h-[72dvh]"
          >
            <p className="mb-3 text-center text-parchment/70">
              Flip through your whole adventure — tap the arrows or use ← → keys.
            </p>
            <StoryBook title={storyTitle} completed={chapters} live={null} streaming={false} />
          </motion.div>
        )}

        <div className="mt-10">
          <StoryCertificate
            data={data}
            avatarEmoji={avatarEmoji}
            childName={childName}
            embedded
            onDone={onDone}
            onDownload={handleDownload}
          />
        </div>
      </main>
    </div>
  );
}
