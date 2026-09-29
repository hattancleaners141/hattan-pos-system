# Hattan Cleaners — iPhone & Android app

The app screens live on the website at `/app/` (in `Hattan_Ops_Suite_V29.5.3_StateFix_GitHub/app/`).
This folder wraps them as real store apps with Capacitor, so every website update reaches
the phones instantly — no new store submission needed for normal changes.

- Bundle / package ID: `com.hattancleaners.app`
- App name: **Hattan Cleaners**
- Loads: `https://hattan-ops-suite.netlify.app/app/` (change `server.url` in `capacitor.config.json`
  if the app moves to e.g. `app.hattancleaners.com`, then run `npx cap sync`)

## One-time setup on your Mac
1. Install **Xcode** (App Store) and **Android Studio** (developer.android.com/studio).
2. Install Node.js 20+ (nodejs.org).
3. In Terminal: `cd mobile && npm install && npx cap sync`

## iPhone (App Store)
1. `npx cap open ios` → Xcode opens.
2. Select the **App** target → *Signing & Capabilities* → Team: your Apple Developer team.
3. Product → Archive → Distribute App → App Store Connect → Upload.
4. In App Store Connect create the app (name *Hattan Cleaners*, bundle ID above), fill in:
   - Privacy Policy URL: https://hattancleaners.com/privacy.html
   - Support URL: https://hattancleaners.com
   - App Privacy: Contact info (name, email, phone, address), Purchases, Payment info
     (processed by Clover) — linked to the user, not used for tracking.
   - Sign-in info for review: the `APP_REVIEW_EMAIL` / `APP_REVIEW_CODE` set in Netlify.
   - Account deletion: Account → "Delete my app account".

## Android (Google Play)
1. `npx cap open android` → Android Studio opens.
2. Build → Generate Signed App Bundle → create and SAFELY KEEP the upload key.
3. Upload the `.aab` in Play Console → Production (organization accounts) or Closed testing.
4. Fill the Data safety form the same way as Apple's App Privacy.

## Icons & splash
Source images are in `assets/`. Regenerate with `npm run icons` after changing them.
