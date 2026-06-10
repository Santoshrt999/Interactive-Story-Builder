// Shared playful constants: avatars, archetypes, worlds, themes, moods.

import type { CharacterArchetype, World, Theme, Mood } from '@/api/types';

export interface AvatarDef {
  id: string;
  emoji: string;
  label: string;
  /** Tailwind-friendly gradient stops as raw colors. */
  from: string;
  to: string;
}

export const AVATARS: AvatarDef[] = [
  { id: 'fox', emoji: '🦊', label: 'Fox', from: '#ff8a3d', to: '#ff5e7e' },
  { id: 'owl', emoji: '🦉', label: 'Owl', from: '#7c6cff', to: '#4ec5ff' },
  { id: 'bunny', emoji: '🐰', label: 'Bunny', from: '#ff9ec7', to: '#ffd6a5' },
  { id: 'frog', emoji: '🐸', label: 'Frog', from: '#5be0a0', to: '#3dd6d0' },
  { id: 'cat', emoji: '🐱', label: 'Cat', from: '#ffb86b', to: '#ff7eb3' },
  { id: 'panda', emoji: '🐼', label: 'Panda', from: '#a0e7ff', to: '#7c9cff' },
  { id: 'dragon', emoji: '🐲', label: 'Dragon', from: '#8effa3', to: '#3dc5ff' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn', from: '#c08bff', to: '#ff8ad8' },
];

export function avatarById(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

export interface ArchetypeDef {
  id: CharacterArchetype;
  emoji: string;
  label: string;
  blurb: string;
}

export const ARCHETYPES: ArchetypeDef[] = [
  { id: 'brave', emoji: '🛡️', label: 'Brave', blurb: 'Faces big challenges with a bold heart.' },
  { id: 'curious', emoji: '🔭', label: 'Curious', blurb: 'Always asking "what if?" and "why?"' },
  { id: 'funny', emoji: '🤹', label: 'Funny', blurb: 'Turns every moment into a giggle.' },
  { id: 'kind', emoji: '💛', label: 'Kind', blurb: 'Helps friends and shares the sunshine.' },
];

export interface WorldDef {
  id: World;
  emoji: string;
  label: string;
  blurb: string;
  /** Extra emoji used as decorative scenery in the world card. */
  scenery: string;
  from: string;
  to: string;
}

export const WORLDS: WorldDef[] = [
  {
    id: 'forest',
    emoji: '🌲',
    label: 'Whispering Forest',
    blurb: 'Mossy paths, talking creatures, and secrets between the trees.',
    scenery: '🍄🦋🌿',
    from: '#2f8f5b',
    to: '#9be15d',
  },
  {
    id: 'ocean',
    emoji: '🌊',
    label: 'Coral Deep',
    blurb: 'Dive into glittering reefs where friendly sea folk await.',
    scenery: '🐠🐚🫧',
    from: '#1f7fb8',
    to: '#5be0d0',
  },
  {
    id: 'space',
    emoji: '🚀',
    label: 'Starlit Space',
    blurb: 'Zoom past planets and comets toward a cosmic mystery.',
    scenery: '🪐⭐🛰️',
    from: '#5b3fb8',
    to: '#b18cff',
  },
  {
    id: 'city',
    emoji: '🏙️',
    label: 'Sparkle City',
    blurb: 'Bustling streets full of wonders, gadgets, and new friends.',
    scenery: '🚦🎡🌆',
    from: '#b8651f',
    to: '#ffc46b',
  },
];

export interface ThemeDef {
  id: Theme;
  emoji: string;
  label: string;
  blurb: string;
}

export const STORY_THEMES: ThemeDef[] = [
  { id: 'friendship', emoji: '🤝', label: 'Friendship', blurb: 'Make a true friend and stick together.' },
  { id: 'courage', emoji: '🦁', label: 'Courage', blurb: 'Be brave when things feel big and scary.' },
  { id: 'mystery', emoji: '🔍', label: 'Mystery', blurb: 'Follow clues and solve a curious puzzle.' },
  { id: 'adventure', emoji: '🗺️', label: 'Adventure', blurb: 'Explore the unknown and discover treasure.' },
];

export const MOOD_GRADIENT: Record<Mood, { from: string; to: string }> = {
  wonder: { from: '#5b3fb8', to: '#3dc5ff' },
  excitement: { from: '#ff6b3d', to: '#ffd23d' },
  mystery: { from: '#2a2150', to: '#6b4fb8' },
  joy: { from: '#ff8ad8', to: '#ffd6a5' },
  calm: { from: '#3d9fb8', to: '#a0e7d0' },
};

export const PARENT_PIN_LENGTH = 4;

/** The favourite default child. */
export const DEFAULT_CHILD_NAME = 'Shreyu';

/** True when the profile/name belongs to our beloved default child. */
export function isShreyu(name: string | null | undefined): boolean {
  return (name ?? '').trim().toLowerCase() === DEFAULT_CHILD_NAME.toLowerCase();
}

/** Render a name with a heart suffix when it is Shreyu's. */
export function nameWithHeart(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return isShreyu(n) ? `${n} ♥` : n;
}

/**
 * Absolute backend origin for assets (illustrations) so downloaded HTML keeps
 * working. Uses VITE_API_URL when set, else the local dev backend.
 */
export const ASSET_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() || 'http://localhost:8000';

/** Turn a possibly-relative image_url into an absolute URL against the backend. */
export function absoluteAssetUrl(url: string | null | undefined): string {
  const u = (url ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `${ASSET_BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;
}

/** Placeholder world illustration served by the backend static folder. */
export function worldPlaceholder(world: World): string {
  return `${ASSET_BASE_URL}/static/images/placeholder_${world}.svg`;
}
