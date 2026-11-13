import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import type { DashboardData, Story } from '@/api/types';

/**
 * Both queries need the parent lock open. A 401 means it closed (the client
 * already told the page); retrying would only knock again, so give up at once.
 */
function retryUnlessLocked(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status === 401) return false;
  return failureCount < 2;
}

/** `enabled` is false while the parent lock is closed, so nothing is asked of the server. */
export function useDashboard(childId: string | undefined, enabled = true) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', childId],
    queryFn: () => api.dashboard(childId as string),
    enabled: enabled && Boolean(childId),
    retry: retryUnlessLocked,
  });
}

export function useStoryHistory(childId: string | undefined, enabled = true) {
  return useQuery<Story[]>({
    queryKey: ['history', childId],
    queryFn: () => api.storyHistory(childId as string),
    enabled: enabled && Boolean(childId),
    retry: retryUnlessLocked,
  });
}
