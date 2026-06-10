import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useStoryStore } from '@/store/storyStore';
import type { World, Theme, CharacterArchetype } from '@/api/types';
import { WORLDS, STORY_THEMES, worldPlaceholder } from '@/lib/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StarField } from '@/components/ui/StarField';
import { CharacterPicker } from '@/components/story/CharacterPicker';
import { cn } from '@/lib/cn';

type Step = 0 | 1 | 2;

const STEP_TITLES = ['Meet your hero', 'Choose a world', 'Pick a theme'];
const STEP_SUBTITLES = [
  'Let’s dream up a hero who’s brave, kind, and a little bit magic.',
  'Where shall this adventure unfold? Pick a world to explore.',
  'What kind of tale will it be? Choose the heart of the story.',
];

export function Setup() {
  const navigate = useNavigate();
  const activeProfile = useStoryStore((s) => s.activeProfile);
  const startSession = useStoryStore((s) => s.startSession);

  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState<CharacterArchetype | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);

  const startMutation = useMutation({
    mutationFn: api.startStory,
  });

  if (!activeProfile) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Card className="max-w-md text-center">
          <p className="text-parchment">Pick a storyteller first!</p>
          <Button variant="magic" className="mt-4" onClick={() => navigate('/')}>
            Back home
          </Button>
        </Card>
      </div>
    );
  }

  const canAdvance =
    (step === 0 && name.trim() && archetype) ||
    (step === 1 && world) ||
    (step === 2 && theme);

  const submit = () => {
    if (!name.trim() || !archetype || !world || !theme) return;
    const setup = {
      character_name: name.trim(),
      character_archetype: archetype,
      world,
      theme,
    };
    startMutation.mutate(
      { child_id: activeProfile.id, ...setup },
      {
        onSuccess: (res) => {
          startSession({
            sessionId: res.session_id,
            storyId: res.story_id,
            title: res.title,
            setup,
          });
          navigate('/story');
        },
      }
    );
  };

  const next = () => {
    if (step < 2) setStep((s) => (s + 1) as Step);
    else submit();
  };

  return (
    <div className="relative min-h-dvh">
      <StarField count={20} />
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 pt-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          ← Home
        </Button>
        <div className="flex gap-2">
          {STEP_TITLES.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-2 w-10 rounded-full transition-colors',
                i <= step ? 'bg-firefly' : 'bg-white/15'
              )}
            />
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-8">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="font-display text-4xl text-parchment text-glow sm:text-5xl">
            {STEP_TITLES[step]}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-parchment/70">{STEP_SUBTITLES[step]}</p>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.35 }}
          >
            {step === 0 && (
              <Card>
                <CharacterPicker
                  name={name}
                  archetype={archetype}
                  onNameChange={setName}
                  onArchetypeChange={setArchetype}
                />
              </Card>
            )}

            {step === 1 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {WORLDS.map((w, i) => (
                  <motion.button
                    key={w.id}
                    type="button"
                    onClick={() => setWorld(w.id)}
                    aria-pressed={world === w.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ y: -4 }}
                    className={cn(
                      'group relative overflow-hidden rounded-[2rem] border text-left transition-shadow',
                      world === w.id
                        ? 'border-firefly shadow-[var(--shadow-glow)]'
                        : 'border-white/10'
                    )}
                  >
                    {/* Illustration preview (placeholder SVG over a mood gradient) */}
                    <div
                      className="relative h-40 w-full overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${w.from}, ${w.to})` }}
                    >
                      <img
                        src={worldPlaceholder(w.id)}
                        alt=""
                        aria-hidden
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <span className="absolute right-3 top-3 text-2xl tracking-widest drop-shadow">
                        {w.scenery}
                      </span>
                      <span className="absolute bottom-3 left-4 text-5xl drop-shadow">
                        {w.emoji}
                      </span>
                    </div>
                    <div className="bg-white/[0.05] p-5">
                      <p className="font-display text-2xl text-parchment">{w.label}</p>
                      <p className="mt-1 text-sm text-parchment/70">{w.blurb}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {STORY_THEMES.map((t, i) => (
                  <motion.button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    aria-pressed={theme === t.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ y: -4 }}
                    className={cn(
                      'flex items-center gap-4 rounded-[2rem] border p-5 text-left transition-colors',
                      theme === t.id
                        ? 'border-firefly bg-firefly/15 shadow-[var(--shadow-glow)]'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                    )}
                  >
                    <span className="text-5xl">{t.emoji}</span>
                    <span>
                      <span className="block font-display text-xl text-parchment">{t.label}</span>
                      <span className="block text-sm text-parchment/70">{t.blurb}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {startMutation.isError && (
          <p className="mt-6 text-center text-blossom">
            We couldn&apos;t start the story. Please try again.
          </p>
        )}

        <div className="mt-10 flex items-center justify-between">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => (step > 0 ? setStep((s) => (s - 1) as Step) : navigate('/'))}
          >
            ← Back
          </Button>
          <Button
            variant="magic"
            size="lg"
            onClick={next}
            disabled={!canAdvance || startMutation.isPending}
          >
            {startMutation.isPending
              ? 'Weaving the magic…'
              : step === 2
                ? '✨ Begin the story'
                : 'Next →'}
          </Button>
        </div>
      </main>
    </div>
  );
}
