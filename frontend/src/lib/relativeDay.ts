// "last night", "yesterday", "3 days ago": how long ago a story was last touched,
// the way a parent would say it. Works on the device's local calendar.

/** From this hour on, the evening belongs to "last night" (matches the bedtime window's feel). */
const NIGHT_STARTS_HOUR = 18;
/** Before this hour, the small hours still belong to "last night". */
const NIGHT_ENDS_HOUR = 6;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local calendar day as a day number. Via UTC, so a 23- or 25-hour DST day still counts as one. */
function calendarDay(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
}

/**
 * - "last night": yesterday from 18:00 on, or today before 06:00
 * - "today": earlier today from 06:00 (also a time slightly in the future, i.e. clock skew)
 * - "yesterday": yesterday before 18:00
 * - "N days ago": two or more calendar days back
 * - "": `updatedAt` is not a valid date (so the caller can leave the time out)
 */
export function relativeDay(updatedAt: Date, now: Date): string {
  if (Number.isNaN(updatedAt.getTime())) return '';

  const daysAgo = calendarDay(now) - calendarDay(updatedAt);
  const hour = updatedAt.getHours();

  if (daysAgo <= 0) return daysAgo === 0 && hour < NIGHT_ENDS_HOUR ? 'last night' : 'today';
  if (daysAgo === 1) return hour >= NIGHT_STARTS_HOUR ? 'last night' : 'yesterday';
  return `${daysAgo} days ago`;
}
