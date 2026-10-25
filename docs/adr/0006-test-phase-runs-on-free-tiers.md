# The test phase runs on free tiers, with auth email sent through Gmail

Until a test with friends shows ULTI is worth paying for, it runs on free plans: the app on a `*.vercel.app` address (Vercel Hobby, which allows non-commercial use only), the backend on a Supabase Free project in São Paulo, and the 6-digit code emails sent through a Gmail account made for ULTI, with an App Password as Supabase's custom SMTP (about 500 emails a day). Gmail is there because of the address: email services such as Resend only send to other people from a domain whose DNS records you control, and nobody can add records to `vercel.app`. Supabase pauses Free projects after about a week without activity, so a public `health` Edge Function runs a small database query and an UptimeRobot monitor calls it every 5 minutes, which keeps the project active and emails the owner if it goes down.

## Consequences

- The installed app, its offline data and its invite links all belong to its exact web address. Moving to a real domain later means every user reinstalls and old invite links stop working, so users should open the app online once before the move to empty their outbox. The final `*.vercel.app` name is picked before anyone is invited.
- Moving to a domain also means swapping Gmail for an email service (Resend's free plan sends 3,000 emails a month), which changes only Supabase's SMTP settings, not code.

## Considered Options

- **A free subdomain** (DigitalPlat, DNSHE, isroot.in or pp.ua, from the free-for-dev list): DNS records can be added, but free subdomains are heavily used by spammers, so code emails sent from them are likely to land in spam.
- **Buying a domain now** (about US$10–15 a year): the clean long-term setup, postponed until the test shows the app is worth it.
- **Supabase's built-in email**: it delivers only to members of the Supabase team, a few emails an hour, so friends would never receive their codes.
