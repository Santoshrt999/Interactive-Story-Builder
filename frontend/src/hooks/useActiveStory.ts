import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { ActiveStory } from '@/api/types';

/** Prefix of every child's active-story query: invalidate this to refresh them all. */
export const ACTIVE_STORY_KEY = ['active-story'] as const;

/**
 * The child's unfinished story ("Continue"), or null when there is none.
 * Doesn't run without a child; callers treat loading and error as "no story".
 */
export function useActiveStory(childId: string | undefined) {
  return useQuery<ActiveStory | null>({
    queryKey: [...ACTIVE_STORY_KEY, childId],
    queryFn: () => api.activeStory(childId as string),
    enabled: Boolean(childId),
  });
}
