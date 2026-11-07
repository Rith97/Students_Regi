# Student Registration API (Neon)

The backend for the admin app (`index.html`) and the teacher portal (`teacher-portal.html`).
It replaces the Google Sheet / Apps Script backend with:

- **Lakebase Postgres** on Neon for students, settings and the portal tabs (`schema.sql`)
- a **private Object Storage bucket** (`student-photos`) for student photos
- one **Neon Function** (`studentsapi`, `src/index.ts`)

Project `students-registration` (`noisy-wildflower-66339168`) in `aws-ap-southeast-1` (Singapore).

| Branch | Function URL | Use |
| --- | --- | --- |
| `main` | `https://br-morning-glade-aoy0pbd4-studentsapi.compute.c-2.ap-southeast-1.aws.neon.tech/` | Production — the app and portal call this |
| `dev` | `https://br-divine-voice-aoe92ebt-studentsapi.compute.c-2.ap-southeast-1.aws.neon.tech/` | Testing; holds sample data only |

## How it fits the app

`GET /` and `POST /` speak exactly the protocol of the former Apps Script web app
(`?action=listpage|photos|studentstatus|…`, JSONP `callback`, `text/plain` JSON POSTs with
`accessKey`), so the app's offline queue and sync confirmations work unchanged.
`POST /portal/rpc` takes `{ name, args }` with the former `google.script.run` function names.

The logic is a port of `google-sheet-backend.gs` and `teacher-portal.gs`: same merge rules,
duplicate-name protection, student-code allocation (`902` + cohort + grade + sequence) and
salted SHA-256 teacher codes, so codes issued by the Apps Script portal keep working.
`test/parity.test.ts` runs the original Apps Script functions next to the port to prove it.

Access: the admin API needs the portal's admin code (or the `STUDENT_APP_ACCESS_KEY`
Function secret if no admin code exists). A deployment with neither is closed. Failed
attempts are throttled per IP; teacher logins per class, as before.

## Develop

```bash
cd api
npm install
neon checkout dev          # pulls DATABASE_URL, AWS_* … into .env.local (git-ignored)
neon dev --source src/index.ts --port 8787 --env .env.local
npm run typecheck
npm test                   # parity with the Apps Script code
```

End-to-end check against a deployed **non-production** branch (creates and deletes test data):

```bash
node --env-file=.env.local --experimental-strip-types scripts/smoke.ts
```

Deploy schema changes and the Function to a branch:

```bash
node --env-file=.env.local --experimental-strip-types scripts/apply-schema.ts
neon deploy --env .env.local
```

## Moving the live data from the Google Sheet (cutover)

1. Deploy the updated `google-sheet-backend.gs` to the **existing** Apps Script deployment
   (Deploy → Manage deployments → Edit → New version). It only adds a read-only,
   admin-only `exportportal` action.
2. Ask staff to stop registering students until step 5 is done.
3. Pull the `main` branch environment and rehearse without writing:

   ```bash
   cd api
   neon checkout main
   SHEET_KEY=<the admin access key the app uses> node --env-file=.env.local --experimental-strip-types scripts/migrate-from-sheet.ts --dry-run
   ```

4. Run it for real (same command without `--dry-run`). It uploads photos to the private
   bucket, writes students in Sheet order, settings, teacher codes, attendance, scores and
   activities in one transaction, then verifies the counts. It refuses a non-empty target
   unless `--force` is given. If the Sheet had no portal admin code, the access key you
   supplied becomes the admin code, so devices keep using the key they already have.
5. Publish the frontend (merge to `main` → Netlify). The app and the portal then use Neon.
6. `neon checkout dev` to return to the test branch.

The Google Sheet is left untouched and can be kept as a read-only backup.
