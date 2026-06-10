import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useProfiles, useCreateProfile } from '@/hooks/useProfiles';
import { useStoryStore } from '@/store/storyStore';
import {
  AVATARS,
  avatarById,
  PARENT_PIN_LENGTH,
  DEFAULT_CHILD_NAME,
  isShreyu,
  nameWithHeart,
} from '@/lib/theme';
import type { ChildProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StarField } from '@/components/ui/StarField';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

function AvatarChip({
  emoji,
  from,
  to,
  size = 'md',
}: {
  emoji: string;
  from: string;
  to: string;
  size?: 'md' | 'lg';
}) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-[1.5rem] shadow-[var(--shadow-soft)]',
        size === 'lg' ? 'h-24 w-24 text-5xl' : 'h-16 w-16 text-3xl'
      )}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {emoji}
    </div>
  );
}

function CreateProfileForm({ onCreated }: { onCreated: (p: ChildProfile) => void }) {
  const [name, setName] = useState(DEFAULT_CHILD_NAME);
  const [age, setAge] = useState(7);
  // Unicorn makes a lovely default buddy for Shreyu.
  const [avatarId, setAvatarId] = useState('unicorn');
  const createProfile = useCreateProfile();

  const submit = () => {
    if (!name.trim()) return;
    createProfile.mutate(
      { name: name.trim(), age, avatar_id: avatarId },
      { onSuccess: onCreated }
    );
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <h2 className="font-display text-2xl text-parchment">Create your storyteller</h2>

      <div className="mt-5 flex flex-col gap-5">
        <div>
          <label htmlFor="profile-name" className="mb-2 block text-parchment/80">
            What&apos;s your name?
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Type your name…"
            className="w-full rounded-2xl border border-white/10 bg-night-900/40 px-5 py-4 text-xl text-parchment placeholder:text-parchment/40"
          />
        </div>

        <div>
          <label htmlFor="profile-age" className="mb-2 block text-parchment/80">
            How old are you? <span className="font-display text-firefly">{age}</span>
          </label>
          <input
            id="profile-age"
            type="range"
            min={4}
            max={12}
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
            className="w-full accent-firefly"
          />
        </div>

        <div>
          <p className="mb-3 text-parchment/80">Pick your buddy</p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={avatarId === a.id}
                aria-label={a.label}
                onClick={() => setAvatarId(a.id)}
                className={cn(
                  'rounded-[1.25rem] p-1 transition-transform hover:scale-105',
                  avatarId === a.id && 'ring-4 ring-firefly'
                )}
              >
                <AvatarChip emoji={a.emoji} from={a.from} to={a.to} />
              </button>
            ))}
          </div>
        </div>

        {createProfile.isError && (
          <p className="text-blossom">Something went wrong creating your profile.</p>
        )}

        <Button
          variant="magic"
          size="lg"
          onClick={submit}
          disabled={!name.trim() || createProfile.isPending}
        >
          {createProfile.isPending ? 'Creating…' : 'That’s me! ✨'}
        </Button>
      </div>
    </Card>
  );
}

function PinPad({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const press = (d: string) => {
    if (pin.length >= PARENT_PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PARENT_PIN_LENGTH) {
      // Phase 1: gate is client-side; backend validates real access later.
      setTimeout(onSuccess, 250);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-night-900/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="glass relative w-full max-w-xs rounded-[2rem] p-7 text-center"
      >
        <h3 className="font-display text-xl text-parchment">Grown-ups only 🔒</h3>
        <p className="mt-1 text-sm text-parchment/70">Enter your 4-digit PIN</p>
        <div className="my-5 flex justify-center gap-3">
          {Array.from({ length: PARENT_PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-4 w-4 rounded-full border-2 border-white/30',
                i < pin.length && 'bg-firefly border-firefly'
              )}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              className="rounded-2xl bg-white/5 py-4 font-display text-2xl text-parchment hover:bg-white/10"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="rounded-2xl bg-white/5 py-4 text-xl text-parchment hover:bg-white/10"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={() => press('0')}
            className="rounded-2xl bg-white/5 py-4 font-display text-2xl text-parchment hover:bg-white/10"
          >
            0
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white/5 py-4 text-sm text-parchment/70 hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { data: profiles, isLoading, isError, isSuccess } = useProfiles();
  const activeProfile = useStoryStore((s) => s.activeProfile);
  const setActiveProfile = useStoryStore((s) => s.setActiveProfile);
  const createProfile = useCreateProfile();

  const [creating, setCreating] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const autoCreateTried = useRef(false);

  // Ensure our beloved default child "Shreyu" always exists.
  useEffect(() => {
    if (!isSuccess || autoCreateTried.current) return;
    const list = profiles ?? [];
    const existing = list.find((p) => isShreyu(p.name));
    if (existing) {
      if (!activeProfile) setActiveProfile(existing);
      return;
    }
    autoCreateTried.current = true;
    createProfile.mutate(
      { name: DEFAULT_CHILD_NAME, age: 7, avatar_id: 'unicorn' },
      { onSuccess: (p) => setActiveProfile(p) }
    );
  }, [isSuccess, profiles, activeProfile, setActiveProfile, createProfile]);

  const handlePick = (p: ChildProfile) => {
    setActiveProfile(p);
  };

  const startAdventure = () => {
    if (activeProfile) navigate('/setup');
  };

  return (
    <div className="relative min-h-dvh">
      <StarField />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-3">
          <span className="animate-float-slow text-4xl">📖</span>
          <span className="font-display text-2xl text-parchment text-glow">StoryWeaver</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowPin(true)}>
          👪 Parents
        </Button>
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
            Pick your storyteller, imagine a brave hero, and turn the page on an
            adventure that&apos;s yours alone. ✨
          </p>
        </motion.div>

        <section className="mt-12">
          {isLoading ? (
            <Spinner label="Finding your storytellers…" className="py-16" />
          ) : creating ? (
            <CreateProfileForm
              onCreated={(p) => {
                setActiveProfile(p);
                setCreating(false);
              }}
            />
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
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => handlePick(p)}
                      aria-pressed={selected}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        'flex flex-col items-center gap-3 rounded-[2rem] border p-6 transition-colors',
                        selected
                          ? 'border-firefly bg-firefly/10 shadow-[var(--shadow-glow)]'
                          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                      )}
                    >
                      <AvatarChip emoji={avatar.emoji} from={avatar.from} to={avatar.to} size="lg" />
                      <span className="font-display text-lg text-parchment">
                        {nameWithHeart(p.name)}
                      </span>
                      <span className="text-sm text-parchment/60">Age {p.age}</span>
                    </motion.button>
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
          {activeProfile && !creating && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-12 flex justify-center"
            >
              <Button variant="magic" size="xl" onClick={startAdventure} className="text-2xl">
                🚀 Start a new adventure, {nameWithHeart(activeProfile.name)}!
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showPin && (
          <PinPad
            onSuccess={() => {
              setShowPin(false);
              navigate('/parent');
            }}
            onClose={() => setShowPin(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
