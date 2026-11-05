# Flashcard Pro

Photo flashcards that remember for you. Snap a diagram, your notes or a textbook page, hide the parts you want to learn, and study each one right before you would forget it. Everything is saved in your own Google Drive.

**Live site:** https://flashcardpro.github.io/flashcard-pro/

## What it does

**Make cards fast**
- Add any number of photos at once: pick, drag and drop, paste a screenshot (Ctrl+V), or use the phone camera
- Every photo opens straight into the editor, one after another, with "Save all" when you are done
- Photo editor: hide parts with a box, oval or lasso (image occlusion), pen, highlighter, arrows, text, crop, rotate, zoom, undo and redo
- "Read text from photo" (OCR, English and Hindi) finds the words in a photo and hides each word or line for you
- Card types: basic, both ways, fill the blank (cloze, Anki style `{{c1::...}}`), hide parts of photo
- Rich text with highlight colors, lists, images, math formulas (`$E=mc^2$`) and voice notes on either side
- Decks inside decks, tags, five color labels, search, filters, sorting, bulk actions

**Study smarter**
- Smart review with FSRS, the scheduler used in modern Anki (Again / Hard / Good / Easy, or a 1 to 5 confidence scale)
- Practice modes that do not change your schedule: Learn, Write, Test, Match, Gravity, Flip through all
- Exam planner: set an exam date and get the number of new cards to learn per day
- Focus timer (Pomodoro), read-aloud in English and Hindi, keyboard shortcuts for everything
- Streaks, a study heatmap, a two week forecast, XP, levels and 24 badges
- Daily reminder by notification, plus a calendar event that works when the site is closed

**Your data, your Drive**
- Works instantly as a guest (saved in the browser)
- Sign in with Google to save to a "Flashcard Pro" folder in your Drive, using the narrowest Drive permission (`drive.file`: the app only sees files it created)
- Sign in on any device and continue where you left off, down to the card you were on
- Share a deck by link, or send a `.fcpro` file
- Import from Anki (`.apkg`, old and new formats, including image occlusion notes) and Quizlet (copied export text or CSV)
- Print cards or save them as a PDF, two-sided with cut lines
- English and Hindi interface, light and dark theme

## Color coding

| Color | Meaning |
| --- | --- |
| Blue | New, not studied yet |
| Amber | Learning, seen recently |
| Red | Due, ready to review today |
| Teal | Reviewing, coming back in days |
| Purple | Mastered, next review 3 weeks or more away |

Each deck has its own color band, and any card can carry a red, orange, green, blue or purple label.

## Turning on Google Drive saving

The site works without any setup in guest mode. To turn on sign-in and Drive saving, add a Google OAuth Client ID (and an API key for share links) to `public/config.js`. Step by step: [SETUP.md](SETUP.md).

## Development

```bash
npm install
npm run dev      # local site at http://localhost:5173
npm test         # unit tests (scheduling, cards, sync with a mock Drive, Anki import)
npm run build    # production build in dist/
```

Pushing to `main` builds, tests and publishes the site with GitHub Actions (Settings, Pages, Source: GitHub Actions).

Built with React, TypeScript, Vite, ts-fsrs, Konva, TipTap, KaTeX, Radix UI, Tesseract.js and sql.js.
