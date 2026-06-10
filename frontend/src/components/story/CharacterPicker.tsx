import { motion } from 'framer-motion';
import type { CharacterArchetype } from '@/api/types';
import { ARCHETYPES } from '@/lib/theme';
import { cn } from '@/lib/cn';

interface CharacterPickerProps {
  name: string;
  archetype: CharacterArchetype | null;
  onNameChange: (name: string) => void;
  onArchetypeChange: (a: CharacterArchetype) => void;
}

/** Name + archetype + personality picker for a new hero. */
export function CharacterPicker({
  name,
  archetype,
  onNameChange,
  onArchetypeChange,
}: CharacterPickerProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <label
          htmlFor="hero-name"
          className="mb-2 block font-display text-lg text-parchment"
        >
          Name your hero
        </label>
        <input
          id="hero-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={24}
          placeholder="e.g. Luna, Max, Pip…"
          className="w-full rounded-2xl border border-white/10 bg-night-900/40 px-5 py-4 text-xl text-parchment placeholder:text-parchment/40"
        />
      </div>

      <div>
        <p className="mb-3 font-display text-lg text-parchment">
          What are they like?
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ARCHETYPES.map((a, i) => {
            const selected = archetype === a.id;
            return (
              <motion.button
                key={a.id}
                type="button"
                onClick={() => onArchetypeChange(a.id)}
                aria-pressed={selected}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-[1.25rem] border p-4 text-center transition-colors',
                  selected
                    ? 'border-firefly bg-firefly/15 shadow-[var(--shadow-glow)]'
                    : 'border-white/10 bg-night-900/30 hover:bg-white/5'
                )}
              >
                <span className="text-3xl">{a.emoji}</span>
                <span className="font-display text-base text-parchment">{a.label}</span>
                <span className="text-xs leading-snug text-parchment/60">{a.blurb}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
