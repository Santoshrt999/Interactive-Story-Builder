import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useStoryStore } from '@/store/storyStore';
import { useProfiles } from '@/hooks/useProfiles';
import { useParentLock } from '@/hooks/useParentLock';
import { useDashboard, useStoryHistory } from '@/hooks/useDashboard';
import { pickSelectedChild } from '@/lib/profiles';
import { nameWithHeart } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { ParentDashboard } from '@/components/dashboard/ParentDashboard';
import { StoryHistory } from '@/components/dashboard/StoryHistory';
import { ChildSwitcher } from '@/components/parent/ChildSwitcher';
import { ManageProfiles } from '@/components/parent/ManageProfiles';
import { PinPad } from '@/components/parent/PinPad';
import { Button } from '@/components/ui/Button';
import { MusicToggle } from '@/components/ui/MusicToggle';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

export function ParentView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lock = useParentLock();
  const { unlocked } = lock;
  const profilesQuery = useProfiles();
  const profiles = profilesQuery.data ?? [];
  const activeProfile = useStoryStore((s) => s.activeProfile);

  // Whose insights to show: the tab the parent picked, else the active child.
  // Picking one here never changes who is playing on Home.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const childId = pickSelectedChild(profiles, pickedId, activeProfile?.id);
  const child = profiles.find((p) => p.id === childId);

  // Once opened, the corner stays mounted (hidden) if the lock closes, so a
  // profile being edited keeps what was typed while the PIN pad asks again.
  const [opened, setOpened] = useState(unlocked);
  if (unlocked && !opened) setOpened(true);

  // The insights need the lock open. When it closes, forget them.
  const dashboard = useDashboard(childId ?? undefined, unlocked);
  const history = useStoryHistory(childId ?? undefined, unlocked);
  useEffect(() => {
    if (unlocked) return;
    queryClient.removeQueries({ queryKey: ['dashboard'] });
    queryClient.removeQueries({ queryKey: ['history'] });
  }, [unlocked, queryClient]);

  const lockNow = () => {
    void lock.lock();
    navigate('/');
  };

  return (
    <div className="relative min-h-dvh">
      {!opened && (
        <header className="mx-auto max-w-5xl px-6 pt-6">
          <h1 className="font-display text-3xl text-parchment">Parent corner</h1>
        </header>
      )}

      {opened && (
        <div inert={!unlocked} className={cn(!unlocked && 'invisible')}>
          <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <div>
              <h1 className="font-display text-3xl text-parchment">Parent corner</h1>
              {child && (
                <p className="text-parchment/70">
                  Insights for {nameWithHeart(child)}, age {child.age}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <MusicToggle />
              <Button variant="secondary" onClick={lockNow}>
                🔒 Lock now
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                ← Back to play
              </Button>
            </div>
          </header>

          <main className="mx-auto max-w-5xl px-6 pb-20 pt-8">
            {profilesQuery.isLoading ? (
              <Spinner label="Finding your storytellers…" className="py-16" />
            ) : profiles.length === 0 ? (
              <Card className="text-center">
                <p className="text-parchment">
                  {profilesQuery.isError
                    ? 'We couldn’t reach the server to load the profiles.'
                    : 'There are no storytellers yet. Make one on the home screen.'}
                </p>
                <Button variant="magic" className="mt-4" onClick={() => navigate('/')}>
                  Go home
                </Button>
              </Card>
            ) : (
              <div className="flex flex-col gap-10">
                <ChildSwitcher profiles={profiles} selectedId={childId} onSelect={setPickedId}>
                  <ParentDashboard
                    data={dashboard.data}
                    loading={dashboard.isLoading}
                    error={dashboard.isError}
                  />
                  <StoryHistory
                    stories={history.data}
                    loading={history.isLoading}
                    error={history.isError}
                  />
                </ChildSwitcher>
                <ManageProfiles profiles={profiles} />
              </div>
            )}
          </main>
        </div>
      )}

      <AnimatePresence>
        {!unlocked && lock.pinSet !== undefined && (
          <PinPad
            key={lock.pinSet ? 'unlock' : 'create'}
            mode={lock.pinSet ? 'unlock' : 'create'}
            onUnlocked={() => undefined}
            onClose={() => navigate('/')}
          />
        )}
      </AnimatePresence>

      {!unlocked && lock.pinSet === undefined && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <Card className="w-full max-w-xs text-center">
            {lock.statusError ? (
              <>
                <p className="text-parchment">We couldn’t reach the server.</p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button variant="magic" onClick={() => void lock.refetchStatus()}>
                    Try again
                  </Button>
                  <Button variant="ghost" onClick={() => navigate('/')}>
                    ← Back to play
                  </Button>
                </div>
              </>
            ) : (
              <Spinner label="Checking the lock…" />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
