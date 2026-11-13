// Types mirroring the StoryWeaver API contract exactly. No `any`.

export type Mood = 'wonder' | 'excitement' | 'mystery' | 'joy' | 'calm';

export type CharacterArchetype = 'brave' | 'curious' | 'funny' | 'kind';
export type World = 'forest' | 'ocean' | 'space' | 'city';
export type Theme = 'friendship' | 'courage' | 'mystery' | 'adventure';

export interface ChildProfile {
  id: string;
  name: string;
  age: number;
  avatar_id: string;
  created_at: string;
  /** The seeded household profile: editable, never deletable. */
  is_default: boolean;
}

export interface CreateProfileBody {
  name: string;
  age: number;
  avatar_id: string;
  parent_pin?: string;
}

/** Partial update (parent token required): omitted fields are left unchanged. */
export interface UpdateProfileBody {
  name?: string;
  age?: number;
  avatar_id?: string;
}

/** Full chapter object. `chapter_text` is only present in non-stream returns. */
export interface Chapter {
  chapter_number: number;
  chapter_title: string;
  chapter_text: string;
  choices: [string, string, string];
  scene_description: string;
  mood: Mood;
  new_vocabulary: string[];
  curiosity_question: string;
  image_url: string;
  /** True for the last chapter (the goodnight ending in bedtime mode). */
  is_final: boolean;
}

/** Chapter meta arrives via SSE WITHOUT chapter_text. */
export type ChapterMeta = Omit<Chapter, 'chapter_text'>;

export interface StartStoryBody {
  child_id: string;
  character_name: string;
  character_archetype: CharacterArchetype;
  world: World;
  theme: Theme;
  bedtime?: boolean;
}

export interface StartStoryResponse {
  session_id: string;
  story_id: string;
  title: string;
  bedtime: boolean;
  max_chapters: number;
}

/** The child's most recent unfinished story, offered as "Continue". */
export interface ActiveStory {
  story_id: string;
  title: string;
  chapter_count: number;
  max_chapters: number;
  bedtime: boolean;
  /** ISO timestamp of the last activity. */
  updated_at: string;
}

export interface ResumeResponse {
  session_id: string;
  story_id: string;
  title: string;
  bedtime: boolean;
  max_chapters: number;
  setup: {
    character_name: string;
    character_archetype: CharacterArchetype;
    world: World;
    theme: Theme;
  };
  /** Full chapters, including chapter_text and is_final. */
  chapters: Chapter[];
}

export interface ChoiceBody {
  session_id: string;
  choice: string;
}

export interface ChoiceResponse {
  session_id: string;
  chapter_number: number;
}

export interface CuriosityAnswerBody {
  session_id: string;
  answer: string;
}

export interface CuriosityAnswerResponse {
  acknowledged: true;
}

export interface EndStoryBody {
  session_id: string;
}

export interface Certificate {
  child_name: string;
  character_name: string;
  achievement: string;
  title: string;
}

export interface VocabularyEntry {
  word: string;
  definition: string;
}

export interface EndStoryResponse {
  story_id: string;
  certificate: Certificate;
  vocabulary: VocabularyEntry[];
}

export interface Story {
  id: string;
  title: string;
  created_at: string;
  character_name?: string;
  world?: World;
  theme?: Theme;
  chapter_count?: number;
}

export interface DashboardThemes {
  joy: number;
  courage: number;
  friendship: number;
  mystery: number;
}

export interface DashboardData {
  stories_count: number;
  titles: string[];
  total_reading_seconds: number;
  vocabulary: VocabularyEntry[];
  themes: DashboardThemes;
  creativity_score: number;
  recent_curiosity_answers: string[];
}

// Parent lock
export interface ParentStatus {
  pin_set: boolean;
}

export interface UnlockResponse {
  token: string;
  expires_at: string;
}

export interface ResetChallenge {
  challenge_id: string;
  question: string;
}

export interface ResetPinBody {
  challenge_id: string;
  /** Numeric answer to the arithmetic question. */
  answer: number;
  new_pin: string;
}

// SSE event payload shapes
export interface SentenceEventData {
  text: string;
}
