import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { DashboardData, Story } from '@/api/types';

export function useDashboard(childId: string | undefined) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', childId],
    queryFn: () => api.dashboard(childId as string),
    enabled: Boolean(childId),
  });
}

export function useStoryHistory(childId: string | undefined) {
  return useQuery<Story[]>({
    queryKey: ['history', childId],
    queryFn: () => api.storyHistory(childId as string),
    enabled: Boolean(childId),
  });
}
