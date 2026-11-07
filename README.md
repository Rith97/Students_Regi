# Student Registration System

Installable Khmer student-registration Web App for computers and phones. The production build is written to `dist/` and can be deployed to any HTTPS static host.

## Web App build and deployment

1. Run `npm run web:build`.
2. Upload everything inside `dist/` to Cloudflare Pages, GitHub Pages, Netlify, Vercel, or another static host.
3. Open the resulting HTTPS URL on a computer or phone.
4. Use the browser menu and choose **Install app** or **Add to Home Screen** when desired.

The production Netlify site is `https://soanpreymelong.netlify.app/`. It is connected to the `main` branch of `putherith/Students_Regi` for future frontend builds. When publishing a version directly from a local branch, deploy the static app to that same Netlify site and verify the version shown on the public URL. Changes to `google-sheet-backend.gs` also require a new version of the existing Apps Script deployment; publishing the frontend alone does not update the Sheet backend.

The included manifest and service worker make the interface installable and cache the app shell for offline startup. Cloud sync still requires an internet connection.

## Database: Neon (since v2.3.0)

The app and the teacher portal now store data in Neon (Lakebase Postgres, a private photo bucket and one API Function in Singapore). See [api/README.md](api/README.md) for the API, local development, and the one-time move of live data from the Google Sheet. The teacher portal is served next to the app as `teacher-portal.html` instead of from Apps Script.

The Google Sheet section below describes the previous backend. Keep it only as a read-only backup after the move.

## Google Sheet sync (previous backend)

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

The Web App checks the shared Google Sheet revision every 20 seconds and downloads records in small pages only when something changed. A lightweight identity request checks for duplicate students without downloading every photo. Individual saves and deletes are protected by an Apps Script lock, and `Backup` merges records instead of replacing the complete shared list. `Delete all` is disabled while shared Google Sheet mode is active.

Student IDs are assigned by Apps Script inside the write lock: school code `902`, cohort year, two-digit grade, then a three-digit sequence (for example `9022607001`). Set the academic-year start in school settings before registering a new cohort. If a student is entered directly in the master `Students` tab, the script assigns an ID after both the name and class (grade 7–12) are present; the app's next load also fills any missing IDs. Phones may show a provisional ID while offline, but the Sheet-assigned ID is authoritative after sync. The `Students` grid is provisioned for 3,000 students and the backend adds rows to the student and class-view sheets when needed. Browser text snapshots and photos use IndexedDB so a large roster does not depend on localStorage capacity; pending photo uploads are kept by record ID until confirmed by the Sheet.

After updating `google-sheet-backend.gs`, use `Deploy -> Manage deployments -> Edit -> New version -> Deploy`; editing the script without deploying a new version does not update the web app.

### Restore missing photos

Before clicking **Backup** or rebuilding the Sheet, deploy the latest `google-sheet-backend.gs` as a new version of the **existing** Web App deployment. Then open the updated app on a computer or phone that previously displayed the missing photos and click **ស្ដាររូបថត**. The recovery fills only blank photo cells in `Students`, using that device's photo cache and any surviving photos in `By Class` or `Class - ...` tabs. It never replaces an existing photo. Check the reported remaining count afterward, and repeat on other previously used devices if needed. Do not clear browser site data or rebuild the class tabs before recovery.

If a photo is absent from all these sources, this recovery cannot recreate it. In that case inspect the master Sheet's version history or a prior backup, or retake the photo. Apps Script is deployed separately from the web frontend; publishing the frontend alone will not activate a new recovery endpoint. Keep Google credentials out of this repository.

## Camera on phones and computers

The **សិស្សតាមថ្នាក់** screen groups the students currently loaded in the app. It is a view only; selecting a class does not create or update any Google Sheet tab or student record. The school-settings dialog scrolls within the viewport, and printed documents/cards include a **ត្រឡប់ទៅ App** button.

The **យកពីឪពុក / យកពីម្តាយ** buttons in the guardian section copy the selected parent's name to the guardian field and their phone number to the contact field. They do not add or change Sheet columns. The card photo frame is sized to its photo rather than extending to the bottom edge of the card.

For either address, select a village in Kaoh Andaet District first. The form fills its commune, district, and Takeo province from the [official Cambodia Geographical List 2025](https://data.mef.gov.kh/datasets/pd_68e370856a965e00074a5e7b). Only the 68 villages in this district appear in the picker. Villages with the same name show their commune so the correct location can be selected. For another district or province, choose **វាយបញ្ចូលដោយផ្ទាល់** in the village picker and type the address fields manually. This changes form entry only; no Google Sheet columns are added. Newly processed ID photos use a 3:4 portrait with the reference sky-blue background and headroom above the student. The card photo slot compensates for the card's non-uniform print scaling so faces are not stretched; old blue-background photos are reframed and recolored only for printing, without changing stored student records.

Portrait framing crops proportionally around the shoulders to avoid blue gaps without stretching or copying pixels at the edges. The card popup waits for photo repair and painting before enabling Print, including on iPhone Safari.

Student card printing uses A4 portrait pages with four 75 × 100 mm cards per sheet. Each front sheet is paired with a back sheet containing four compact sections of the school's rules—attendance and study hours, conduct and uniform, prohibited behavior, and disciplinary measures—set across the full card as separate dashed points with comfortable line spacing. The supplied school emblem appears as a faint watermark. The backs align with their fronts for duplex printing; flip on the long edge.

Camera access in a browser requires the Web App to be served over **HTTPS** (or localhost during development).

To send photos from a phone directly into the form open on a computer:

1. On the computer, open the registration form and click `ប្រើ Camera ទូរសព្ទ`.
2. Scan the displayed QR code once with the phone.
3. On the phone, tap `បើក Camera សម្រាប់បញ្ជាពីកុំព្យូទ័រ` and allow camera access once. Keep that page open.
4. On the computer, click `ថតពីកុំព្យូទ័រ`. The phone captures its current camera frame and sends it directly into the form.
5. Save the student on the computer, reopen the phone-camera dialog, and click `ថតពីកុំព្យូទ័រ` for the next student. The QR code and camera permission do not need to be repeated while the session remains connected.

The phone page also keeps a manual `ជ្រើស/ថតរូបដោយដៃ` fallback in case the browser does not support remote capture.

Both devices need internet access for the initial WebRTC connection. The transferred photo goes directly between the two devices and is not stored by the pairing service. If a restrictive network blocks the connection, try the same Wi-Fi network or a phone hotspot.

The phone can also open the regular Web App directly, connect to the same Google Sheet or Supabase storage, take the student photo, and save the complete record there.

## Optional desktop phone-camera bridge

1. Connect the Windows computer and phone to the same Wi-Fi network.
2. Open the desktop app and click `ប្រើ Camera ទូរសព្ទ` in the student photo section.
3. If Windows Firewall asks, allow the app on **Private networks**.
4. Scan the displayed QR code with the phone once.
5. Tap `ថតរូបសិស្ស`, take the photo, then tap `ផ្ញើទៅកុំព្យូទ័រ`.
6. Save that student on the desktop, then use `ថតរូបសិស្សបន្ទាប់` on the same phone page. Do not scan the QR code again.
7. Keep the phone page and desktop app open for the complete photo session.

The phone-camera link contains a random token that changes whenever the app restarts. It works only while the computer app remains open; no phone photo is stored by the bridge after transfer.

## Card PDF and photo downloads

Click `កាតសិស្ស`, choose one class or all students, then choose Print or PDF. The Windows desktop app saves a two-sided, four-cards-per-A4 PDF directly; in a web browser choose **Save as PDF** in the print dialog. Duplex printing uses **flip on long edge** at 100% / actual size.

Click `ទាញរូបថត` to download one ZIP. Each image keeps the bytes and resolution currently stored, with the student's name as its filename (a number is added when names repeat). Missing photos are reported instead of silently replaced. Existing Google Sheet photos are typically 300 × 400 px because of the cell-size limit; this export does not upscale them or recover originals that were never stored.

## Application number

`លេខពាក្យ` is the final student-data column in the form, student table, print views, Excel template, and CSV import/export. After updating an existing installation:

- Google Sheet: deploy the latest `google-sheet-backend.gs` as a new Apps Script version, then click `Backup` once so the new column is added and formatted.
- Supabase: run the latest `supabase-schema.sql` once to add `application_number` without deleting existing records.

## Parent and guardian birth dates

The form includes optional day/month/year selectors for the father, mother, and guardian. These fields are included in Google Sheet sync, Supabase, Excel/CSV import and export, search, and the printable student form.

After this update, replace the Apps Script code with the latest `google-sheet-backend.gs`, then use `Deploy -> Manage deployments -> Edit -> New version -> Deploy`. Open the app and run `Backup` once to add and format the three new Google Sheet columns. Supabase users should run the latest `supabase-schema.sql` once.

## Sync and phone performance

Version 2.1.1 saves and deletes optimistically while cloud writes run through an ordered background queue. An empty shared store is treated as authoritative, so deleted records no longer return from an old browser cache. Bulk imports use merge-only batch writes, students may share one family telephone number, and incomplete split-name data is repaired from the full name instead of being shortened.

Phone-camera frames are resized before transfer, and low-memory/mobile devices use a fast photo path instead of loading the heavy background-removal model. The service worker uses network-first updates so new fixes replace cached app files promptly.

## Student card settings

The reference card uses a 75 × 100 mm print boundary with a blue border, ministry logo and watermark, two date lines, and the principal signature only. Headings use Khmer Moul and body text uses Khmer OS Siemreap (Siemreap web fallback). Print at 100% / actual size.

Set the principal and ICT telephone numbers in Settings. Each student's father and mother telephone numbers are entered separately in the registration form. The lunar date line can be entered in Settings; when empty it prints as a dotted line. No telephone numbers from the sample artwork are filled into real records automatically.

For shared storage, redeploy the updated Apps Script backend or run the additional columns in the Supabase schema so the new telephone fields also sync. The settings remain available locally before the backend is updated.

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
