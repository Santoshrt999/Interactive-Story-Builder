import { useMemo } from 'react';

interface Star {
  left: string;
  top: string;
  size: number;
  delay: string;
  char: string;
}

const GLYPHS = ['✦', '✧', '·', '⋆', '✶'];

/** Decorative twinkling starfield for the magical backdrop. Purely cosmetic. */
export function StarField({ count = 36 }: { count?: number }) {
  const stars = useMemo<Star[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      left: `${(i * 37.5) % 100}%`,
      top: `${(i * 53.7) % 100}%`,
      size: 8 + ((i * 7) % 16),
      delay: `${(i % 7) * 0.5}s`,
      char: GLYPHS[i % GLYPHS.length],
    }));
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="animate-twinkle absolute text-firefly/70"
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
