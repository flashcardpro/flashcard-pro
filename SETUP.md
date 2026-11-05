# Setting up Google sign-in and Drive saving

Flashcard Pro has no server. Each person signs in with Google in their browser, and their cards are saved in their own Drive. To allow that, the site needs a free Google OAuth Client ID. Share links also need an API key.

Both values are public by design (any web page that uses them shows them), so they go in `public/config.js`. You protect them by restricting them to your site address.

Your site address on GitHub Pages: `https://flashcardpro.github.io`

## 1. Create a Google Cloud project

1. Open https://console.cloud.google.com and sign in.
2. Top bar, project picker, **New project**. Name it `Flashcard Pro`, then **Create**.
3. Open **APIs and Services**, **Library**, search **Google Drive API**, click it, **Enable**.

## 2. Set up the consent screen

1. Open **Google Auth Platform** (or **APIs and Services**, **OAuth consent screen**).
2. App name `Flashcard Pro`, your email as support and developer contact. Audience: **External**.
3. **Data access**, **Add or remove scopes**, tick:
   - `.../auth/drive.file` (see, edit, create and delete only the specific Drive files you use with this app)
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
4. While the app is in **Testing**, only the Google accounts you add under **Test users** can sign in (up to 100). To let anyone sign in, click **Publish app**. Because `drive.file` is a non-sensitive scope, Google only asks for basic verification (app name, logo, home page and privacy policy links).

## 3. Create the OAuth Client ID

1. **Clients** (or **Credentials**), **Create client**, type **Web application**.
2. **Authorized JavaScript origins**: add `https://flashcardpro.github.io` and, for local testing, `http://localhost:5173`.
3. Leave redirect URIs empty. **Create**, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).

## 4. Create the API key (for share links)

1. **Credentials**, **Create credentials**, **API key**.
2. **Edit API key**:
   - Application restrictions: **Websites**, add `https://flashcardpro.github.io/*`
   - API restrictions: **Restrict key**, choose **Google Drive API**
3. Save and copy the key.

## 5. Put the values in the site

Edit `public/config.js` on GitHub (pencil icon) and fill in:

```js
window.FCP_CONFIG = {
  googleClientId: 'YOUR-ID.apps.googleusercontent.com',
  googleApiKey: 'YOUR-API-KEY',
};
```

Commit to `main`. GitHub Actions rebuilds the site in about a minute. Open the site, click **Sign in**, and choose your Google account. The Help page in the app shows whether sign-in and share links are on.

## What gets stored where

- In the browser (IndexedDB): your library and photos, so the app opens instantly and keeps working if the internet drops for a while.
- In Google Drive, folder `Flashcard Pro`:
  - `Flashcard Pro library.json`: decks, cards, study history, settings and where you left off
  - `Photos and audio/`: every photo and voice note as a normal file you can open
  - `Shared decks/`: copies you shared by link (each readable by anyone with its link until you stop sharing)
- Nothing is sent anywhere else.

## Troubleshooting

- **"Access blocked: app has not completed verification"**: the app is in Testing and the account is not a test user. Add it under Test users, or publish the app.
- **Popup closes and nothing happens**: allow popups for the site, then try again.
- **"Reconnect Drive" chip**: Google sign-ins last one hour in the browser. Click the chip to continue saving; nothing is lost in between.
- **Share link says "no longer shared"**: the owner clicked Stop sharing, or deleted the file from their Drive.
