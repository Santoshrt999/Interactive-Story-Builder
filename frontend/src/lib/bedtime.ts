// Bedtime auto-suggest window: 19:00–06:00 local time, once per evening.

const WINDOW_START_HOUR = 19;
const WINDOW_END_HOUR = 6;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * YYYY-MM-DD (local) of the evening `now` belongs to. Hours before 06:00 are
 * still "last night", so they map to the previous calendar day.
 */
export function eveningKey(now: Date): string {
  const day = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (now.getHours() < WINDOW_END_HOUR ? 1 : 0)
  );
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** True inside the 19:00–06:00 window unless this evening was already suggested. */
export function shouldSuggestBedtime(now: Date, lastSuggestion: string | null): boolean {
  const hour = now.getHours();
  const inWindow = hour >= WINDOW_START_HOUR || hour < WINDOW_END_HOUR;
  return inWindow && lastSuggestion !== eveningKey(now);
}
