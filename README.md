# Vahana Motors – Showroom App

A mobile web app (installable PWA) for a second-hand car business:

- **Showroom for buyers**: car list with search and filters, a page per car, WhatsApp / Call / Share
- **Private Best Offer**: buyers send private offers; only the owner sees amounts
- **Owner area**: dashboard, cost sheet per car with daily interest and no-loss price, ageing alerts, ranked offers, add/edit car with photos, CSV backup

No build tools: plain HTML, CSS and JavaScript. Backend: Supabase (database, login, photo storage). Hosting: GitHub Pages.

## Try it now (demo mode)

With `supabaseUrl` empty in `config.js`, the app runs in **demo mode**: sample cars, saved only in that browser.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Owner area: `#/owner`, any email, any 6-digit code.

## Go live (about 20 minutes)

### 1. Supabase
1. Create a free account at https://supabase.com and a **New project** (region: Mumbai).
2. **SQL Editor → New query**: paste all of `supabase/schema.sql` and press **Run**.
3. **Authentication → Sign In / Providers → Email**: keep it enabled.
4. **Authentication → Emails → Magic Link** template: make sure the email shows the code with `{{ .Token }}` (the app logs in with the 6-digit code).
5. **Authentication → URL Configuration**: set **Site URL** to your GitHub Pages address (step 3).
6. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `config.js`.

### 2. Business details
Edit `config.js`: business name, tagline, WhatsApp number (`91` + 10 digits), phone.

### 3. GitHub Pages
1. Push this folder to a GitHub repository.
2. **Settings → Pages → Deploy from a branch → `main` / root**.
3. The app is live at `https://<username>.github.io/<repo>/`.

### 4. Make your father the owner
1. On his phone, open the app, go to **Owner login** and log in once with his email.
2. In Supabase **SQL Editor**, run (with his email):
   ```sql
   insert into public.owners (user_id)
   select id from auth.users where email = 'father@example.com';
   ```
3. Reopen the app: the owner dashboard opens.
4. Turn on **2-step verification** on that email account. It is the key to the owner area.

### 5. Install on his phone
Open the link in Chrome → menu → **Add to Home screen**.

## Security
All protection lives in the database (Row Level Security), not in the app:

| Who | Can | Cannot |
|---|---|---|
| Buyer (not logged in) | See showroom cars, send one offer per number per car, see "N interested" | See costs, loans, profits, any offer, edit anything, upload photos |
| Logged in, not owner | Same as buyer | Same as buyer, cannot make themselves owner |
| Owner | Everything | — |

Extra protection: buyers can send at most 5 offers per car per hour (30 per 10 minutes across the showroom),
the database always sets an offer's date and status itself, and the public "people interested" count only
includes offers the owner has confirmed by phone, so it cannot be faked.

Tests (all pass on PostgreSQL 16): `supabase/tests/security-tests.sql` (24 checks) and
`supabase/tests/negative-tests.sql` (18 checks).

## Moving to Cloudflare Pages (free, business use allowed)
1. Create a free account at https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick this repository. Build command: *none*. Output directory: `/`.
3. Your site is live at `https://<project>.pages.dev`. Every push to `main` updates it.
4. In `config.js` set `prettyLinks: true`. Shared car links become `/car/<name>` and show the car's
   photo, name and price in WhatsApp (handled by `functions/car/[slug].js`).
5. Optional: add a Cloudflare Web Analytics token as `cfAnalyticsToken` for free, cookie-free visitor stats.

## Upgrading the database
`supabase/schema.sql` is safe to run again: it adds new columns, rules and limits without touching data.

## Updating the app
After changing any file, bump `VERSION` in `sw.js` (e.g. `km-v2`) so installed phones load the new version.

## Files
```
index.html            app shell
styles.css            all styles
config.js             business details + Supabase keys (edit this)
js/app.js             screens and navigation
js/store.js           data: demo mode and Supabase
js/calc.js            cost, interest and no-loss price maths
js/ui.js              icons, placeholder car drawings, photo compression
sw.js, manifest.webmanifest, icons/   installable app support
functions/car/[slug].js  WhatsApp link previews on Cloudflare Pages
brand/                logo files (SVG for print, PNG)
supabase/schema.sql   database tables and security rules
supabase/tests/       security tests
```
