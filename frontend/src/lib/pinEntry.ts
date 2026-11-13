// Pure helpers behind the parent PIN pad: digit entry, the physical keyboard,
// the "forgot PIN" arithmetic answer, and reading the server's cool-down reply.

import { ApiError } from '@/api/client';
import { PARENT_PIN_LENGTH } from '@/lib/theme';

export type PinKey = { type: 'digit'; digit: string } | { type: 'backspace' };

/** Apply one key to the digits typed so far: digits only, never more than `length`. */
export function pinReducer(pin: string, key: PinKey, length = PARENT_PIN_LENGTH): string {
  if (key.type === 'backspace') return pin.slice(0, -1);
  if (!/^[0-9]$/.test(key.digit) || pin.length >= length) return pin;
  return pin + key.digit;
}

/** Map a physical keyboard key (KeyboardEvent.key) to a PIN key, or null if it isn't one. */
export function keyToPinKey(key: string): PinKey | null {
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: key };
  if (key === 'Backspace') return { type: 'backspace' };
  return null;
}

/** The answer to the "forgot PIN" sum: whole digits only (the server wants a number). */
export function parseChallengeAnswer(text: string): number | null {
  const t = text.trim();
  return /^[0-9]{1,6}$/.test(t) ? Number(t) : null;
}

/** Whole seconds left until `until` (epoch ms), never negative. */
export function secondsLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** The server's cool-down is 60 s; used if a 429 arrives without a `retry_after`. */
const DEFAULT_RETRY_AFTER = 60;

/** Seconds to wait, read from a 429 body `{ retry_after }` (always at least 1). */
export function retryAfterFrom(body: unknown): number {
  if (body && typeof body === 'object' && 'retry_after' in body) {
    const n = Number((body as { retry_after: unknown }).retry_after);
    if (Number.isFinite(n) && n > 0) return Math.ceil(n);
  }
  return DEFAULT_RETRY_AFTER;
}

export type UnlockFailure = 'wrong' | { retryAfter: number };

/**
 * What a failed unlock means: 401 is a wrong PIN, 429 a cool-down. Anything
 * else (network down, server error) is not the parent's fault: null, so the
 * caller can say "couldn't reach the server" instead of "try again".
 */
export function classifyUnlockError(err: unknown): UnlockFailure | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 401) return 'wrong';
  if (err.status === 429) return { retryAfter: retryAfterFrom(err.body) };
  return null;
}
