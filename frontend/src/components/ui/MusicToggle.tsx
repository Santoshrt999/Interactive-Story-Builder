import { Button } from '@/components/ui/Button';
import { useMusic } from '@/hooks/useMusic';
import { cn } from '@/lib/cn';

/** The little 🎵 button in each page header: turns the background music on or off. */
export function MusicToggle({ className }: { className?: string }) {
  const { enabled, toggle } = useMusic();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={enabled ? 'Music on' : 'Music off'}
      aria-pressed={enabled}
      title={enabled ? 'Music on' : 'Music off'}
      // 44px tap target (the "!" beats Button's own min-height / padding). The pale
      // backing keeps the dark 🎵 glyph visible on the night-sky background.
      className={cn('min-h-[44px]! min-w-[44px]! px-3! bg-parchment/50! hover:bg-parchment/65!', className)}
    >
      <span
        aria-hidden="true"
        className={cn('relative text-xl leading-none transition-opacity', !enabled && 'opacity-50')}
      >
        🎵
        {!enabled && (
          <span className="absolute left-1/2 top-1/2 h-0.5 w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded bg-ink" />
        )}
      </span>
    </Button>
  );
}
