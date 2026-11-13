import { useMusic } from '@/hooks/useMusic';
import { useSettingsStore } from '@/store/settingsStore';
import { cn } from '@/lib/cn';

/**
 * The 🌙 Bedtime switch: shorter, calmer stories that end with a goodnight.
 * A labelled switch with a 44px tap target. Switching Bedtime off also lets the
 * music play again if the last bedtime story faded it out.
 */
export function BedtimeSwitch({ className }: { className?: string }) {
  const bedtime = useSettingsStore((s) => s.bedtime);
  const setBedtime = useSettingsStore((s) => s.setBedtime);
  const { clearFade } = useMusic();

  const toggle = () => {
    const next = !bedtime;
    setBedtime(next);
    if (!next) clearFade();
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={bedtime}
      onClick={toggle}
      className={cn(
        'inline-flex min-h-[44px] select-none items-center gap-2 rounded-full border px-4',
        'font-body text-sm font-semibold text-parchment transition-colors',
        bedtime
          ? 'border-firefly/60 bg-firefly/15'
          : 'border-white/15 bg-white/[0.06] hover:bg-white/10',
        className
      )}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        🌙
      </span>
      <span>Bedtime</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          bedtime ? 'bg-firefly' : 'bg-white/25'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-parchment shadow transition-[left]',
            bedtime ? 'left-[22px]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}
