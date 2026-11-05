// Tutorial videos shown on the Tutorial page. Files live in public/tutorial/<id>.mp4 and <id>.jpg.
// Step times are seconds into the video and match the captions burned into it.
// Text is English and doubles as the key for the Hindi dictionary in i18n-hi.ts.
import type { DeckColor } from './types';

export interface TutorialStep {
  at: number;
  text: string;
}

export interface Tutorial {
  id: string;
  title: string;
  summary: string;
  color: DeckColor;
  duration: number;
  action: { label: string; to: string };
  steps: TutorialStep[];
}

export const TUTORIALS: Tutorial[] = [
  {
    id: '01-photos',
    title: 'Turn photos into flashcards',
    summary: 'Add a photo, hide the parts you want to learn, and let the app hide printed text for you.',
    color: 'blue',
    duration: 53,
    action: { label: 'Add photos', to: '/add-photos' },
    steps: [
      { at: 2.5, text: 'Click Add photos and pick one or more photos from your phone or computer.' },
      { at: 6.5, text: 'Each photo opens in the editor. Drag a box over every label you want to learn.' },
      { at: 20.9, text: 'Type an answer for any part if you like. Quizzes and games use it.' },
      { at: 29.5, text: 'One photo is one card: while studying you tap a box to reveal it. For a card per part, change it here.' },
      { at: 32.5, text: 'Open the next photo. For printed notes, Read text from photo hides every line for you.' },
      { at: 45.2, text: 'Remove any part you do not want hidden, like the title, with the bin button.' },
      { at: 47.8, text: 'Click Save all. Each photo is now a flashcard in your deck.' },
    ],
  },
  {
    id: '02-text-cards',
    title: 'Write text, fill-in-the-blank and formula cards',
    summary: 'Type a question and its answer, turn words into blanks, and add math formulas.',
    color: 'green',
    duration: 47,
    action: { label: 'Write a text card', to: '/note/new' },
    steps: [
      { at: 2.6, text: 'Open the arrow next to Add photos to see every way to add cards. Pick Text card.' },
      { at: 7.5, text: 'Type the question on the front and the answer on the back.' },
      { at: 13.9, text: 'Click Save and add another to keep going.' },
      { at: 16, text: 'For a fill-in-the-blank card, switch the type to Fill the blank and type a sentence.' },
      { at: 21.8, text: 'Select the word to hide, then click Make blank (or press Ctrl+Shift+C).' },
      { at: 27.6, text: 'Add math with the formula button, or type it between dollar signs.' },
      { at: 37.4, text: 'Click the eye button to preview the card before you save it.' },
      { at: 42.7, text: 'Click Save card. Your new cards are added to the deck.' },
    ],
  },
  {
    id: '03-study',
    title: 'Study with smart review',
    summary: 'Show the answer, rate how well you knew it, and the app decides when you see the card again.',
    color: 'red',
    duration: 42,
    action: { label: 'Go to my decks', to: '/' },
    steps: [
      { at: 2.4, text: 'Home shows how many cards are ready for you today.' },
      { at: 4.3, text: 'Open a deck, then click Study.' },
      { at: 8.9, text: 'On photo cards, tap a box to peek at one answer.' },
      { at: 13.4, text: 'Click Show answer or press Space to reveal every answer at once.' },
      { at: 15.7, text: 'Rate how well you knew it. Again brings the card back soon, Easy sends it far ahead.' },
      { at: 19.6, text: 'Keyboard works too: Space to show, then 1, 2, 3 or 4 to rate.' },
      { at: 25.5, text: 'Stop whenever you like. Your place is saved, and the app plans each next review.' },
      { at: 28.4, text: 'Click any card in a deck to study just that card. Right-click it to edit.' },
      { at: 36.8, text: 'Progress shows your streak, level and what is coming up.' },
    ],
  },
  {
    id: '04-practice',
    title: 'Practice with Learn, Match and Gravity',
    summary: 'Quizzes and games for extra practice. They do not change your review schedule.',
    color: 'purple',
    duration: 60,
    action: { label: 'Go to my decks', to: '/' },
    steps: [
      { at: 2.6, text: 'Click the arrow next to Study to pick a practice mode. Practice does not change your schedule.' },
      { at: 7.8, text: 'Learn starts with multiple choice, then asks you to type the answers you know.' },
      { at: 16.3, text: 'Match: click a question, then its answer. Clear the board as fast as you can.' },
      { at: 37.9, text: 'Gravity: type the answer and press Enter before the card hits the ground.' },
    ],
  },
  {
    id: '05-decks',
    title: 'Organize decks and plan for an exam',
    summary: 'Give decks colors, set an exam date, and print your cards.',
    color: 'orange',
    duration: 41,
    action: { label: 'Go to my decks', to: '/' },
    steps: [
      { at: 2.6, text: 'Right-click a deck (or use its ... button) for quick actions. Color gives it its own color.' },
      { at: 8.7, text: 'Rename or move a deck, or put it inside another deck, from the same menu.' },
      { at: 15.5, text: 'Open the deck, then Deck settings. Set your exam date and the planner works out a daily target.' },
      { at: 28.6, text: 'The exam countdown shows on the deck and on Home, with how ready you are.' },
      { at: 30.6, text: 'Print your cards or save them as a PDF from the deck menu.' },
    ],
  },
  {
    id: '06-drive',
    title: 'Save to Google Drive and change settings',
    summary: 'Sign in to keep your cards in your own Google Drive, then switch language, theme and timer.',
    color: 'teal',
    duration: 43,
    action: { label: 'Open settings', to: '/settings' },
    steps: [
      { at: 2.6, text: 'Click Save to Google Drive (or Sign in at the top) to keep your cards safe.' },
      { at: 4.2, text: 'Google opens a window. Choose your account and click Allow.' },
      { at: 6.4, text: 'If you made cards as a guest, add them to your account.' },
      { at: 10.4, text: 'Your cards now save to a Flashcard Pro folder in your own Google Drive. Sign in on any device to carry on.' },
      { at: 13.6, text: 'Switch the language to Hindi, or pick a light or dark theme, from this menu.' },
      { at: 26.1, text: 'The focus timer helps you study in 25 minute blocks with short breaks.' },
      { at: 30.7, text: 'Settings has study options, read-aloud voices, daily reminders and backups.' },
    ],
  },
];

export const tutorialVideo = (id: string) => `./tutorial/${id}.mp4`;
export const tutorialPoster = (id: string) => `./tutorial/${id}.jpg`;

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
