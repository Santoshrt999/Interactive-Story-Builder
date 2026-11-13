// Pure helpers for keeping "who is playing" in step with the profile list.

import type { ChildProfile } from '@/api/types';

export const PROFILE_NAME_MAX = 30;
export const PROFILE_AGE_MAX = 12;

/** The name as the server will store it (trimmed), or null if it can't be saved (empty or too long). */
export function cleanProfileName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= PROFILE_NAME_MAX ? trimmed : null;
}

/** The household default profile, falling back to the first one. */
export function defaultProfile(profiles: ChildProfile[]): ChildProfile | null {
  return profiles.find((p) => p.is_default) ?? profiles[0] ?? null;
}

function sameProfile(a: ChildProfile, b: ChildProfile): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.age === b.age &&
    a.avatar_id === b.avatar_id &&
    a.is_default === b.is_default
  );
}

/**
 * Who should be active given the server's list. A saved active profile is
 * refreshed from the list (it may have been renamed, or be an old copy saved
 * before profiles had `is_default`); one that no longer exists, or none at
 * all, becomes the default profile. Returns `active` itself when nothing
 * changes, so callers can skip the update with a reference check.
 */
export function resolveActiveProfile(
  profiles: ChildProfile[],
  active: ChildProfile | null
): ChildProfile | null {
  const fresh = active ? profiles.find((p) => p.id === active.id) : undefined;
  if (active && fresh) return sameProfile(active, fresh) ? active : fresh;
  return defaultProfile(profiles);
}

/** The active profile after `updated` was saved: a rename shows up straight away. */
export function activeAfterUpdate(
  active: ChildProfile | null,
  updated: ChildProfile
): ChildProfile | null {
  return active?.id === updated.id ? updated : active;
}

/**
 * The active profile after one was deleted. `remaining` is the list without
 * it. Deleting someone else's profile changes nothing; deleting the active
 * one switches to the default profile.
 */
export function activeAfterDelete(
  active: ChildProfile | null,
  deletedId: string,
  remaining: ChildProfile[]
): ChildProfile | null {
  return active?.id === deletedId ? defaultProfile(remaining) : active;
}

/**
 * Whose insights the Parent corner shows: the child picked there if they still
 * exist, else the active profile, else the default. Returns an id.
 */
export function pickSelectedChild(
  profiles: ChildProfile[],
  selectedId: string | null,
  activeId: string | null | undefined
): string | null {
  const exists = (id: string | null | undefined): id is string =>
    id != null && profiles.some((p) => p.id === id);
  if (exists(selectedId)) return selectedId;
  if (exists(activeId)) return activeId;
  return defaultProfile(profiles)?.id ?? null;
}
