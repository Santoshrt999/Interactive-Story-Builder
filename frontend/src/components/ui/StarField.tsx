import { useMemo } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { cn } from '@/lib/cn';

interface Star {
  left: string;
  top: string;
  size: number;
  delay: string;
  char: string;
}

const GLYPHS = ['✦', '✧', '·', '⋆', '✶'];

/** A calm sky keeps about this share of the stars, and the fewest it ever shows. */
const CALM_SHARE = 0.4;
const CALM_MIN = 6;

/**
 * Decorative starfield for the magical backdrop. Purely cosmetic.
 *
 * `calm` gives a sleepier sky: fewer, dimmer stars that breathe very slowly
 * instead of twinkling. It follows Bedtime mode unless a page says otherwise.
 */
export function StarField({ count = 36, calm }: { count?: number; calm?: boolean }) {
  const bedtime = useSettingsStore((s) => s.bedtime);
  const isCalm = calm ?? bedtime;
  const total = isCalm ? Math.max(CALM_MIN, Math.round(count * CALM_SHARE)) : count;

  const stars = useMemo<Star[]>(() => {
    return Array.from({ length: total }, (_, i) => ({
      left: `${(i * 37.5) % 100}%`,
      top: `${(i * 53.7) % 100}%`,
      size: 8 + ((i * 7) % 16),
      delay: `${(i % 7) * 0.5}s`,
      char: GLYPHS[i % GLYPHS.length],
    }));
  }, [total]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className={cn(
            'absolute',
            isCalm ? 'animate-star-breathe text-firefly/50' : 'animate-twinkle text-firefly/70'
          )}
          style={{
            left: s.left,
            top: s.top,
            fontSize: `${s.size}px`,
            animationDelay: s.delay,
          }}
        >
          {s.char}
        </span>
      ))}
    </div>
  );
}
