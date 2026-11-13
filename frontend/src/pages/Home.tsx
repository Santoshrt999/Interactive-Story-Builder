import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { useProfiles } from '@/hooks/useProfiles';
import { useParentLock } from '@/hooks/useParentLock';
import { ACTIVE_STORY_KEY, useActiveStory } from '@/hooks/useActiveStory';
import { useMusic } from '@/hooks/useMusic';
import { useStoryStore } from '@/store/storyStore';
import { useSettingsStore } from '@/store/settingsStore';
import { eveningKey, shouldSuggestBedtime } from '@/lib/bedtime';
import { chapterLabel } from '@/lib/chapterFlow';
import { relativeDay } from '@/lib/relativeDay';
import { resolveActiveProfile } from '@/lib/profiles';
import { avatarById, nameWithHeart } from '@/lib/theme';
import type { ChildProfile } from '@/api/types';
import { PinPad } from '@/components/parent/PinPad';
import { ProfileForm } from '@/components/parent/ProfileForm';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { Button } from '@/components/ui/Button';
import { MusicToggle } from '@/components/ui/MusicToggle';
import { BedtimeSwitch } from '@/components/ui/BedtimeSwitch';
import { StarField } from '@/components/ui/StarField';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

/**
 * "📖 Continue <story> — Chapter 2 of 3": one tap reopens the child's unfinished
 * story where it stopped. Shows nothing while loading, on an error, or when
 * there is no unfinished story — it never gets in the way of a new adventure.
 */
function ContinueStory({ childId }: { childId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearFade } = useMusic();
  const resumeSession = useStoryStore((s) => s.resumeSession);
  const { data: active } = useActiveStory(childId);

  const resume = useMutation({
    mutationFn: api.resumeStory,
    onSuccess: (r) => {
      resumeSession(r);
      // A bedtime story brings its look, music and narrator voice along.
      if (r.bedtime) useSettingsStore.getState().setBedtime(true);
      clearFade(); // a story is starting again: music plays after a bedtime fade-out
      navigate('/story');
    },
    onError: (err) => {
      // 404/409: the story is gone or already finished, so stop offering it.
      if (isStoryGone(err)) void queryClient.invalidateQueries({ queryKey: ACTIVE_STORY_KEY });
    },
  });

  const when = active ? relativeDay(new Date(active.updated_at), new Date()) : '';

  return (
    <>
      {active && (
        <Button
          variant="primary"
          size="lg"
          onClick={() => resume.mutate(active.story_id)}
          disabled={resume.isPending}
          className="h-auto w-full max-w-2xl flex-col gap-0.5 whitespace-normal text-center leading-snug"
        >
          {resume.isPending ? (
            <span>Opening your book…</span>
          ) : (
            <>
              <span>
                📖 Continue <em className="font-display">{active.title}</em> —{' '}
                <span className="whitespace-nowrap">
                  {chapterLabel(active.chapter_count, active.max_chapters)}
                </span>
              </span>
              {when && <span className="text-sm font-normal opacity-80">Left off {when}</span>}
            </>
          )}
        </Button>
      )}
      {resume.isError && (
        <p role="alert" className="max-w-xl text-center text-blossom">
          {isStoryGone(resume.error)
            ? 'That story can’t be continued any more. Why not start a new adventure?'
            : 'We couldn’t open your story just now. Please try again.'}
        </p>
      )}
    </>
  );
}

function isStoryGone(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 409);
}

export function Home() {
  const navigate = useNavigate();
  const { data: profiles, isLoading, isError, isSuccess } = useProfiles();
  const activeProfile = useStoryStore((s) => s.activeProfile);
  const setActiveProfile = useStoryStore((s) => s.setActiveProfile);
  const lock = useParentLock();

  const [creating, setCreating] = useState(false);
  // The profile being edited (✏️). Editing needs the parent lock open.
  const [editing, setEditing] = useState<ChildProfile | null>(null);

  // In the evening (19:00-06:00), once per evening, switch Bedtime on. Read the
  // settings fresh, so a second run (React StrictMode) sees the first one's mark.
  useEffect(() => {
    const now = new Date();
    const { lastBedtimeSuggestion, setBedtime, markSuggested } = useSettingsStore.getState();
    if (shouldSuggestBedtime(now, lastBedtimeSuggestion)) {
      setBedtime(true);
      markSuggested(eveningKey(now));
    }
  }, []);

  // The server seeds the default storyteller. Keep the active profile in step
  // with the list: pick the default when nobody is active (or the saved one is
  // gone), and refresh a saved copy that was renamed meanwhile.
  useEffect(() => {
    if (!isSuccess || !profiles) return;
    const next = resolveActiveProfile(profiles, activeProfile);
    if (next !== activeProfile) setActiveProfile(next);
  }, [isSuccess, profiles, activeProfile, setActiveProfile]);

  const handlePick = (p: ChildProfile) => {
    setActiveProfile(p);
  };

  const startAdventure = () => {
    if (activeProfile) navigate('/setup');
  };

  return (
    <div className="relative min-h-dvh">
      <StarField />

      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 pt-6">
        <div className="flex items-center gap-3">
          <span className="animate-float-slow text-4xl">📖</span>
          <span className="font-display text-2xl text-parchment text-glow">StoryWeaver</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <BedtimeSwitch />
          <MusicToggle />
          <Button variant="ghost" size="sm" onClick={() => navigate('/parent')}>
            👪 Parents
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <p className="mb-3 font-display text-lg text-firefly text-glow sm:text-2xl">
            Welcome to Fantasy Story Land ✨
          </p>
          <h1 className="font-display text-5xl leading-tight text-parchment text-glow sm:text-7xl">
            Let&apos;s dream up a<br />
            <span className="bg-gradient-to-r from-firefly via-blossom to-sky bg-clip-text text-transparent">
              magical hero
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-parchment/75">
            Pick your storyteller, imagine a brave hero, and turn the page on an adventure
            that&apos;s yours alone. ✨
          </p>
        </motion.div>

        <section className="mt-12">
          {isLoading ? (
            <Spinner label="Finding your storytellers…" className="py-16" />
          ) : creating ? (
            <ProfileForm
              onSaved={(p) => {
                setActiveProfile(p);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : editing ? (
            // Stays mounted if the parent lock closes mid-edit: the PIN pad asks
            // again over a hidden form, so nothing typed is lost.
            <div inert={!lock.unlocked} className={cn(!lock.unlocked && 'invisible')}>
              <ProfileForm
                key={editing.id}
                initial={editing}
                onSaved={() => setEditing(null)}
                onDeleted={() => setEditing(null)}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-display text-2xl text-parchment">Who&apos;s adventuring?</h2>
                <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                  ＋ New storyteller
                </Button>
              </div>

              {isError && (
                <p className="mb-4 text-parchment/70">
                  Couldn&apos;t reach the server — you can still create a new storyteller.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {(profiles ?? []).map((p, i) => {
                  const avatar = avatarById(p.avatar_id);
                  const selected = activeProfile?.id === p.id;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      whileHover={{ y: -4 }}
                      className="relative"
                    >
                      <button
                        type="button"
                        onClick={() => handlePick(p)}
                        aria-pressed={selected}
                        className={cn(
                          'flex h-full w-full flex-col items-center gap-3 rounded-[2rem] border p-6 transition-[transform,background-color] active:scale-[0.97]',
                          selected
                            ? 'border-firefly bg-firefly/10 shadow-[var(--shadow-glow)]'
                            : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                        )}
                      >
                        <AvatarChip
                          emoji={avatar.emoji}
                          from={avatar.from}
                          to={avatar.to}
                          size="lg"
                        />
                        <span className="font-display text-lg text-parchment">
                          {nameWithHeart(p)}
                        </span>
                        <span className="text-sm text-parchment/60">Age {p.age}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${p.name}`}
                        title="Edit (grown-ups)"
                        onClick={() => setEditing(p)}
                        className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
                      >
                        <span aria-hidden="true">✏️</span>
                      </button>
                    </motion.div>
                  );
                })}

                <motion.button
                  type="button"
                  onClick={() => setCreating(true)}
                  whileHover={{ y: -4 }}
                  className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[2rem] border-2 border-dashed border-white/20 p-6 text-parchment/70 hover:border-firefly/60 hover:text-parchment"
                >
                  <span className="text-5xl">＋</span>
                  <span className="font-display text-lg">New storyteller</span>
                </motion.button>
              </div>
            </>
          )}
        </section>

        <AnimatePresence>
          {activeProfile && !creating && !editing && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-12 flex flex-col items-center gap-6"
            >
              <ContinueStory key={activeProfile.id} childId={activeProfile.id} />
              <Button variant="magic" size="xl" onClick={startAdventure} className="text-2xl">
                🚀 Start a new adventure, {nameWithHeart(activeProfile)}!
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {editing && !lock.unlocked && (
          <PinPad
            key={lock.pinSet === false ? 'create' : 'unlock'}
            mode={lock.pinSet === false ? 'create' : 'unlock'}
            onUnlocked={() => undefined}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
