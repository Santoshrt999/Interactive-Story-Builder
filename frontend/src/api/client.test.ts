import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';
import { getParentToken, setParentToken } from '@/lib/parentSession';

// Node environment: provide just enough of `window` (sessionStorage + events).
function stubWindow() {
  const store = new Map<string, string>();
  const win = Object.assign(new EventTarget(), {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  vi.stubGlobal('window', win);
  return win;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let win: ReturnType<typeof stubWindow>;
  let locked: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    win = stubWindow();
    locked = vi.fn();
    win.addEventListener('parent-locked', locked);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends X-Parent-Token only when a token is set', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { pin_set: true }));

    await api.parentStatus();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('X-Parent-Token')).toBe(false);

    setParentToken('tok-1');
    await api.parentStatus();
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-Parent-Token')).toBe('tok-1');
  });

  it('resolves 204 responses to undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.lockParent()).resolves.toBeUndefined();
    await expect(api.deleteProfile('p1')).resolves.toBeUndefined();
  });

  it('clears the token and dispatches parent-locked on 401 "parent lock"', async () => {
    setParentToken('tok-1');
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'parent lock' }));

    await expect(api.dashboard('c1')).rejects.toMatchObject({ status: 401 });
    expect(getParentToken()).toBeNull();
    expect(locked).toHaveBeenCalledTimes(1);
  });

  it('keeps the token on other 401s (wrong PIN on /unlock)', async () => {
    setParentToken('tok-1');
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'wrong pin' }));

    await expect(api.unlockParent('0000')).rejects.toMatchObject({
      status: 401,
      message: 'wrong pin',
    });
    expect(getParentToken()).toBe('tok-1');
    expect(locked).not.toHaveBeenCalled();
  });

  it('exposes the parsed error body (retry_after on 429)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { detail: 'too many attempts', retry_after: 42 })
    );

    const err = await api.unlockParent('0000').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).body).toEqual({ detail: 'too many attempts', retry_after: 42 });
  });

  it('activeStory returns null on 404 and rethrows other errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { detail: 'no unfinished story' }));
    await expect(api.activeStory('c1')).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: 'boom' }));
    await expect(api.activeStory('c1')).rejects.toMatchObject({ status: 500 });
  });

  it('sends the expected method, path and body for profile + parent calls', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));

    await api.updateProfile('p 1', { name: 'Mia' });
    await api.resumeStory('s1');
    await api.resetParentPin({ challenge_id: 'ch', answer: 7, new_pin: '1234' });
    await api.changeParentPin('4321');

    const calls = fetchMock.mock.calls.map(([url, init]) => [
      url,
      init?.method,
      init?.body,
    ]);
    expect(calls).toEqual([
      ['/api/profiles/p%201', 'PATCH', JSON.stringify({ name: 'Mia' })],
      ['/api/story/resume', 'POST', JSON.stringify({ story_id: 's1' })],
      [
        '/api/parent/reset',
        'POST',
        JSON.stringify({ challenge_id: 'ch', answer: 7, new_pin: '1234' }),
      ],
      ['/api/parent/change-pin', 'POST', JSON.stringify({ new_pin: '4321' })],
    ]);
  });
});

describe('parentSession without storage', () => {
  it('falls back to null instead of throwing when sessionStorage is unavailable', () => {
    // No `window` in the node environment: every accessor must swallow that.
    expect(getParentToken()).toBeNull();
    expect(() => setParentToken('x')).not.toThrow();
  });
});
