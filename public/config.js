/*
 * Flashcard Pro site settings.
 *
 * googleClientId: turns on "Sign in with Google" and saving to each person's own Google Drive.
 * googleApiKey:   turns on share links (lets anyone open a deck you shared, without signing in).
 *
 * Both values are public by design (they are visible in any web page that uses them).
 * Protect them by restricting them to your site address in Google Cloud Console.
 * Step-by-step setup: see SETUP.md in this repository, or the Help page in the app.
 */
window.FCP_CONFIG = {
  googleClientId: '219365581483-8ef3so3cgk764paq3ga0grnp3p11rs35.apps.googleusercontent.com',
  googleApiKey: 'AIzaSyCLJw4lGUkSmfela4LQA_oxslNnmzvQRG0',
};
