import { describe, expect, it } from 'vitest';
import { relativeDay } from './relativeDay';

// Local-time dates (no "Z"), like bedtime.test.ts: the helper works on the device's calendar.
const at = (iso: string) => new Date(iso);

describe('relativeDay', () => {
  it('says "today" for earlier the same day', () => {
    expect(relativeDay(at('2026-11-12T09:00:00'), at('2026-11-12T15:30:00'))).toBe('today');
    expect(relativeDay(at('2026-11-12T06:00:00'), at('2026-11-12T21:00:00'))).toBe('today');
  });

  it('says "today" when the clock is slightly behind the server (a time in the future)', () => {
    expect(relativeDay(at('2026-11-12T15:31:00'), at('2026-11-12T15:30:00'))).toBe('today');
    expect(relativeDay(at('2026-11-13T09:00:00'), at('2026-11-12T15:30:00'))).toBe('today');
  });

  describe('"last night": yesterday from 18:00, or this morning before 06:00', () => {
    it('is yesterday evening from 18:00 on', () => {
      expect(relativeDay(at('2026-11-11T18:00:00'), at('2026-11-12T08:00:00'))).toBe('last night');
      expect(relativeDay(at('2026-11-11T20:15:00'), at('2026-11-12T19:00:00'))).toBe('last night');
      expect(relativeDay(at('2026-11-11T23:59:00'), at('2026-11-12T00:05:00'))).toBe('last night');
    });

    it('is yesterday before 18:00 → "yesterday"', () => {
      expect(relativeDay(at('2026-11-11T17:59:00'), at('2026-11-12T08:00:00'))).toBe('yesterday');
      expect(relativeDay(at('2026-11-11T00:00:00'), at('2026-11-12T08:00:00'))).toBe('yesterday');
    });

    it('is the small hours of today (before 06:00)', () => {
      expect(relativeDay(at('2026-11-12T00:30:00'), at('2026-11-12T08:00:00'))).toBe('last night');
      expect(relativeDay(at('2026-11-12T05:59:00'), at('2026-11-12T08:00:00'))).toBe('last night');
    });

    it('is not the small hours once it is 06:00', () => {
      expect(relativeDay(at('2026-11-12T06:00:00'), at('2026-11-12T08:00:00'))).toBe('today');
    });
  });

  it('counts whole calendar days from two days back: "N days ago"', () => {
    expect(relativeDay(at('2026-11-10T20:00:00'), at('2026-11-12T08:00:00'))).toBe('2 days ago');
    expect(relativeDay(at('2026-11-10T01:00:00'), at('2026-11-12T23:59:00'))).toBe('2 days ago');
    expect(relativeDay(at('2026-11-05T12:00:00'), at('2026-11-12T08:00:00'))).toBe('7 days ago');
  });

  it('counts calendar days, not 24-hour spans', () => {
    // 23:00 -> 01:00 is only two hours apart, but it is yesterday evening.
    expect(relativeDay(at('2026-11-11T23:00:00'), at('2026-11-12T01:00:00'))).toBe('last night');
    // 01:00 two days ago -> 23:00 today is 46 hours: still "2 days ago".
    expect(relativeDay(at('2026-11-10T01:00:00'), at('2026-11-12T23:00:00'))).toBe('2 days ago');
  });

  it('works across month and year boundaries', () => {
    expect(relativeDay(at('2026-10-31T19:00:00'), at('2026-11-01T08:00:00'))).toBe('last night');
    expect(relativeDay(at('2026-12-30T12:00:00'), at('2027-01-02T08:00:00'))).toBe('3 days ago');
  });

  it('counts calendar days across a daylight-saving change', () => {
    // US clocks went back on 2026-11-01: that day is 25 hours long.
    expect(relativeDay(at('2026-11-01T12:00:00'), at('2026-11-03T08:00:00'))).toBe('2 days ago');
    // ... and forward on 2026-03-08 (23 hours).
    expect(relativeDay(at('2026-03-08T12:00:00'), at('2026-03-10T08:00:00'))).toBe('2 days ago');
  });

  it('gives an empty string for an invalid date, so the caller can leave it out', () => {
    expect(relativeDay(new Date('not a date'), at('2026-11-12T08:00:00'))).toBe('');
  });
});
