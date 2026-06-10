import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useStoryStore } from '@/store/storyStore';
import { useStoryStream } from '@/hooks/useStoryStream';
import { useAudio } from '@/hooks/useAudio';
import { avatarById } from '@/lib/theme';
import type { EndStoryResponse } from '@/api/types';
import { StoryBook } from '@/components/story/StoryBook';
import { StoryChoiceCards } from '@/components/story/StoryChoiceCards';
import { CharacterPanel } from '@/components/story/CharacterPanel';
import { CuriosityPrompt } from '@/components/story/CuriosityPrompt';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StarField } from '@/components/ui/StarField';
import { FinishedStorybook } from '@/components/story/FinishedStorybook';

export function Story() {
  const navigate = useNavigate();

  const sessionId = useStoryStore((s) => s.sessionId);
  const storyTitle = useStoryStore((s) => s.storyTitle);
  const setup = useStoryStore((s) => s.setup);
  const activeProfile = useStoryStore((s) => s.activeProfile);
  const curiosityOpen = useStoryStore((s) => s.curiosityOpen);
  const pendingCuriosity = useStoryStore((s) => s.pendingCuriosity);
  const openCuriosity = useStoryStore((s) => s.openCuriosity);
  const closeCuriosity = useStoryStore((s) => s.closeCuriosity);
  const recordChoice = useStoryStore((s) => s.recordChoice);
  const completedChapters = useStoryStore((s) => s.completedChapters);
  const addCompletedChapter = useStoryStore((s) => s.addCompletedChapter);

  const stream = useStoryStream();
  const audio = useAudio();

  const [chapterCount, setChapterCount] = useState(0);
  const [certificate, setCertificate] = useState<EndStoryResponse | null>(null);
  const [viewingLatest, setViewingLatest] = useState(true);
  const narratedCount = useRef(0);

  const childName = activeProfile?.name ?? '';

  // Kick off the first stream when we land with a session.
  useEffect(() => {
    if (!sessionId) {
      navigate('/setup');
      return;
    }
    stream.open(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Approx-synced narration: speak each newly-arrived sentence.
  useEffect(() => {
    if (stream.sentences.length > narratedCount.current) {
      const fresh = stream.sentences.slice(narratedCount.current);
      narratedCount.current = stream.sentences.length;
      audio.speak(fresh.join(' '));
    }
  }, [stream.sentences, audio]);

  // When a chapter finishes streaming, count it and store it for the book.
  useEffect(() => {
    if (stream.done && stream.meta) {
      setChapterCount((c) => c + 1);
      const m = stream.meta;
      addCompletedChapter({
        chapterNumber: m.chapter_number,
        title: m.chapter_title,
        text: stream.sentences.join(' ').trim(),
        imageUrl: m.image_url,
        mood: m.mood,
        sceneDescription: m.scene_description,
        vocabulary: m.new_vocabulary,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.done]);

  const choiceMutation = useMutation({
    mutationFn: api.makeChoice,
    onSuccess: () => {
      if (sessionId) {
        narratedCount.current = 0;
        stream.open(sessionId);
      }
    },
  });

  const curiosityMutation = useMutation({
    mutationFn: api.answerCuriosity,
    onSettled: () => closeCuriosity(),
  });

  const endMutation = useMutation({
    mutationFn: api.endStory,
    onSuccess: (res) => {
      audio.stop();
      setCertificate(res);
    },
  });

  const handleChoice = useCallback(
    (choice: string) => {
      if (!sessionId) return;
      recordChoice(choice);
      audio.stop();
      const question = stream.meta?.curiosity_question;
      // Show the curiosity question first (after a choice), then advance.
      if (question) {
        openCuriosity(question);
      }
      choiceMutation.mutate({ session_id: sessionId, choice });
    },
    [sessionId, stream.meta, recordChoice, openCuriosity, choiceMutation, audio]
  );

  const handleCuriosityAnswer = (answer: string) => {
    if (!sessionId) return;
    curiosityMutation.mutate({ session_id: sessionId, answer });
  };

  const handleEnd = () => {
    if (sessionId) endMutation.mutate({ session_id: sessionId });
  };

  if (certificate) {
    return (
      <FinishedStorybook
        data={certificate}
        storyTitle={storyTitle}
        chapters={completedChapters}
        avatarEmoji={avatarById(activeProfile?.avatar_id ?? '').emoji}
        childName={childName}
        characterName={setup?.character_name ?? certificate.certificate.character_name}
        onDone={() => navigate('/')}
      />
    );
  }

  const meta = stream.meta;
  const streaming = !stream.done || choiceMutation.isPending;
  const choicesReady =
    stream.done && meta !== null && !choiceMutation.isPending && viewingLatest;

  const liveChapter = meta
    ? {
        chapterTitle: meta.chapter_title,
        chapterNumber: meta.chapter_number,
        mood: meta.mood,
        imageUrl: meta.image_url,
        sceneDescription: meta.scene_description,
        sentences: stream.sentences,
      }
    : {
        mood: 'wonder' as const,
        sentences: stream.sentences,
      };

  return (
    <div className="relative min-h-dvh">
      <StarField count={16} />

      <header className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          ← Leave story
        </Button>
        <span className="font-display text-lg text-parchment/80">
          Chapter {Math.max(1, chapterCount + (stream.done ? 0 : 1))}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleEnd}
          disabled={endMutation.isPending || chapterCount === 0}
        >
          {endMutation.isPending ? 'Wrapping up…' : 'End story 🏆'}
        </Button>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-6 px-4 pb-8 lg:grid-cols-12">
        {/* Left — the big storybook */}
        <section className="lg:col-span-8 xl:col-span-9">
          <div className="h-[82dvh]">
            <StoryBook
              title={storyTitle}
              completed={completedChapters}
              live={liveChapter}
              streaming={streaming}
              onViewingChange={setViewingLatest}
            />
          </div>
        </section>

        {/* Right — character + choices */}
        <aside className="flex flex-col gap-5 lg:col-span-4 xl:col-span-3">
          <CharacterPanel
            setup={setup}
            avatarEmoji={avatarById(activeProfile?.avatar_id ?? '').emoji}
            mood={meta?.mood ?? 'wonder'}
            vocabulary={meta?.new_vocabulary ?? []}
            isNarrating={audio.isPlaying}
            muted={audio.muted}
            onToggleMute={audio.toggleMuted}
          />

          {stream.error && (
            <Card>
              <p className="text-blossom">{stream.error}</p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => sessionId && stream.open(sessionId)}
              >
                Try again
              </Button>
            </Card>
          )}

          <AnimatePresence mode="wait">
            {!viewingLatest ? (
              <motion.div
                key="rereading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass flex items-center gap-3 rounded-[1.5rem] p-5"
              >
                <span className="animate-float-slow text-2xl">📖</span>
                <p className="text-parchment/80">
                  You&apos;re re-reading an earlier page — flip to the latest page to keep the
                  story going.
                </p>
              </motion.div>
            ) : choicesReady && meta ? (
              <motion.div
                key={`choices-${meta.chapter_number}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <StoryChoiceCards
                  choices={meta.choices}
                  onChoose={handleChoice}
                  disabled={choiceMutation.isPending}
                />
              </motion.div>
            ) : (
              <motion.div
                key="weaving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass flex items-center gap-3 rounded-[1.5rem] p-5"
              >
                <span className="animate-float-slow text-2xl">🪄</span>
                <p className="text-parchment/80">
                  {choiceMutation.isPending
                    ? 'Following your choice…'
                    : 'The next part is being woven…'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </main>

      <CuriosityPrompt
        open={curiosityOpen}
        question={pendingCuriosity}
        onAnswer={handleCuriosityAnswer}
        onSkip={closeCuriosity}
        submitting={curiosityMutation.isPending}
      />
    </div>
  );
}
