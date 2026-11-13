import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { clearParentToken, getParentToken, setParentToken } from '@/lib/parentSession';
import { classifyUnlockError } from '@/lib/pinEntry';
import type { ParentStatus } from '@/api/types';

/** Fired by the API client when the server says the parent lock closed (and by `lock()`). */
export const PARENT_LOCKED_EVENT = 'parent-locked';
/** Fired by `unlock()` so every `useParentLock` on the page opens together. */
export const PARENT_UNLOCKED_EVENT = 'parent-unlocked';

const PARENT_STATUS_KEY = ['parent-status'] as const;

export type UnlockResult = 'ok' | 'wrong' | { retryAfter: number };

export interface ResetPinArgs {
  challengeId: string;
  answer: number;
  newPin: string;
}

/**
 * The household parent lock as the UI sees it. The unlock token itself lives
 * in sessionStorage (see `parentSession`) and is sent by the API client; this
 * hook tracks whether the lock is open so pages can react. Every instance
 * stays in step through window events, so the PIN pad opening the lock opens
 * it for the page behind too.
 */
export function useParentLock() {
  const queryClient = useQueryClient();
  const [unlocked, setUnlocked] = useState(() => getParentToken() !== null);
  const status = useQuery<ParentStatus>({
    queryKey: PARENT_STATUS_KEY,
    queryFn: api.parentStatus,
  });

  useEffect(() => {
    const onLocked = () => setUnlocked(false);
    const onUnlocked = () => setUnlocked(true);
    window.addEventListener(PARENT_LOCKED_EVENT, onLocked);
    window.addEventListener(PARENT_UNLOCKED_EVENT, onUnlocked);
    // The lock may have closed between the first render and now.
    if (getParentToken() === null) setUnlocked(false);
    return () => {
      window.removeEventListener(PARENT_LOCKED_EVENT, onLocked);
      window.removeEventListener(PARENT_UNLOCKED_EVENT, onUnlocked);
    };
  }, []);

  /** Open the lock with a PIN. Throws only when the server can't be reached or misbehaves. */
  const unlock = useCallback(async (pin: string): Promise<UnlockResult> => {
    try {
      const { token } = await api.unlockParent(pin);
      setParentToken(token);
      window.dispatchEvent(new Event(PARENT_UNLOCKED_EVENT));
      return 'ok';
    } catch (err) {
      const failure = classifyUnlockError(err);
      if (failure) return failure;
      throw err;
    }
  }, []);

  /** First-time setup: save the household PIN, then open the lock with it. */
  const createPin = useCallback(
    async (pin: string): Promise<void> => {
      await api.setParentPin(pin);
      try {
        const result = await unlock(pin);
        if (result !== 'ok') {
          throw new Error('The new PIN was saved but could not be used to unlock.');
        }
      } finally {
        // After unlocking, so the pad (still showing "make a PIN") closes with the unlock
        // instead of flipping to "enter your PIN" for a moment first.
        queryClient.setQueryData<ParentStatus>(PARENT_STATUS_KEY, { pin_set: true });
      }
    },
    [queryClient, unlock]
  );

  /** Forgot PIN: prove the sum, set a new PIN, and open the lock with it. 403 means a wrong answer. */
  const resetPin = useCallback(
    async ({ challengeId, answer, newPin }: ResetPinArgs): Promise<void> => {
      await api.resetParentPin({ challenge_id: challengeId, answer, new_pin: newPin });
      const result = await unlock(newPin);
      if (result !== 'ok')
        throw new Error('The new PIN was saved but could not be used to unlock.');
    },
    [unlock]
  );

  /** Change the PIN while the lock is open. */
  const changePin = useCallback((newPin: string) => api.changeParentPin(newPin), []);

  /** Close the lock now, here and on the server. The page locks at once; the server call is best effort. */
  const lock = useCallback(async (): Promise<void> => {
    // The request reads the token as it starts, so clearing it right after is safe.
    const serverLocked = api.lockParent().catch(() => undefined);
    clearParentToken();
    window.dispatchEvent(new Event(PARENT_LOCKED_EVENT));
    await serverLocked;
  }, []);

  return {
    unlocked,
    /** Is a PIN set yet? `undefined` until the server has said. */
    pinSet: status.data?.pin_set,
    /** The server couldn't be asked whether a PIN is set. */
    statusError: status.isError,
    refetchStatus: status.refetch,
    unlock,
    createPin,
    resetPin,
    changePin,
    lock,
  };
}
