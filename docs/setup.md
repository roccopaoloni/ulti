# Setting up ULTI's hosted services

The steps only the project owner can do: creating accounts, choosing names and handing keys to the pipeline. Everything here is free. [ADR 0006](./adr/0006-test-phase-runs-on-free-tiers.md) explains why these services and not others.

Steps 0–7 are ticket #2 and come before any code; close that issue when they're done, which lets the walking skeleton (#3) start. Step 8 comes after #3 ships, step 9 with sign-up (#4), step 10 after Groups (#20), step 11 after offline logging (#5), and step 15 with the captcha (#91).

Dashboards change their menus from time to time. If a menu named here has moved, search the dashboard for the setting's name.

## What you'll collect

| Value | Where it comes from | Where it goes | Public or secret |
|---|---|---|---|
| Project URL | Supabase | Vercel, `.env` | Public |
| Publishable key (`sb_publishable_…`) | Supabase | Vercel, `.env` | Public |
| Project ref | Supabase | GitHub secret | Not sensitive, kept with the secrets |
| Database password | Supabase | Password manager, GitHub secret | **Secret** |
| Personal access token | Supabase | GitHub secret | **Secret** |
| Gmail App Password | Google | Supabase SMTP settings | **Secret** |

The public values are designed to sit in the browser, so sharing them is fine, including with Claude. Keep the secrets out of chats (Claude included), out of screenshots and out of any file in the repo.

## 0. Make the repository public

Public repositories get unlimited GitHub Actions minutes, and CI is where the server tests run.

Everything in the git history becomes visible, so look over what's committed first: right now that's the docs, the glossary, the prototype and `CLAUDE.md`.

1. On GitHub, open the repository → **Settings** → **General**, and scroll to **Danger Zone**.
2. **Change visibility** → **Public**, and confirm.

- [ ] The repository page shows "Public"

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) (signing in with GitHub is fine).
2. **New project**:
   - Name: `ulti`
   - Database password: press **Generate a password**, then save it in your password manager *before* moving on. You'll need it in step 6, and Supabase won't show it again.
   - Region: **South America (São Paulo)**, the closest to Argentina
   - Plan: **Free**
3. Wait until the project finishes setting up (a minute or two).
4. Copy these into your notes:
   - **Project URL**: shown under the **Connect** button or in **Project Settings → Data API**. It looks like `https://abcdefghijklmnop.supabase.co`.
   - **Project ref**: the `abcdefghijklmnop` part of that URL.
   - **Publishable key**: **Project Settings → API Keys**, the key starting with `sb_publishable_`. Leave the secret key alone; nothing in this guide needs it.
5. Create a personal access token so GitHub Actions can deploy: open [Access Tokens](https://supabase.com/dashboard/account/tokens) → **Generate new token**, name it `github-actions-ulti`, and scope it to only what CI needs:
   - Projects: only `ulti`
   - **Project Settings**: Read, **API Keys**: Read, **API Key Secrets**: Read (these three let `supabase link` connect)
   - **Connection Pooling**: Read (migrations are applied with the database password, but GitHub's runners have no IPv6 and the database's direct address is IPv6-only, so `supabase db push` reads the address of the IPv4 connection pooler instead)
   - **Edge Functions**: Read-write (to deploy functions)
   - Nothing else.

   A scoped token starts with `sbp_fc`. Avoid one with a **Legacy** badge: that's full account access, reaching every project you'll ever have. Copy the token and keep the tab open until step 6, because it's only shown once.

- [ ] Project URL, project ref and publishable key are noted
- [ ] The database password and access token are saved somewhere safe

## 2. Create the Gmail account that sends the codes

The sign-up and password-reset codes are emailed from this account. Using a fresh account keeps your personal address out of it.

1. Create a new Google account, for example `ulti.codigos@gmail.com` (any free name works).
2. In that account, turn on **2-Step Verification**: [myaccount.google.com](https://myaccount.google.com) → **Security**. Google only offers App Passwords once it's on.
3. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create an App Password named `Supabase`, and copy the 16-character password. It's shown once, and the spaces don't matter.

- [ ] The Gmail account exists, with 2-Step Verification on and an App Password copied

## 3. Connect Gmail to Supabase

1. In the Supabase project: **Authentication → Emails → SMTP Settings**, and turn on **Enable custom SMTP**.
2. Fill in:
   - Sender email: the Gmail address from step 2
   - Sender name: `ULTI`
   - Host: `smtp.gmail.com`
   - Port: `587`
   - Username: the full Gmail address
   - Password: the App Password from step 2
3. Save.
4. Test it: **Authentication → Users → Add user → Send invitation**, to your personal email address. Check that the email arrives (look in spam too) and that it comes from the ULTI Gmail account. Then delete that user.

Supabase limits how many auth emails go out per hour (**Authentication → Rate Limits**). The default is enough for a test group; raise it if a lot of friends sign up at once.

- [ ] The test invitation reached your personal inbox from the ULTI address

## 4. Create the Vercel project

1. Sign up at [vercel.com](https://vercel.com) with GitHub, on the free **Hobby** plan.
2. **Add New… → Project**, then import `roccopaoloni/ulti`. Give Vercel access to the repository if it asks.
3. **Project Name**: choose it with care, because it becomes the app's address (`ulti-app` gives `ulti-app.vercel.app` if nobody has it). Installed apps and invite links are tied to that address, and changing it later means everyone reinstalls.
4. Leave the framework, root directory and build settings at their defaults. The walking skeleton (#3) adds a file to the repo that tells Vercel how to build.
5. Under **Environment Variables**, add both, for all environments:
   - `VITE_SUPABASE_URL` = the project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable key
6. **Deploy**. Until #3 ships there's no app yet, so whatever this first deployment shows doesn't matter.
7. Check the address under the project's **Settings → Domains**. If Vercel added a suffix because the name was taken, add the `*.vercel.app` name you want there instead. Share only that one address from now on.

From now on Vercel deploys `main` on every push, and builds a preview for every PR. Previews use the same Supabase project.

- [ ] The project exists with both environment variables, and its final `*.vercel.app` address is chosen

## 5. Point Supabase at the app

1. In Supabase: **Authentication → URL Configuration**.
2. Set **Site URL** to the app's address from step 4, for example `https://ulti-app.vercel.app`.

- [ ] Site URL is the Vercel address

## 6. Give GitHub Actions the deploy secrets

1. On GitHub: the repository → **Settings → Secrets and variables → Actions → New repository secret**.
2. Add three secrets, using exactly these names:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the personal access token from step 1 |
| `SUPABASE_DB_PASSWORD` | the database password from step 1 |
| `SUPABASE_PROJECT_ID` | the project ref from step 1 |

If you prefer the terminal, `gh secret set SUPABASE_ACCESS_TOKEN` (and the same for the other two), run in your own terminal, prompts for the value without showing it.

- [ ] All three secrets are listed under Actions secrets

## 7. Create `.env` on this computer

This lets the app run on this computer once #3 exists. Create a file named `.env` at the root of the repository with:

```
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Both values are public, so no harm is done if the file leaks; #3 still keeps it out of git. With no Supabase running on this computer, the app here talks to the hosted project: the same database and Gmail sender your friends use.

- [ ] `.env` exists with both values

**Steps 0–7 done:** close #2. That unblocks #3.

## 8. After the walking skeleton ships: uptime monitoring

Supabase pauses free projects after about a week without activity. The `health` endpoint added in #3 runs a small database query, and pinging it every 5 minutes keeps the project active. It also emails you if the backend goes down.

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free plan).
2. **New monitor**:
   - Type: **HTTP(s)**
   - URL: `https://<project-ref>.supabase.co/functions/v1/health`
   - Interval: **5 minutes**
   - Alert contact: your email
3. Add a second monitor the same way for the app itself: `https://<your-app>.vercel.app`.

- [ ] Both monitors show "Up"

## 9. With sign-up (#4): turn on the 6-digit codes

New users verify their email, and anyone who forgot their password resets it, by typing a 6-digit code from an email into the app. The local stack gets these settings from `supabase/config.toml`, but the hosted project's auth settings can only be changed in the dashboard: GitHub Actions' token deliberately can't change them. Do this step before #4's PR is merged (nothing signs up before #4, so doing it early changes nothing), and again whenever either template file changes.

1. In the Supabase project: **Authentication → Sign In / Providers → Email**, set:
   - **Confirm email**: on
   - **Email OTP Length**: `6`
   - **Email OTP Expiration**: `3600` seconds (the emails say the code expires in an hour)
   - **Minimum password length**: `8` (the app says "At least 8 characters")

   and save.
2. **Authentication → Emails → Templates**. Open **Confirm sign up** and set:
   - **Subject**:

     ```
     {{ if eq .Data.language "es" }}{{ .Token }} es tu código de ULTI{{ else }}{{ .Token }} is your ULTI code{{ end }}
     ```

   - **Body** (the **Source** tab): the whole of [`supabase/templates/confirmation.html`](../supabase/templates/confirmation.html), pasted as it is.

   Save, then open **Reset password** and set:
   - **Subject**:

     ```
     {{ if eq .Data.language "es" }}{{ .Token }} es tu código para recuperar tu cuenta de ULTI{{ else }}{{ .Token }} is your ULTI password reset code{{ end }}
     ```

   - **Body**: the whole of [`supabase/templates/recovery.html`](../supabase/templates/recovery.html).

   Save. Each email is in the language the app was in when the user signed up.
3. Once #4 is merged, open the app, create an account with your personal email and check that the email shows a 6-digit code and no link, and that typing the code in signs you in. Then sign out from **Profile**, choose **Forgot your password?**, and check the reset code the same way.

- [ ] Confirm email is on, with 6-digit codes that last 3600 seconds and passwords of at least 8 characters
- [ ] Both templates are pasted, subjects included
- [ ] A test sign-up and a password reset worked with codes

## 10. After Groups (#20) ships: check an invite on a phone

Nothing needs setting up: the deploy job applies the Groups migration. What CI can't check is how a real phone opens an invite link, because iPhones open links in Safari, never in the installed app.

1. In the installed app, open **Groups → Create a Group**, then **Invite**, and send the link to a second account (another email of yours) over WhatsApp.
2. On a phone where that second account isn't signed in, tap the link. Safari should open ULTI's welcome screen with a "You're invited" card.
3. Sign in there, pick a name and colour, and check that the Group opens with both of you in it.
4. Open the installed app on that phone and sign in with the second account: the Group should be there too.
5. Back on the first account, **Invite → Reset link**, and check that the old link now says it no longer works.

- [ ] An invite opened in Safari before signing in joined the Group once signed in, and the installed app shows it
- [ ] A reset link stops working

## 11. After offline logging (#5) ships: log a Session in airplane mode

Nothing needs setting up. The deploy job applies the migrations, which add the 14 Benchmark Lifts and schedule the retry job, writes the functions' address into the project's Vault for that job (built from the `SUPABASE_PROJECT_ID` secret), and deploys the `sync` and `recompute` functions. What CI can't check is a real phone with no signal.

1. Open the installed app once with a signal, signed in, so it keeps a copy of the Exercises.
2. Turn on airplane mode. **Start session**, add an Exercise, log two Sets, and close the app completely.
3. Reopen it, still in airplane mode: the Session should be back on screen with both Sets. **Finish** it.
4. Turn airplane mode off and open the app. In Supabase, **Table Editor → sessions** and **sets** should show the Session and its Sets, with your time zone and the local date.
5. **Integrations → Cron → Jobs** should list `recompute-dirty-users`, active, every 5 minutes. **Integrations → Vault → Secrets** should list `functions_url`, set to `https://<project-ref>.supabase.co/functions/v1`. If it's missing, the deploy couldn't write it: add it there by hand with that name and value.

- [ ] A Session logged in airplane mode survived closing the app and reached the database once back online
- [ ] The retry job is active and `functions_url` is in Vault

## 12. After Session history (#8) ships: fix a Set in airplane mode

Nothing needs setting up. The deploy job applies the migration that adds `deleted` to `sets`.

1. With a signal, finish a Session with at least two Sets, then turn on airplane mode.
2. **Train** lists the Session at the top. Open it, edit one Set's weight and delete the other.
3. Turn airplane mode off and open the app. In Supabase, **Table Editor → sets** should show the edited weight on one row and `deleted` true on the other.

- [ ] An edit and a delete made in airplane mode reached the database once back online

## 13. After Period finalization (#27) ships: check the finalizer and see a crown

Nothing needs setting up. The deploy job applies the migration that creates `period_results` and schedules the finalizer inside the database (no Edge Function, no secret). What CI can't check is the crown moment on a real phone.

1. **Integrations → Cron → Jobs** should list `finalize-periods`, active, every 5 minutes.
2. With two accounts in a Group, train with one of them during a week, then wait for that week to end everywhere (Monday afternoon UTC at the latest). Don't call `private.finalize_periods` with a future date to speed this up: it would freeze every real Group's current week early, for good.
3. Open the app signed in as the trainee. A gold full-screen moment should say you won the week. Tap once to open it, tap again to skip ahead, then **Continue**. Reopen the app: it should not come back. Check the same on another phone or browser: it should not come back there either.
4. **Table Editor → period_results** keeps one row per member per frozen Period.

- [ ] The finalizer job is active
- [ ] The crown moment showed once on the next open, and the sound played (silent switch off)

## 14. After Season finalization (#28) ships: check the Season freeze and the Past Seasons stamps

Nothing needs setting up. The deploy job applies the migration that creates `season_results` and makes the existing `finalize-periods` job freeze Seasons too. Nobody on the hosted project had Points before Q4 2026, so the first real freeze is Q4 2026, 72 hours after it ends: around 4 January 2027. Until then there is nothing to see. Don't call `private.finalize_seasons` with a future date to see it sooner: it would freeze every real user's running Season for good.

1. **Integrations → Cron → Jobs** should still list `finalize-periods`, active, every 5 minutes (it now runs both finalizers).
2. From 4 January 2027, **Table Editor → season_results** should hold one row per user who had Points in Q4 2026, with the Rank they finished in and `next_starting_points`.
3. Open the app signed in as one of them, on **Profile**. The Rank card should show the Q1 2027 Rank starting at the bottom of the Tier below the Q4 finish (Bronze and Silver finishers start at Bronze V), and a **Past Seasons** row with a Q4 2026 badge. Expect a Rank-up moment for anyone whose starting points lift them above the Rank they last saw. Turn on airplane mode and reopen: the Rank should not drop to Bronze.

- [ ] The Q4 2026 results are in `season_results` and the Past Seasons stamp shows on Profile
- [ ] No drop to Bronze when reopening offline

## 15. With the captcha (#91): turn on bot protection

Sign-up, sign-in and "forgot password" are protected by Cloudflare Turnstile (free, usually invisible). The app shows the widget when it has a site key; Supabase checks the token with the secret key. Do the three parts in this order. If you turn Supabase's protection on before the app has the site key, nobody can sign in.

1. Create the Turnstile site: sign up at [cloudflare.com](https://dash.cloudflare.com/sign-up) (free), then **Turnstile → Add widget**:
   - Widget name: `ULTI`
   - Hostnames: the production address from step 4 (`ulti-app.vercel.app`), `localhost` for development, and any Vercel preview hostname you want to test on (a preview's address is `*.vercel.app`; add each one you use)
   - Widget mode: **Managed**
   - Pre-clearance: no

   Create it, then copy the **Site key** (public) and the **Secret key** (**secret**: it only goes to Supabase).
2. Give the app the site key: in Vercel, **Settings → Environment Variables**, add `VITE_TURNSTILE_SITE_KEY` = the site key, for all environments, and redeploy `main` (**Deployments → ⋯ → Redeploy**). To try it on this computer, add the same line to `.env`.
3. Turn it on in Supabase: **Authentication → Attack Protection** (or **Bot and Abuse Protection**), turn on **Enable Captcha protection**, choose **Turnstile**, paste the secret key and save.
4. Open the app, once on the deployed address and once on a phone: **Create account**, **Sign in** and **Forgot your password?** should each work, usually without a visible challenge, and a sign-in with a never-verified account should send its fresh code.

The local stack and CI keep captcha off (`supabase/config.toml`), so the integration tests are unaffected.

- [ ] The Turnstile widget exists with the production and local hostnames
- [ ] `VITE_TURNSTILE_SITE_KEY` is in Vercel and `main` was redeployed
- [ ] Supabase's captcha protection is on with the Turnstile secret key
- [ ] Sign-up, sign-in and password reset all worked on the deployed app

## Later: moving to a real domain

When the test proves ULTI is worth it, buy a domain (about US$10–15 a year) and:

1. Sign up for [Resend](https://resend.com) (3,000 emails a month free), verify the domain by adding the DNS records it gives you, and replace the values in Supabase's SMTP settings with Resend's.
2. Add the domain to the Vercel project, and update Supabase's Site URL to match.
3. Before switching, ask everyone to open the app once while online, so nothing is left waiting to sync. After the switch, everyone reinstalls from the new address, and old invite links stop working.
