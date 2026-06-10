import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Mood } from '@/api/types';
import type { CompletedChapter } from '@/store/storyStore';
import { MOOD_GRADIENT, absoluteAssetUrl } from '@/lib/theme';
import { ChapterReveal } from './ChapterReveal';

interface StoryBookProps {
  /** Story-level title shown on the cover box. */
  title: string | null;
  /** Finished chapters the child can flip back through. */
  completed: CompletedChapter[];
  /** The chapter currently streaming (null once nothing is live). */
  live: {
    chapterTitle?: string;
    chapterNumber?: number;
    mood: Mood;
    imageUrl?: string;
    sceneDescription?: string;
    sentences: string[];
  } | null;
  streaming: boolean;
  /** Notifies the parent which page index is being viewed (live = last). */
  onViewingChange?: (viewingLatest: boolean) => void;
}

interface PageData {
  chapterNumber?: number;
  chapterTitle: string;
  mood: Mood;
  imageUrl: string;
  sceneDescription: string;
  /** Live pages stream sentence-by-sentence; finished pages render full text. */
  sentences?: string[];
  text?: string;
  isLive: boolean;
}

/** The illustrated left page (or top, on mobile). */
function IllustrationPage({
  imageUrl,
  sceneDescription,
  mood,
}: {
  imageUrl: string;
  sceneDescription: string;
  mood: Mood;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const grad = MOOD_GRADIENT[mood];
  const src = absoluteAssetUrl(imageUrl);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.25rem] shadow-[var(--shadow-soft)] lg:aspect-auto lg:h-full">
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
        aria-hidden={loaded && !failed}
      >
        {(!loaded || failed) && (
          <span className="px-6 text-center font-display text-lg text-white/90 drop-shadow">
            {sceneDescription || 'A new scene unfolds…'}
          </span>
        )}
      </div>
      {src && !failed && (
        <motion.img
          src={src}
          alt={sceneDescription || 'Story scene illustration'}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/** The parchment text page (right page on wide screens). */
function TextPage({ page, streaming }: { page: PageData; streaming: boolean }) {
  return (
    <div className="scrollbar-soft flex h-full flex-col overflow-y-auto">
      <header className="mb-5 border-b border-ink/10 pb-4">
        <div className="flex items-baseline gap-3">
          {typeof page.chapterNumber === 'number' && (
            <span className="font-display text-3xl text-blossom">{page.chapterNumber}</span>
          )}
          <h2 className="font-display text-2xl text-ink sm:text-3xl">
            {page.chapterTitle || 'Once upon a time…'}
          </h2>
        </div>
      </header>

      {page.isLive ? (
        page.sentences && page.sentences.length === 0 && streaming ? (
          <p className="animate-pulse font-display text-2xl text-ink/50">
            The story is being woven…
          </p>
        ) : (
          <>
            <ChapterReveal sentences={page.sentences ?? []} />
            {streaming && (page.sentences?.length ?? 0) > 0 && (
              <span className="ml-1 inline-block h-7 w-[3px] animate-pulse rounded bg-blossom align-middle" />
            )}
          </>
        )
      ) : (
        <p className="font-display text-[1.45rem] leading-relaxed text-ink sm:text-[1.7rem] sm:leading-[1.75]">
          {page.text}
        </p>
      )}
    </div>
  );
}

/**
 * A large, immersive storybook. Renders a two-page spread (illustration +
 * text) on wide screens, collapsing to a single page on mobile. The latest
 * chapter streams in live; finished chapters can be flipped back through.
 */
export function StoryBook({ title, completed, live, streaming, onViewingChange }: StoryBookProps) {
  const reduceMotion = useReducedMotion();

  const pages: PageData[] = useMemo(() => {
    const finished: PageData[] = completed.map((c) => ({
      chapterNumber: c.chapterNumber,
      chapterTitle: c.title,
      mood: c.mood,
      imageUrl: c.imageUrl,
      sceneDescription: c.sceneDescription,
      text: c.text,
      isLive: false,
    }));

    // The live page is shown only if it is not already a completed chapter.
    const liveIsNew =
      live !== null &&
      !completed.some((c) => c.chapterNumber === live.chapterNumber);

    if (liveIsNew && live) {
      finished.push({
        chapterNumber: live.chapterNumber,
        chapterTitle: live.chapterTitle ?? 'Once upon a time…',
        mood: live.mood,
        imageUrl: live.imageUrl ?? '',
        sceneDescription: live.sceneDescription ?? '',
        sentences: live.sentences,
        isLive: true,
      });
    }
    return finished;
  }, [completed, live]);

  const lastIndex = Math.max(0, pages.length - 1);
  const [index, setIndex] = useState(lastIndex);
  const [direction, setDirection] = useState(0);

  // Whenever a new page appears, jump to the latest so the child keeps reading.
  useEffect(() => {
    setIndex(lastIndex);
    setDirection(1);
  }, [lastIndex]);

  const viewingLatest = index >= lastIndex;
  useEffect(() => {
    onViewingChange?.(viewingLatest);
  }, [viewingLatest, onViewingChange]);

  const page = pages[index];

  const go = (delta: number) => {
    setIndex((i) => {
      const next = Math.min(lastIndex, Math.max(0, i + delta));
      setDirection(next > i ? 1 : -1);
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIndex]);

  if (!page) {
    return (
      <div className="grid h-full place-items-center rounded-[2rem] bg-parchment p-10 text-ink shadow-[var(--shadow-soft)]">
        <p className="animate-pulse font-display text-2xl text-ink/50">
          Opening the storybook…
        </p>
      </div>
    );
  }

  const canPrev = index > 0;
  const canNext = index < lastIndex;

  const flipVariants = {
    enter: (dir: number) => ({
      opacity: 0,
      rotateY: reduceMotion ? 0 : dir > 0 ? 35 : -35,
      x: reduceMotion ? 0 : dir > 0 ? 60 : -60,
    }),
    center: { opacity: 1, rotateY: 0, x: 0 },
    exit: (dir: number) => ({
      opacity: 0,
      rotateY: reduceMotion ? 0 : dir > 0 ? -35 : 35,
      x: reduceMotion ? 0 : dir > 0 ? -60 : 60,
    }),
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Big square title "cover" box */}
      <div className="mx-auto w-full max-w-md">
        <div className="relative grid aspect-[5/2] place-items-center overflow-hidden rounded-[1.75rem] border-4 border-firefly/60 bg-gradient-to-br from-night-700 via-night-600 to-night-800 p-5 text-center shadow-[var(--shadow-glow)]">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-firefly/80">
              Storybook
            </p>
            <h1 className="mt-1 font-display text-2xl text-parchment text-glow sm:text-3xl">
              {title || 'An Untitled Adventure'}
            </h1>
          </div>
          <span className="pointer-events-none absolute -right-2 -top-2 text-3xl opacity-70">
            ✨
          </span>
        </div>
      </div>

      {/* The book itself */}
      <div className="relative flex-1" style={{ perspective: 1600 }}>
        {/* spine + page-edge styling */}
        <div className="relative h-full overflow-hidden rounded-[2rem] border border-black/10 bg-parchment-2 shadow-[var(--shadow-soft)]">
          {/* page edges */}
          <div className="pointer-events-none absolute inset-y-3 right-1 w-2 rounded-r-xl bg-gradient-to-l from-black/15 to-transparent" />
          <div className="pointer-events-none absolute inset-y-3 left-1 w-2 rounded-l-xl bg-gradient-to-r from-black/15 to-transparent" />

          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={index}
              custom={direction}
              variants={flipVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduceMotion ? 0.001 : 0.5, ease: [0.2, 0.8, 0.3, 1] }}
              style={{ transformStyle: 'preserve-3d' }}
              className="grid h-full grid-cols-1 gap-0 lg:grid-cols-2"
            >
              {/* Left page — illustration */}
              <div className="relative bg-parchment p-5 sm:p-6 lg:p-7">
                <IllustrationPage
                  imageUrl={page.imageUrl}
                  sceneDescription={page.sceneDescription}
                  mood={page.mood}
                />
              </div>
              {/* center spine on wide screens */}
              <div className="pointer-events-none absolute inset-y-6 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-black/20 to-transparent lg:block" />
              {/* Right page — text */}
              <div className="relative bg-parchment p-6 text-ink sm:p-8 lg:p-9">
                <TextPage page={page} streaming={streaming && page.isLive} />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Page-turn arrows */}
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!canPrev}
          aria-label="Previous page"
          className="absolute left-1 top-1/2 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full glass text-2xl text-parchment shadow-[var(--shadow-soft)] transition hover:bg-white/15 disabled:opacity-30 sm:-left-5"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!canNext}
          aria-label="Next page"
          className="absolute right-1 top-1/2 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full glass text-2xl text-parchment shadow-[var(--shadow-soft)] transition hover:bg-white/15 disabled:opacity-30 sm:-right-5"
        >
          ›
        </button>
      </div>

      {/* Page dots */}
      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          {pages.map((p, i) => (
            <button
              key={p.chapterNumber ?? i}
              type="button"
              onClick={() => {
                setDirection(i > index ? 1 : -1);
                setIndex(i);
              }}
              aria-label={`Go to page ${i + 1}`}
              aria-current={i === index}
              className={
                i === index
                  ? 'h-2.5 w-6 rounded-full bg-firefly transition-all'
                  : 'h-2.5 w-2.5 rounded-full bg-white/25 transition-all hover:bg-white/40'
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
