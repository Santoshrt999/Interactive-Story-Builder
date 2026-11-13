import { cn } from '@/lib/cn';

/** A buddy emoji on its gradient tile. */
export function AvatarChip({
  emoji,
  from,
  to,
  size = 'md',
}: {
  emoji: string;
  from: string;
  to: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center shadow-[var(--shadow-soft)]',
        size === 'lg' && 'h-24 w-24 rounded-[1.5rem] text-5xl',
        size === 'md' && 'h-16 w-16 rounded-[1.5rem] text-3xl',
        size === 'sm' && 'h-11 w-11 rounded-2xl text-2xl'
      )}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {emoji}
    </div>
  );
}
