// Small decisions the story page makes at the end of each chapter.

/**
 * What the child sees once a chapter has finished streaming: three choices, or
 * (on the last chapter, the goodnight ending in bedtime mode) a way to close
 * the book. The last chapter has no choices to make.
 */
export function chapterEnding(meta: { is_final: boolean }): 'choices' | 'goodnight' {
  return meta.is_final ? 'goodnight' : 'choices';
}

/** "Chapter 2 of 3", kept inside 1..max so a late or early event never shows nonsense. */
export function chapterLabel(current: number, max: number): string {
  const total = Math.max(1, max);
  const shown = Math.min(Math.max(1, current), total);
  return `Chapter ${shown} of ${total}`;
}

/**
 * The curiosity question is asked right after a choice, while the next chapter
 * streams. Nothing follows the final chapter, so no question opens for it.
 */
export function shouldAskCuriosity(question: string | null | undefined, isFinal: boolean): boolean {
  return Boolean(question) && !isFinal;
}
