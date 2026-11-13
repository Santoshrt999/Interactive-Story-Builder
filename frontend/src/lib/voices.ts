/**
 * Choosing the storyteller's voice from what the device has installed.
 *
 * Browsers only offer the operating system's voices. On a Mac the default ones
 * are low-quality "compact" voices; Apple's free Premium / Enhanced downloads
 * (e.g. Zoe, Ava) sound far more natural, so they rank first.
 */

/** The slice of SpeechSynthesisVoice we rely on (keeps this testable in node). */
export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
}

/** Warm female English voices, best first (matched on the name before any "(…)"). */
const FRIENDLY_FEMALE = [
  'zoe',
  'ava',
  'allison',
  'samantha',
  'susan',
  'nicky',
  'serena',
  'kate',
  'karen',
  'tessa',
  'moira',
  'fiona',
  'victoria',
  'google uk english female',
  'google us english',
  'microsoft aria',
  'microsoft jenny',
  'microsoft zira',
];

/** Novelty / joke voices and male voices that never suit a bedtime story. */
const NEVER = [
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'wobble',
  'good news', 'jester', 'junior', 'organ', 'superstar', 'trinoids', 'whisper',
  'zarvox', 'fred', 'ralph', 'grandpa', 'eddy', 'reed', 'rocko', 'daniel',
  'rishi', 'alex', 'tom', 'aaron', 'arthur', 'evan', 'nathan', 'oliver',
  'gordon', 'lee', 'microsoft david', 'microsoft mark', 'microsoft guy',
  'google uk english male',
];

/** "Zoe (Premium)" → "zoe"; "Flo (English (US))" → "flo". */
export function baseName(name: string): string {
  return name.replace(/\s*\(.*$/, '').trim().toLowerCase();
}

/** Apple's natural downloadable voices are tagged "(Premium)" or "(Enhanced)". */
export function voiceQuality(name: string): 'premium' | 'enhanced' | 'standard' {
  const n = name.toLowerCase();
  if (n.includes('(premium)')) return 'premium';
  if (n.includes('(enhanced)')) return 'enhanced';
  return 'standard';
}

/** True when this voice is natural-sounding (worth a "✨" badge in the picker). */
export function isNatural(voice: VoiceLike): boolean {
  return voiceQuality(voice.name) !== 'standard';
}

function score(voice: VoiceLike): number | null {
  if (!voice.lang.toLowerCase().startsWith('en')) return null;
  const base = baseName(voice.name);
  if (NEVER.includes(base)) return null;
  const friendlyIndex = FRIENDLY_FEMALE.indexOf(base);
  const quality = voiceQuality(voice.name);
  // Quality dominates, then the friendly-voice order, then US/GB English.
  let s = quality === 'premium' ? 3000 : quality === 'enhanced' ? 2000 : 0;
  if (friendlyIndex >= 0) s += 1000 - friendlyIndex * 10;
  else if (quality === 'standard') return null; // unknown compact voice: likely robotic
  const lang = voice.lang.toLowerCase().replace('_', '-');
  if (lang === 'en-us' || lang === 'en-gb') s += 5;
  return s;
}

/** Child-friendly English voices, best first. Duplicates (same name) removed. */
export function rankVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  const seen = new Set<string>();
  return voices
    .map((v) => ({ v, s: score(v) }))
    .filter((x): x is { v: T; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v)
    .filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)));
}

/**
 * The voice to narrate with: the parent's saved choice if it is still installed,
 * otherwise the best-ranked voice, otherwise any English voice, otherwise null.
 */
export function pickVoice<T extends VoiceLike>(
  voices: readonly T[],
  preferredName: string | null
): T | null {
  if (preferredName) {
    const chosen = voices.find((v) => v.name === preferredName);
    if (chosen) return chosen;
  }
  const ranked = rankVoices(voices);
  if (ranked.length > 0) return ranked[0];
  return voices.find((v) => v.lang.toLowerCase().startsWith('en')) ?? voices[0] ?? null;
}
