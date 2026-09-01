# Zeno Life Care — FREE version

This version does **not** use Cloud Functions and does not require the Firebase Blaze plan.

## Firebase
1. Authentication → Sign-in method → Email/Password → Enable.
2. Firestore Database → Create database.
3. Publish the included `firestore.rules`.
4. Keep the existing admin account/admin custom claim that was already configured.

## Customer accounts
The Admin Panel creates customer Auth accounts using a secondary Firebase app, so the admin stays logged in. Customer Login ID is mapped internally to `<loginId>@zenolife.local`.

## Deploy
For GitHub Pages, upload the web files to a GitHub repository and enable Pages. Add the GitHub Pages domain under Firebase Authentication → Settings → Authorized domains.

Do not upload any service-account JSON/private key to GitHub.
