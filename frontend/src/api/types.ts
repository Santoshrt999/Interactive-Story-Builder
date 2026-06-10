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
}

export interface CreateProfileBody {
  name: string;
  age: number;
  avatar_id: string;
  parent_pin?: string;
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
}

/** Chapter meta arrives via SSE WITHOUT chapter_text. */
export type ChapterMeta = Omit<Chapter, 'chapter_text'>;

export interface StartStoryBody {
  child_id: string;
  character_name: string;
  character_archetype: CharacterArchetype;
  world: World;
  theme: Theme;
}

export interface StartStoryResponse {
  session_id: string;
  story_id: string;
  title: string;
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

// SSE event payload shapes
export interface SentenceEventData {
  text: string;
}
