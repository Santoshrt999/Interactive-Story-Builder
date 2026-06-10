import { motion } from 'framer-motion';
import type { Story } from '@/api/types';
import { Card, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { WORLDS, STORY_THEMES } from '@/lib/theme';

interface StoryHistoryProps {
  stories: Story[] | undefined;
  loading: boolean;
  error: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function StoryHistory({ stories, loading, error }: StoryHistoryProps) {
  if (loading) return <Spinner label="Opening the storybook…" className="py-16" />;
  if (error)
    return (
      <Card>
        <p className="text-parchment/80">We couldn&apos;t load past adventures.</p>
      </Card>
    );

  if (!stories || stories.length === 0)
    return (
      <Card>
        <CardTitle>Past adventures</CardTitle>
        <p className="mt-3 text-parchment/70">
          No stories yet — the first adventure is waiting to be written! ✨
        </p>
      </Card>
    );

  return (
    <Card>
      <CardTitle>Past adventures</CardTitle>
      <ol className="relative mt-6 ml-3 border-l-2 border-white/10">
        {stories.map((story, i) => {
          const world = WORLDS.find((w) => w.id === story.world);
          const theme = STORY_THEMES.find((t) => t.id === story.theme);
          return (
            <motion.li
              key={story.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="mb-6 ml-6"
            >
              <span className="absolute -left-[11px] grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-blossom to-firefly text-[10px]">
                {world?.emoji ?? '📖'}
              </span>
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-display text-lg text-parchment">{story.title}</h4>
                  <time className="text-xs text-parchment/50">
                    {formatDate(story.created_at)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-parchment/70">
                  {story.character_name ? `${story.character_name} · ` : ''}
                  {theme ? `${theme.emoji} ${theme.label}` : ''}
                  {typeof story.chapter_count === 'number'
                    ? ` · ${story.chapter_count} chapters`
                    : ''}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </Card>
  );
}
