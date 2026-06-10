import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { ChildProfile, CreateProfileBody } from '@/api/types';

export function useProfiles() {
  return useQuery<ChildProfile[]>({
    queryKey: ['profiles'],
    queryFn: api.listProfiles,
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProfileBody) => api.createProfile(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
