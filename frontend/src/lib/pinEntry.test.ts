import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import {
  classifyUnlockError,
  keyToPinKey,
  parseChallengeAnswer,
  pinReducer,
  retryAfterFrom,
  secondsLeft,
  type PinKey,
} from './pinEntry';

const digit = (d: string): PinKey => ({ type: 'digit', digit: d });
const backspace: PinKey = { type: 'backspace' };

describe('pinReducer', () => {
  it('appends digits up to exactly four', () => {
    let pin = '';
    for (const d of '12345') pin = pinReducer(pin, digit(d));
    expect(pin).toBe('1234');
  });

  it('ignores anything that is not a single digit', () => {
    expect(pinReducer('12', digit('a'))).toBe('12');
    expect(pinReducer('12', digit(''))).toBe('12');
    expect(pinReducer('12', digit('34'))).toBe('12');
    expect(pinReducer('12', digit('-'))).toBe('12');
  });

  it('backspace removes the last digit and is safe on an empty PIN', () => {
    expect(pinReducer('123', backspace)).toBe('12');
    expect(pinReducer('', backspace)).toBe('');
  });

  it('honours a custom length', () => {
    expect(pinReducer('12', digit('3'), 2)).toBe('12');
  });
});

describe('keyToPinKey', () => {
  it('maps digits and Backspace', () => {
    expect(keyToPinKey('7')).toEqual(digit('7'));
    expect(keyToPinKey('0')).toEqual(digit('0'));
    expect(keyToPinKey('Backspace')).toEqual(backspace);
  });

  it('ignores every other key', () => {
    for (const k of ['a', 'Enter', 'Escape', ' ', '10', 'Tab', '']) {
      expect(keyToPinKey(k)).toBeNull();
    }
  });
});

describe('parseChallengeAnswer', () => {
  it('reads whole numbers, trimming spaces', () => {
    expect(parseChallengeAnswer('161')).toBe(161);
    expect(parseChallengeAnswer('  42 ')).toBe(42);
    expect(parseChallengeAnswer('0')).toBe(0);
  });

  it('rejects blanks, decimals, negatives and words', () => {
    for (const t of ['', '  ', '1.5', '-3', 'ten', '1e3', '12 3']) {
      expect(parseChallengeAnswer(t)).toBeNull();
    }
  });
});

describe('secondsLeft', () => {
  it('rounds up and never goes below zero', () => {
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 4_000)).toBe(6);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 20_000)).toBe(0);
  });
});

describe('retryAfterFrom', () => {
  it('reads retry_after from the 429 body', () => {
    expect(retryAfterFrom({ detail: 'too many attempts', retry_after: 42 })).toBe(42);
    expect(retryAfterFrom({ retry_after: 12.2 })).toBe(13);
  });

  it('falls back to the 60 s cool-down when it is missing or nonsense', () => {
    expect(retryAfterFrom(undefined)).toBe(60);
    expect(retryAfterFrom({})).toBe(60);
    expect(retryAfterFrom({ retry_after: 'soon' })).toBe(60);
    expect(retryAfterFrom({ retry_after: 0 })).toBe(60);
  });
});

describe('classifyUnlockError', () => {
  it('401 is a wrong PIN', () => {
    expect(classifyUnlockError(new ApiError('wrong pin', 401))).toBe('wrong');
  });

  it('429 is a cool-down with the seconds to wait', () => {
    const err = new ApiError('too many attempts', 429, { retry_after: 37 });
    expect(classifyUnlockError(err)).toEqual({ retryAfter: 37 });
  });

  it('anything else is unexpected', () => {
    expect(classifyUnlockError(new ApiError('boom', 500))).toBeNull();
    expect(classifyUnlockError(new TypeError('Failed to fetch'))).toBeNull();
    expect(classifyUnlockError('nope')).toBeNull();
  });
});
