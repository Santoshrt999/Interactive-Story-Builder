import { cn } from '@/lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3', className)} role="status">
      <div className="relative h-12 w-12">
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-white/15 border-t-firefly" />
        <span className="absolute inset-0 flex items-center justify-center text-lg">✨</span>
      </div>
      {label ? <p className="text-sm text-parchment/70">{label}</p> : null}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
