// Typed fetch client + SSE helper matching the StoryWeaver contract.
// Base URL: VITE_API_URL ?? '' (empty -> uses the Vite dev proxy for /api).

import type {
  ChildProfile,
  CreateProfileBody,
  StartStoryBody,
  StartStoryResponse,
  ChoiceBody,
  ChoiceResponse,
  CuriosityAnswerBody,
  CuriosityAnswerResponse,
  EndStoryBody,
  EndStoryResponse,
  Story,
  DashboardData,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<TResponse>(
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<TResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options?.method ?? 'GET',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data: unknown = await res.json();
      if (data && typeof data === 'object' && 'detail' in data) {
        const d = (data as { detail: unknown }).detail;
        if (typeof d === 'string') detail = d;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(detail, res.status);
  }

  // Some endpoints (none in contract) could return empty; guard anyway.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as TResponse;
}

export const api = {
  // Profiles
  listProfiles: () => request<ChildProfile[]>('/api/profiles/'),
  createProfile: (body: CreateProfileBody) =>
    request<ChildProfile>('/api/profiles/', { method: 'POST', body }),

  // Story
  startStory: (body: StartStoryBody) =>
    request<StartStoryResponse>('/api/story/start', { method: 'POST', body }),
  makeChoice: (body: ChoiceBody) =>
    request<ChoiceResponse>('/api/story/choice', { method: 'POST', body }),
  answerCuriosity: (body: CuriosityAnswerBody) =>
    request<CuriosityAnswerResponse>('/api/story/curiosity-answer', {
      method: 'POST',
      body,
    }),
  endStory: (body: EndStoryBody) =>
    request<EndStoryResponse>('/api/story/end', { method: 'POST', body }),
  storyHistory: (childId: string) =>
    request<Story[]>(`/api/story/history/${encodeURIComponent(childId)}`),

  // Dashboard
  dashboard: (childId: string) =>
    request<DashboardData>(`/api/dashboard/${encodeURIComponent(childId)}`),
};

/** Build the SSE URL for a session's chapter stream. */
export function streamUrl(sessionId: string): string {
  return `${BASE_URL}/api/story/stream/${encodeURIComponent(sessionId)}`;
}
