// Typed fetch client + SSE helper matching the StoryWeaver contract.
// Base URL: VITE_API_URL ?? '' (empty -> uses the Vite dev proxy for /api).

import { clearParentToken, getParentToken } from '@/lib/parentSession';
import type {
  ChildProfile,
  CreateProfileBody,
  UpdateProfileBody,
  StartStoryBody,
  StartStoryResponse,
  ActiveStory,
  ResumeResponse,
  ParentStatus,
  UnlockResponse,
  ResetChallenge,
  ResetPinBody,
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

/** The `detail` the backend sends when a guarded route needs the parent lock open. */
const PARENT_LOCK_DETAIL = 'parent lock';

export class ApiError extends Error {
  status: number;
  /** Parsed JSON error body, if any (e.g. `{ detail, retry_after }` on a 429). */
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<TResponse>(
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<TResponse> {
  const headers: Record<string, string> = {};
  if (options?.body) headers['Content-Type'] = 'application/json';
  const parentToken = getParentToken();
  if (parentToken) headers['X-Parent-Token'] = parentToken;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    let body: unknown;
    try {
      body = await res.json();
      if (body && typeof body === 'object' && 'detail' in body) {
        const d = (body as { detail: unknown }).detail;
        if (typeof d === 'string') detail = d;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    // Only the guarded-route 401 means "the parent lock closed"; a 401 from
    // /parent/unlock (wrong PIN) must not clear the token or fire the event.
    // A late 401 for a request sent with an old token must not lock out a lock the
    // parent has since reopened with a fresh one: only act if the token is unchanged.
    if (res.status === 401 && detail === PARENT_LOCK_DETAIL && getParentToken() === parentToken) {
      clearParentToken();
      window.dispatchEvent(new Event('parent-locked'));
    }
    throw new ApiError(detail, res.status, body);
  }

  // 204 and other empty bodies resolve to undefined.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as TResponse;
}

export const api = {
  // Profiles
  listProfiles: () => request<ChildProfile[]>('/api/profiles/'),
  createProfile: (body: CreateProfileBody) =>
    request<ChildProfile>('/api/profiles/', { method: 'POST', body }),
  /** Parent token required. */
  updateProfile: (id: string, body: UpdateProfileBody) =>
    request<ChildProfile>(`/api/profiles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
    }),
  /** Parent token required; 409 for the default profile. */
  deleteProfile: (id: string) =>
    request<void>(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Story
  startStory: (body: StartStoryBody) =>
    request<StartStoryResponse>('/api/story/start', { method: 'POST', body }),
  /** The child's unfinished story to continue, or null when there is none (404). */
  activeStory: async (childId: string): Promise<ActiveStory | null> => {
    try {
      return await request<ActiveStory>(
        `/api/story/active/${encodeURIComponent(childId)}`
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  resumeStory: (storyId: string) =>
    request<ResumeResponse>('/api/story/resume', {
      method: 'POST',
      body: { story_id: storyId },
    }),
  makeChoice: (body: ChoiceBody) =>
    request<ChoiceResponse>('/api/story/choice', { method: 'POST', body }),
  answerCuriosity: (body: CuriosityAnswerBody) =>
    request<CuriosityAnswerResponse>('/api/story/curiosity-answer', {
      method: 'POST',
      body,
    }),
  endStory: (body: EndStoryBody) =>
    request<EndStoryResponse>('/api/story/end', { method: 'POST', body }),
  /** Parent token required. */
  storyHistory: (childId: string) =>
    request<Story[]>(`/api/story/history/${encodeURIComponent(childId)}`),

  // Dashboard (parent token required)
  dashboard: (childId: string) =>
    request<DashboardData>(`/api/dashboard/${encodeURIComponent(childId)}`),

  // Parent lock
  parentStatus: () => request<ParentStatus>('/api/parent/status'),
  setParentPin: (pin: string) =>
    request<void>('/api/parent/pin', { method: 'POST', body: { pin } }),
  /** 401 wrong PIN; 429 with `body.retry_after` (seconds) during the cool-down. */
  unlockParent: (pin: string) =>
    request<UnlockResponse>('/api/parent/unlock', { method: 'POST', body: { pin } }),
  lockParent: () => request<void>('/api/parent/lock', { method: 'POST' }),
  /** Challenges are single-use: refetch after a 403 from resetParentPin. */
  resetChallenge: () => request<ResetChallenge>('/api/parent/reset-challenge'),
  resetParentPin: (body: ResetPinBody) =>
    request<void>('/api/parent/reset', { method: 'POST', body }),
  /** Parent token required. */
  changeParentPin: (newPin: string) =>
    request<void>('/api/parent/change-pin', {
      method: 'POST',
      body: { new_pin: newPin },
    }),
};

/** Build the SSE URL for a session's chapter stream. */
export function streamUrl(sessionId: string): string {
  return `${BASE_URL}/api/story/stream/${encodeURIComponent(sessionId)}`;
}
