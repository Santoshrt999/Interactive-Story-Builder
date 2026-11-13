import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useStoryStore } from '@/store/storyStore';
import { useStoryStream } from '@/hooks/useStoryStream';
import { ACTIVE_STORY_KEY } from '@/hooks/useActiveStory';
import { useAudio } from '@/hooks/useAudio';
import { useMusic } from '@/hooks/useMusic';
import { avatarById } from '@/lib/theme';
import { chapterEnding, chapterLabel, shouldAskCuriosity } from '@/lib/chapterFlow';
import type { ChapterMeta, EndStoryResponse } from '@/api/types';
import { StoryBook } from '@/components/story/StoryBook';
import { StoryChoiceCards } from '@/components/story/StoryChoiceCards';
import { CharacterPanel } from '@/components/story/CharacterPanel';
import { CuriosityPrompt } from '@/components/story/CuriosityPrompt';
import { Button } from '@/components/ui/Button';
import { MusicToggle } from '@/components/ui/MusicToggle';
import { Card } from '@/components/ui/Card';
import { StarField } from '@/components/ui/StarField';
import { FinishedStorybook } from '@/components/story/FinishedStorybook';

export function Story() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const sessionId = useStoryStore((s) => s.sessionId);
  const storyTitle = useStoryStore((s) => s.storyTitle);
  const setup = useStoryStore((s) => s.setup);
  const bedtime = useStoryStore((s) => s.bedtime);
  const maxChapters = useStoryStore((s) => s.maxChapters);
  const activeProfile = useStoryStore((s) => s.activeProfile);
  const curiosityOpen = useStoryStore((s) => s.curiosityOpen);
  const pendingCuriosity = useStoryStore((s) => s.pendingCuriosity);
  const openCuriosity = useStoryStore((s) => s.openCuriosity);
  const closeCuriosity = useStoryStore((s) => s.closeCuriosity);
  const recordChoice = useStoryStore((s) => s.recordChoice);
  const completedChapters = useStoryStore((s) => s.completedChapters);
  const addCompletedChapter = useStoryStore((s) => s.addCompletedChapter);
  const resumed = useStoryStore((s) => s.resumed);
  const resumedLastChapter = useStoryStore((s) => s.resumedLastChapter);
  const clearResumed = useStoryStore((s) => s.clearResumed);

  const stream = useStoryStream();
  const audio = useAudio();
  const { duck } = useMusic();

  const [certificate, setCertificate] = useState<EndStoryResponse | null>(null);
  const [viewingLatest, setViewingLatest] = useState(true);
  const narratedCount = useRef(0);

  const childName = activeProfile?.name ?? '';

  // Kick off the first stream when we land with a new session. A resumed story
  // has nothing pending: the book opens on its last page and streaming starts
  // with the first choice.
  useEffect(() => {
    if (!sessionId) {
      navigate('/setup');
      return;
    }
    if (resumed) return;
    stream.open(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Narration: queue each newly-arrived sentence. The narrator reads them in
  // order, however fast they stream in, so nothing is skipped.
  const { enqueue, speakNow, pause, resume, stop } = audio;
  useEffect(() => {
    if (stream.sentences.length < narratedCount.current) {
      // The stream was re-opened and started over; forget the old run.
      narratedCount.current = 0;
      stop();
    }
    const fresh = stream.sentences.slice(narratedCount.current);
    narratedCount.current = stream.sentences.length;
    for (const sentence of fresh) enqueue(sentence);
  }, [stream.sentences, enqueue, stop]);

  // Flipping back to an earlier page reads that page. Returning to the latest
  // page does not start reading on its own.
  const handlePageChange = useCallback(
    (p: { isLatest: boolean; text: string }) => {
      if (!p.isLatest && p.text) speakNow(p.text);
    },
    [speakNow]
  );

  // Music dips about 12 dB while the narrator speaks, and recovers after (also on leaving).
  useEffect(() => {
    duck(audio.isPlaying);
  }, [duck, audio.isPlaying]);
  useEffect(() => () => duck(false), [duck]);

  const narrationState = audio.isPaused ? 'paused' : audio.isPlaying ? 'playing' : 'idle';
  const handleNarrationToggle = useCallback(
    (pageText: string) => {
      if (narrationState === 'paused') resume();
      else if (narrationState === 'playing') pause();
      else speakNow(pageText);
    },
    [narrationState, pause, resume, speakNow]
  );

  // When a chapter finishes streaming, store it for the book.
  useEffect(() => {
    if (stream.done && stream.meta) {
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

  // The chapter whose choices (or goodnight) are on offer: the streamed one, or on a
  // resumed story the saved last chapter, until the first choice starts a stream.
  const meta: ChapterMeta | null = resumed ? resumedLastChapter : stream.meta;
  const streamDone = resumed || stream.done;

  const choiceMutation = useMutation({
    mutationFn: api.makeChoice,
    onSuccess: () => {
      if (sessionId) {
        narratedCount.current = 0;
        clearResumed();
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
      // A finished story is no longer one to "Continue".
      void queryClient.invalidateQueries({ queryKey: ACTIVE_STORY_KEY });
      setCertificate(res);
    },
  });

  const handleChoice = useCallback(
    (choice: string) => {
      if (!sessionId) return;
      recordChoice(choice);
      audio.stop();
      const question = meta?.curiosity_question;
      // Show the curiosity question first (after a choice), then advance.
      // (The final chapter has no choices, so this never opens a question after it.)
      if (question && shouldAskCuriosity(question, meta?.is_final ?? false)) {
        openCuriosity(question);
      }
      choiceMutation.mutate({ session_id: sessionId, choice });
    },
    [sessionId, meta, recordChoice, openCuriosity, choiceMutation, audio]
  );

  const handleCuriosityAnswer = (answer: string) => {
    if (!sessionId) return;
    curiosityMutation.mutate({ session_id: sessionId, answer });
  };

  const handleEnd = () => {
    if (sessionId) endMutation.mutate({ session_id: sessionId });
  };

  // Every chapter is saved on the server as it finishes, so leaving loses nothing:
  // go home and refresh the "Continue" card there.
  const handleLeave = () => {
    void queryClient.invalidateQueries({ queryKey: ACTIVE_STORY_KEY });
    navigate('/');
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
        bedtime={bedtime}
        onDone={() => navigate('/')}
      />
    );
  }

  const chapterCount = completedChapters.length;
  const streaming = !streamDone || choiceMutation.isPending;
  const choicesReady = streamDone && meta !== null && !choiceMutation.isPending && viewingLatest;

  // A resumed story's last chapter is already in the book; no page is live until the next stream.
  const liveChapter = resumed
    ? null
    : meta
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
        <Button variant="ghost" size="sm" onClick={handleLeave}>
          ← Save &amp; leave
        </Button>
        <span className="font-display text-lg text-parchment/80">
          {chapterLabel(chapterCount + (streamDone ? 0 : 1), maxChapters)}
        </span>
        <div className="flex items-center gap-1">
          <MusicToggle />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEnd}
            disabled={endMutation.isPending || chapterCount === 0}
          >
            {endMutation.isPending ? 'Wrapping up…' : 'End story 🏆'}
          </Button>
        </div>
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
              onPageChange={handlePageChange}
              narration={
                audio.muted
                  ? undefined
                  : { state: narrationState, onToggle: handleNarrationToggle }
              }
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
            ) : choicesReady && meta && chapterEnding(meta) === 'goodnight' ? (
              <motion.div
                key="goodnight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-3"
              >
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full text-center leading-snug"
                  onClick={handleEnd}
                  disabled={endMutation.isPending}
                >
                  {endMutation.isPending ? 'Wrapping up…' : 'Goodnight 🌙 — see your storybook'}
                </Button>
                {endMutation.isError && (
                  <p role="alert" className="px-1 text-blossom">
                    Something went wrong closing the book. Please try again.
                  </p>
                )}
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
