import { motion } from 'framer-motion';
import type { StorySetup } from '@/store/storyStore';
import type { Mood } from '@/api/types';
import { ARCHETYPES, WORLDS, MOOD_GRADIENT } from '@/lib/theme';

interface CharacterPanelProps {
  setup: StorySetup | null;
  avatarEmoji: string;
  mood: Mood;
  vocabulary: string[];
  isNarrating: boolean;
  muted: boolean;
  onToggleMute: () => void;
}

const MOOD_LABEL: Record<Mood, string> = {
  wonder: 'Wonder ✨',
  excitement: 'Excitement ⚡',
  mystery: 'Mystery 🔮',
  joy: 'Joy 🌈',
  calm: 'Calm 🌙',
};

/** Hero card + live story status shown above the choices on the Story page. */
export function CharacterPanel({
  setup,
  avatarEmoji,
  mood,
  vocabulary,
  isNarrating,
  muted,
  onToggleMute,
}: CharacterPanelProps) {
  const archetype = ARCHETYPES.find((a) => a.id === setup?.character_archetype);
  const world = WORLDS.find((w) => w.id === setup?.world);
  const grad = MOOD_GRADIENT[mood];

  return (
    <div className="glass rounded-[2rem] p-6">
      <div className="flex items-center gap-4">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-3xl shadow-[var(--shadow-soft)]"
          style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
        >
          {avatarEmoji}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-xl text-parchment">
            {setup?.character_name || 'Our Hero'}
          </p>
          <p className="text-sm text-parchment/70">
            {archetype ? `${archetype.emoji} ${archetype.label}` : ''}
            {world ? ` · ${world.emoji} ${world.label}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-3 py-1 text-sm font-semibold text-night-900"
          style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
        >
          {MOOD_LABEL[mood]}
        </span>
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          className="ml-auto flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-sm text-parchment/80 hover:bg-white/5"
        >
          {muted ? '🔇 Muted' : isNarrating ? '🔊 Reading…' : '🔊 Narration'}
        </button>
      </div>

      {vocabulary.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 font-display text-sm uppercase tracking-wider text-firefly/80">
            New words
          </p>
          <div className="flex flex-wrap gap-2">
            {vocabulary.map((word) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-full border border-firefly/40 bg-firefly/10 px-3 py-1 text-sm text-parchment"
              >
                {word}
              </motion.span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
