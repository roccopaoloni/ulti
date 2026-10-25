# Setting up ULTI's hosted services

The steps only the project owner can do: creating accounts, choosing names and handing keys to the pipeline. Everything here is free. [ADR 0006](./adr/0006-test-phase-runs-on-free-tiers.md) explains why these services and not others.

Steps 0–7 are ticket #2 and come before any code; close that issue when they're done, which lets the walking skeleton (#3) start. Step 8 comes after #3 ships.

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
   - **Edge Functions**: Read-write (to deploy functions)
   - Nothing else. Migrations don't need the token, because they use the database password.

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
2. **Add New… → Project**, then import `roccopaoloni/gym-tracker`. Give Vercel access to the repository if it asks.
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

## Later: moving to a real domain

When the test proves ULTI is worth it, buy a domain (about US$10–15 a year) and:

1. Sign up for [Resend](https://resend.com) (3,000 emails a month free), verify the domain by adding the DNS records it gives you, and replace the values in Supabase's SMTP settings with Resend's.
2. Add the domain to the Vercel project, and update Supabase's Site URL to match.
3. Before switching, ask everyone to open the app once while online, so nothing is left waiting to sync. After the switch, everyone reinstalls from the new address, and old invite links stop working.
