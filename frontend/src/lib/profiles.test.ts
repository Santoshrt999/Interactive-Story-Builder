import { describe, expect, it } from 'vitest';
import type { ChildProfile } from '@/api/types';
import {
  activeAfterDelete,
  activeAfterUpdate,
  cleanProfileName,
  defaultProfile,
  pickSelectedChild,
  resolveActiveProfile,
} from './profiles';

function profile(id: string, overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id,
    name: `Child ${id}`,
    age: 7,
    avatar_id: 'unicorn',
    created_at: '2026-11-12T00:00:00',
    is_default: false,
    ...overrides,
  };
}

const shreyanvi = profile('s', { name: 'Shreyanvi', is_default: true });
const shreyu = profile('u', { name: 'Shreyu' });

describe('cleanProfileName', () => {
  it('trims', () => {
    expect(cleanProfileName('  Shreyu  ')).toBe('Shreyu');
  });

  it('rejects blank names and names over 30 characters', () => {
    expect(cleanProfileName('')).toBeNull();
    expect(cleanProfileName('   ')).toBeNull();
    expect(cleanProfileName('a'.repeat(30))).toBe('a'.repeat(30));
    expect(cleanProfileName('a'.repeat(31))).toBeNull();
    // Trimming happens first: padding does not count against the limit.
    expect(cleanProfileName(` ${'a'.repeat(30)} `)).toBe('a'.repeat(30));
  });
});

describe('defaultProfile', () => {
  it('prefers the is_default profile, wherever it sits', () => {
    expect(defaultProfile([shreyu, shreyanvi])).toBe(shreyanvi);
  });

  it('falls back to the first profile, or null for none', () => {
    expect(defaultProfile([shreyu])).toBe(shreyu);
    expect(defaultProfile([])).toBeNull();
  });
});

describe('resolveActiveProfile', () => {
  it('picks the default profile when nobody is active', () => {
    expect(resolveActiveProfile([shreyu, shreyanvi], null)).toBe(shreyanvi);
  });

  it('keeps the very same object when nothing changed', () => {
    const active = { ...shreyu };
    expect(resolveActiveProfile([shreyanvi, shreyu], active)).toBe(active);
  });

  it('refreshes an active profile that was renamed elsewhere', () => {
    const renamed = { ...shreyu, name: 'Shreya' };
    expect(resolveActiveProfile([shreyanvi, renamed], shreyu)).toBe(renamed);
  });

  it('refreshes an old saved copy that predates is_default', () => {
    const old = { ...shreyanvi } as Partial<ChildProfile>;
    delete old.is_default;
    expect(resolveActiveProfile([shreyanvi], old as ChildProfile)).toBe(shreyanvi);
  });

  it('switches to the default when the active profile no longer exists', () => {
    expect(resolveActiveProfile([shreyanvi], shreyu)).toBe(shreyanvi);
  });

  it('is null when there are no profiles at all', () => {
    expect(resolveActiveProfile([], shreyu)).toBeNull();
    expect(resolveActiveProfile([], null)).toBeNull();
  });
});

describe('activeAfterUpdate', () => {
  it('replaces the active profile when it is the one renamed', () => {
    const renamed = { ...shreyu, name: 'Shreya' };
    expect(activeAfterUpdate(shreyu, renamed)).toBe(renamed);
  });

  it('leaves the active profile alone when another one was edited', () => {
    expect(activeAfterUpdate(shreyanvi, { ...shreyu, name: 'Shreya' })).toBe(shreyanvi);
    expect(activeAfterUpdate(null, shreyu)).toBeNull();
  });
});

describe('activeAfterDelete', () => {
  it('switches to the default profile when the active one is deleted', () => {
    expect(activeAfterDelete(shreyu, 'u', [shreyanvi])).toBe(shreyanvi);
  });

  it('keeps the active profile when somebody else is deleted', () => {
    expect(activeAfterDelete(shreyanvi, 'u', [shreyanvi])).toBe(shreyanvi);
    expect(activeAfterDelete(null, 'u', [shreyanvi])).toBeNull();
  });
});

describe('pickSelectedChild', () => {
  const all = [shreyanvi, shreyu];

  it('keeps the tab the parent picked', () => {
    expect(pickSelectedChild(all, 'u', 's')).toBe('u');
  });

  it('defaults to the active profile', () => {
    expect(pickSelectedChild(all, null, 'u')).toBe('u');
  });

  it('falls back to the default profile when the pick and the active one are gone', () => {
    expect(pickSelectedChild(all, 'gone', 'also-gone')).toBe('s');
    expect(pickSelectedChild(all, null, null)).toBe('s');
    expect(pickSelectedChild(all, null, undefined)).toBe('s');
  });

  it('is null with no profiles', () => {
    expect(pickSelectedChild([], 'u', 's')).toBeNull();
  });
});
