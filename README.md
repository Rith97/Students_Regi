# Student Registration System

Installable Khmer student-registration Web App for computers and phones. The production build is written to `dist/` and can be deployed to any HTTPS static host.

## Web App build and deployment

1. Run `npm run web:build`.
2. Upload everything inside `dist/` to Cloudflare Pages, GitHub Pages, Netlify, Vercel, or another static host.
3. Open the resulting HTTPS URL on a computer or phone.
4. Use the browser menu and choose **Install app** or **Add to Home Screen** when desired.

The included manifest and service worker make the interface installable and cache the app shell for offline startup. Cloud sync still requires an internet connection.

## Google Sheet sync

Use `google-sheet-backend.gs` as the Apps Script backend:

1. Create a Google Sheet.
2. Open Extensions -> Apps Script.
3. Paste the contents of `google-sheet-backend.gs` into `Code.gs`.
4. Save, then Deploy -> New deployment.
5. Choose type `Web app`.
6. Execute as: `Me`.
7. Who has access: `Anyone`.
8. Copy the Web App URL ending in `/exec`.
9. Recommended: in Apps Script, open Project Settings -> Script Properties and add `STUDENT_APP_ACCESS_KEY` with a private shared password.
10. Open the app, click `Storage`, choose `Google Sheet`, paste the URL and the same shared access key, then Save.
11. Configure every authorized computer with the same URL and access key.

The Web App checks the shared Google Sheet revision every 20 seconds and downloads the full data only when something changed. Individual saves and deletes are protected by an Apps Script lock, and `Backup` merges records instead of replacing the complete shared list. `Delete all` is disabled while shared Google Sheet mode is active.

After updating `google-sheet-backend.gs`, use `Deploy -> Manage deployments -> Edit -> New version -> Deploy`; editing the script without deploying a new version does not update the web app.

## Camera on phones and computers

Camera access in a browser requires the Web App to be served over **HTTPS** (or localhost during development).

1. Open the same Web App URL directly on the phone.
2. Connect the app to the shared Google Sheet or Supabase storage.
3. Open the registration form and tap the Camera button.
4. Take the student photo, complete the form, and save.
5. Other connected devices receive the shared update automatically.

The QR phone-camera bridge below is available only in the optional Windows desktop build and is not required by the Web App.

## Optional desktop phone-camera bridge

1. Connect the Windows computer and phone to the same Wi-Fi network.
2. Open the desktop app and click `ប្រើ Camera ទូរសព្ទ` in the student photo section.
3. If Windows Firewall asks, allow the app on **Private networks**.
4. Scan the displayed QR code with the phone once.
5. Tap `ថតរូបសិស្ស`, take the photo, then tap `ផ្ញើទៅកុំព្យូទ័រ`.
6. Save that student on the desktop, then use `ថតរូបសិស្សបន្ទាប់` on the same phone page. Do not scan the QR code again.
7. Keep the phone page and desktop app open for the complete photo session.

The phone-camera link contains a random token that changes whenever the desktop app restarts. It works only while the desktop app is open; no phone photo is stored by the local bridge after transfer.

## Student card settings

Open `Settings` in the desktop toolbar to configure:

- the card issue date;
- the school principal's name;
- the homeroom teacher assigned to each class found in the current student list.

When Google Sheet storage is configured, these settings are shared through the hidden `_App Settings` sheet. Deploy the latest `google-sheet-backend.gs` as a new Apps Script version before relying on shared settings.

## Supabase sync

Use `supabase-schema.sql` to create the Supabase table:

1. Create a Supabase project.
2. Open SQL Editor.
3. Paste and run `supabase-schema.sql`.
4. Go to Project Settings -> API.
5. Copy `Project URL` and the `anon public` key.
6. Open the app, click `Storage`.
7. Choose `Supabase`, paste the URL and anon key, then Save.
8. Click `Backup` on the computer after import. On the phone, click `Load` or reopen the app.

This static app stores the anon key in the browser. The included policies allow app access from the public anon role for simple deployment. Use authenticated policies before storing sensitive production data.

## Google Sheet design

The latest `google-sheet-backend.gs` formats the Google Sheet automatically when data is backed up:

- `Students`: app-compatible master data with Khmer headers, frozen rows, filters, hidden internal ID/timestamp columns, and styled rows.
- `Dashboard`: summary totals by class, gender, school, phone completeness, and average GPA.
- `By Class`: one grouped list separated by class.
- `Class - <class>`: one auto-created tab for each class.

If you already deployed Apps Script, paste the latest `google-sheet-backend.gs`, then use `Deploy -> Manage deployments -> Edit -> New version -> Deploy`. After that, open the app and click `Backup` to rebuild the designed sheets.

## GitHub Pages setup

1. Create a GitHub repository.
2. Run `npm run web:build`.
3. Upload the contents of `dist/` to the repository root (or publish `dist/` through a Pages workflow).
4. Go to Settings -> Pages.
5. Set Source to `Deploy from a branch`.
6. Select branch `main` and folder `/ (root)`, then Save.

The site will be available at `https://<username>.github.io/<repo-name>/` after Pages finishes publishing.
