import { describe, expect, it } from 'vitest';
import { eveningKey, shouldSuggestBedtime } from './bedtime';

describe('shouldSuggestBedtime', () => {
  it('suggests from 19:00 local time', () => {
    expect(shouldSuggestBedtime(new Date('2026-11-12T19:00:00'), null)).toBe(true);
    expect(shouldSuggestBedtime(new Date('2026-11-12T18:59:00'), null)).toBe(false);
  });

  it('keeps suggesting through the night until 06:00', () => {
    expect(shouldSuggestBedtime(new Date('2026-11-13T05:59:00'), null)).toBe(true);
    expect(shouldSuggestBedtime(new Date('2026-11-13T06:00:00'), null)).toBe(false);
  });

  it('does not suggest during the day', () => {
    expect(shouldSuggestBedtime(new Date('2026-11-12T12:00:00'), null)).toBe(false);
  });

  it('suggests only once per evening', () => {
    // Already suggested on the evening of 11-12; 02:00 on 11-13 is the same evening.
    expect(shouldSuggestBedtime(new Date('2026-11-13T02:00:00'), '2026-11-12')).toBe(false);
    expect(shouldSuggestBedtime(new Date('2026-11-12T20:30:00'), '2026-11-12')).toBe(false);
  });

  it('suggests again on a new evening', () => {
    expect(shouldSuggestBedtime(new Date('2026-11-13T19:00:00'), '2026-11-12')).toBe(true);
  });
});

describe('eveningKey', () => {
  it('uses the same calendar day for evening hours', () => {
    expect(eveningKey(new Date('2026-11-12T19:00:00'))).toBe('2026-11-12');
    expect(eveningKey(new Date('2026-11-12T23:59:00'))).toBe('2026-11-12');
  });

  it('assigns hours before 06:00 to the previous day', () => {
    expect(eveningKey(new Date('2026-11-13T02:00:00'))).toBe('2026-11-12');
    expect(eveningKey(new Date('2026-11-13T00:00:00'))).toBe('2026-11-12');
    expect(eveningKey(new Date('2026-11-13T05:59:00'))).toBe('2026-11-12');
    expect(eveningKey(new Date('2026-11-13T06:00:00'))).toBe('2026-11-13');
  });

  it('rolls back across month and year boundaries', () => {
    expect(eveningKey(new Date('2026-12-01T01:00:00'))).toBe('2026-11-30');
    expect(eveningKey(new Date('2027-01-01T03:00:00'))).toBe('2026-12-31');
  });
});
