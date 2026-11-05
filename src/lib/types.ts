export type ID = string;

export const DECK_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'graphite'] as const;
export type DeckColor = (typeof DECK_COLORS)[number];

export const FLAG_COLORS = ['red', 'orange', 'green', 'blue', 'purple'] as const;
export type FlagColor = (typeof FLAG_COLORS)[number];

export type NoteType = 'basic' | 'reverse' | 'cloze' | 'occlusion';

export type CardStatus = 'new' | 'learning' | 'due' | 'review' | 'mastered' | 'suspended';

export interface Deck {
  id: ID;
  name: string;
  parentId: ID | null;
  color: DeckColor;
  description: string;
  examDate: string | null; // YYYY-MM-DD
  newPerDay: number;
  reviewsPerDay: number;
  ttsLang: string; // '' = auto
  shareId?: string | null; // Drive file id of the public share copy
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** All coordinates are in image pixels of the stored image. */
export interface Mask {
  id: ID;
  kind: 'rect' | 'ellipse' | 'polygon';
  x: number;
  y: number;
  w: number;
  h: number;
  points?: number[]; // polygon, flat [x, y, x, y ...]
  label: string;
  group: number;
}

export interface Annotation {
  id: ID;
  kind: 'pen' | 'highlight' | 'arrow' | 'text' | 'box';
  points?: number[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  color: string;
  size: number;
}

export interface NoteImage {
  mediaId: ID;
  width: number;
  height: number;
  masks: Mask[];
  annotations: Annotation[];
  side: 'front' | 'back';
  occlusionMode: 'hideAll' | 'hideOne';
}

export interface Note {
  id: ID;
  deckId: ID;
  type: NoteType;
  front: string; // sanitized HTML
  back: string;
  extra: string;
  image: NoteImage | null;
  audioFront: ID | null;
  audioBack: ID | null;
  tags: string[];
  flag: FlagColor | null;
  createdAt: number;
  updatedAt: number;
}

export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3; // New, Learning, Review, Relearning
  last_review: number | null;
}

export interface Card {
  id: ID; // `${noteId}:${ord}`
  noteId: ID;
  deckId: ID;
  ord: string; // '0' | '1' | 'c1' | 'g1'
  srs: SrsState;
  suspended: boolean;
  buriedUntil: number | null;
  createdAt: number;
  updatedAt: number;
}

export type Rating = 1 | 2 | 3 | 4;

export interface ReviewLog {
  id: ID;
  cardId: ID;
  deckId: ID;
  rating: Rating;
  ts: number;
  ms: number;
  prevState: number;
}

export interface MediaMeta {
  id: ID;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  name?: string;
  driveId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface XpEvent {
  id: ID;
  ts: number;
  amount: number;
  reason: string;
}

export type Language = 'en' | 'hi';
export type Theme = 'light' | 'dark' | 'system';
export type RatingStyle = 'four' | 'confidence';

export interface Settings {
  language: Language;
  theme: Theme;
  ratingStyle: RatingStyle;
  retention: number;
  maskColor: string;
  targetColor: string;
  ttsVoice: string;
  ttsRate: number;
  ttsAuto: boolean;
  focusMinutes: number;
  breakMinutes: number;
  remindersOn: boolean;
  reminderTime: string; // HH:MM
  dailyGoal: number;
  updatedAt: number;
}

export interface Profile {
  badges: Record<string, number>;
  xpEvents: Record<ID, XpEvent>;
  matchBest: Record<ID, number>;
  gravityBest: number;
  updatedAt: number;
}

export interface StudySessionResume {
  deckId: ID;
  mode: string;
  queue: ID[];
  index: number;
  day: string;
}

export interface Resume {
  route: string;
  session: StudySessionResume | null;
  updatedAt: number;
}

export interface Library {
  schema: 1;
  decks: Record<ID, Deck>;
  notes: Record<ID, Note>;
  cards: Record<ID, Card>;
  reviews: Record<ID, ReviewLog>;
  media: Record<ID, MediaMeta>;
  tombstones: Record<ID, number>;
  settings: Settings;
  profile: Profile;
  resume: Resume;
}

export type EntityKind = 'decks' | 'notes' | 'cards' | 'media';
