import { useCallback, useEffect, useRef, useState } from 'react';
import { streamUrl } from '@/api/client';
import type { ChapterMeta, SentenceEventData } from '@/api/types';

export interface UseStoryStream {
  sentences: string[];
  meta: ChapterMeta | null;
  done: boolean;
  error: string | null;
  /** Open (or re-open) the stream for a session. Resets prior stream state. */
  open: (sessionId: string) => void;
  close: () => void;
}

function parseMeta(raw: string): ChapterMeta | null {
  try {
    return JSON.parse(raw) as ChapterMeta;
  } catch {
    return null;
  }
}

function parseSentence(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as SentenceEventData;
    return typeof data.text === 'string' ? data.text : null;
  } catch {
    return null;
  }
}

/**
 * Consumes the SSE chapter stream via EventSource.
 * Handles `sentence`, `meta`, and `done` events per the contract.
 */
export function useStoryStream(): UseStoryStream {
  const sourceRef = useRef<EventSource | null>(null);
  const [sentences, setSentences] = useState<string[]>([]);
  const [meta, setMeta] = useState<ChapterMeta | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const open = useCallback(
    (sessionId: string) => {
      close();
      setSentences([]);
      setMeta(null);
      setDone(false);
      setError(null);

      const es = new EventSource(streamUrl(sessionId));
      sourceRef.current = es;

      es.addEventListener('sentence', (event: MessageEvent<string>) => {
        const text = parseSentence(event.data);
        if (text !== null) setSentences((prev) => [...prev, text]);
      });

      es.addEventListener('meta', (event: MessageEvent<string>) => {
        const parsed = parseMeta(event.data);
        if (parsed) setMeta(parsed);
      });

      es.addEventListener('done', () => {
        setDone(true);
        close();
      });

      es.onerror = () => {
        // EventSource auto-retries; if it's closed treat as a surfaced error.
        if (es.readyState === EventSource.CLOSED) {
          setError('The story stream was interrupted.');
          close();
        }
      };
    },
    [close]
  );

  useEffect(() => () => close(), [close]);

  return { sentences, meta, done, error, open, close };
}
