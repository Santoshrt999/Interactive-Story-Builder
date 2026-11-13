import type { KeyboardEvent, ReactNode } from 'react';
import { avatarById, nameWithHeart } from '@/lib/theme';
import type { ChildProfile } from '@/api/types';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { cn } from '@/lib/cn';

const tabId = (id: string) => `child-tab-${id}`;
const PANEL_ID = 'child-panel';

interface ChildSwitcherProps {
  profiles: ChildProfile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** What the selected child's tab shows. */
  children: ReactNode;
}

/**
 * One tab per child: pick whose insights the Parent corner shows (the children
 * of this component are the tab's panel). This is only a view choice; it never
 * changes who is playing on Home.
 */
export function ChildSwitcher({ profiles, selectedId, onSelect, children }: ChildSwitcherProps) {
  // Arrow keys move between tabs; only the selected tab is in the Tab order.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = profiles.findIndex((p) => p.id === selectedId);
    if (index < 0) return;
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % profiles.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + profiles.length) % profiles.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = profiles.length - 1;
    else return;
    e.preventDefault();
    onSelect(profiles[next].id);
    document.getElementById(tabId(profiles[next].id))?.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Choose a child"
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-2"
      >
        {profiles.map((p) => {
          const selected = p.id === selectedId;
          const avatar = avatarById(p.avatar_id);
          return (
            <button
              key={p.id}
              id={tabId(p.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={PANEL_ID}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(p.id)}
              className={cn(
                'flex min-h-[48px] items-center gap-2 rounded-full border py-1 pl-1 pr-4 font-semibold transition-colors',
                selected
                  ? 'border-firefly bg-firefly/15 text-parchment shadow-[var(--shadow-glow)]'
                  : 'border-white/10 bg-white/[0.04] text-parchment/80 hover:bg-white/[0.08]'
              )}
            >
              <AvatarChip emoji={avatar.emoji} from={avatar.from} to={avatar.to} size="sm" />
              <span>{nameWithHeart(p)}</span>
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={selectedId ? tabId(selectedId) : undefined}
        className="flex flex-col gap-8"
      >
        {children}
      </div>
    </div>
  );
}
