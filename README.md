# Daily Bible Verse - Admin dashboard

A static, responsive web app (plain HTML/CSS/JavaScript + the official Supabase JS client) for managing
verses, saints, Saint of the Day assignments and translations. No build step.

> **This is a NEW dashboard for the NEW app's NEW Supabase project.** It is unrelated to the existing site
> `https://ashwithfrank.github.io/daily-bible-verse/` and its `/admin` route. Do not deploy over that repo,
> and do not assume the old URL is this dashboard's URL.

## Run locally
1. Finish `supabase/README.md` (migrations, first admin, signups disabled).
2. `cp config.example.js config.js` and fill in your **new** project's URL and **public anon key**.
   The dashboard refuses to start if the key looks like a `service_role` / secret key.
3. Serve the folder (browsers block some features from `file://`):
   `cd admin && python -m http.server 8080` (Windows: `py -m http.server 8080`) and open http://localhost:8080
4. Sign in with the administrator account you created in Supabase.

## Deploy as a static site (its own repository / site)
Any static host works (Cloudflare Pages, Netlify, GitHub Pages in a **new** repository).
- Publish the contents of `admin/` as the site root.
- `config.js` is git-ignored in this project. For a dedicated admin repo, either remove `admin/config.js`
  from `.gitignore` and commit it (it contains only the public URL + anon key, which are safe **because RLS is
  on**), or let your host generate it at deploy time.
- In Supabase **Authentication -> URL Configuration**, set Site URL to the new dashboard URL.
- The page ships a strict Content-Security-Policy (`index.html`): scripts only from its own files, network only
  to `*.supabase.co`. Add your domain to `connect-src` if you use a Supabase custom domain.

## Security model (what is and is not protected)
- **Authorization is enforced by the database** (Row Level Security + `admin_users`), not by this UI. Hiding
  buttons is cosmetic. An ordinary signed-in user who opens this page can read nothing extra and write nothing.
- After login the UI asks the database `is_admin()` and signs non-admins straight out.
- No password or key is hard-coded. Sign-in errors are generic (they don't reveal whether an email exists).
- All database text is inserted as text (never HTML), so content cannot inject script into the dashboard.
- Saves are reported as successful **only** when the database returns the saved row; blocked or failed writes
  show an error and leave the form open. Deletes need confirmation and are reported only if a row was removed.
- Recommended in the Supabase dashboard: turn **off** public sign-ups, use a strong unique password, and enable
  MFA for your account (this UI has no MFA enrolment screen).

## Features
Verses (create/edit/delete, display date, translation, reflection, publish/unpublish, search + filters,
sample-translation publish warning) - Saints (all biography fields, feast day, alternate names, sources, image
link + credit + licence, Draft/Published, search + filters, preview) - Saint of the Day (explicit assignment,
replace/remove, "what will the app show on this date?" preview using the documented rule) - Translations.

## Not included (by design or time)
- Optional "Daily Inspiration" module: skipped so it could not delay the core features.
- Image upload (you enter an https link and its credit/licence), MFA enrolment UI, bulk import.
- Lists load everything at once (fine for thousands of rows; add paging if you grow far beyond that).

## Tests
`cd admin && npm install && npm test` runs 39 tests (validation, save/error handling, config safety, and an
end-to-end smoke test in jsdom against a fake Supabase). The smoke test is **not** a real browser and **not** a
real Supabase project; do the manual checks in the root README before relying on it.

## Vendored library
`vendor/supabase.js` is the official `@supabase/supabase-js` 2.118.0 browser bundle (MIT, licence file beside it),
vendored so the dashboard has no third-party script at runtime. To update: `npm i @supabase/supabase-js` and copy
`node_modules/@supabase/supabase-js/dist/umd/supabase.js`.
