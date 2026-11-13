import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { ACTIVE_STORY_KEY } from '@/hooks/useActiveStory';
import { activeAfterDelete, activeAfterUpdate } from '@/lib/profiles';
import { useStoryStore } from '@/store/storyStore';
import type { ChildProfile, CreateProfileBody, UpdateProfileBody } from '@/api/types';

const PROFILES_KEY = ['profiles'] as const;

export function useProfiles() {
  return useQuery<ChildProfile[]>({
    queryKey: PROFILES_KEY,
    queryFn: api.listProfiles,
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProfileBody) => api.createProfile(body),
    onSuccess: (created) => {
      // Put the new profile in the list right away: whoever makes it active next
      // must find it there (Home reconciles the active profile against this list).
      qc.setQueryData<ChildProfile[]>(PROFILES_KEY, (list) => [...(list ?? []), created]);
      void qc.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

/** Edit a profile (parent lock must be open). A rename shows up on Home at once, active profile included. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProfileBody }) =>
      api.updateProfile(id, body),
    onSuccess: (updated) => {
      qc.setQueryData<ChildProfile[]>(PROFILES_KEY, (list) =>
        list?.map((p) => (p.id === updated.id ? updated : p))
      );
      const { activeProfile, setActiveProfile } = useStoryStore.getState();
      const next = activeAfterUpdate(activeProfile, updated);
      if (next !== activeProfile) setActiveProfile(next);
      void qc.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

/**
 * Delete a profile and its stories (parent lock must be open; the default
 * profile can't be deleted: 409). A profile that is already gone counts as
 * deleted. If it was the active one, the default profile takes over.
 */
export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await api.deleteProfile(id);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
    },
    onSuccess: (_void, id) => {
      const remaining = (qc.getQueryData<ChildProfile[]>(PROFILES_KEY) ?? []).filter(
        (p) => p.id !== id
      );
      qc.setQueryData<ChildProfile[]>(PROFILES_KEY, remaining);
      const { activeProfile, setActiveProfile } = useStoryStore.getState();
      const next = activeAfterDelete(activeProfile, id, remaining);
      if (next !== activeProfile) setActiveProfile(next);
      qc.removeQueries({ queryKey: ['dashboard', id] });
      qc.removeQueries({ queryKey: ['history', id] });
      qc.removeQueries({ queryKey: [...ACTIVE_STORY_KEY, id] });
      void qc.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}
