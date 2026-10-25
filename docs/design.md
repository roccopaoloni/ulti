# ULTI design direction

The visual and interaction decisions every screen builds on. Domain terms follow the glossary.

## Name

**ULTI**, tagline **"ULTI, una más"** (English: "ULTI, one more"). "Ulti" is gamer slang for an *ultimate* ability, which fits Leagues and Ranks borrowed from games; "una más" is the gym's "one more rep".

## Mood

**Arcade Chicle**: a 90s arcade cabinet at night, fighting-game select screens, kiosco candy; "tirar la ulti" taken literally. The game layer (Ranks, Seasons, crowns) is the identity, not decoration. Logging screens stay calm and functional; the big moments (Personal Records, Rank-ups, Period wins) go loud.

An earlier "athletic and competitive" direction (near-black with an electric lime accent, condensed type) was prototyped and rejected as too much like every other fitness app.

## Theme

Light and dark themes that follow the phone's setting. Dark is designed first, because gyms are often dim and a bright screen between Sets is harsh.

## Colour

The trademark colour is **hot pink** on deep indigo. Pink is used for primary buttons, ✓ and the "↑ go heavier" badge. Tier colours are reserved for Rank badges, Rank-up screens and crowns and are never UI accents. Red is only for errors and destructive actions.

| Token | Dark | Light |
|---|---|---|
| Background | #0E0B1F | #F7F4FF |
| Surface | #17132F | #FFFFFF |
| Surface 2 | #211C42 | #ECE8FA |
| Line | #2F2A58 | #D9D3F0 |
| Text | #F4F1FF | #1A1433 |
| Muted text | #A49FC7 | #5C5680 |
| Accent (fills) | #FF4D9D | #FF4D9D |
| Text on accent | #1A0614 | #1A0614 |
| Accent as text | #FF4D9D | #C2185F |
| Bronze | #D9894F | #A8602A |
| Silver | #C3CAD6 | #7A8497 |
| Gold | #FFC83D | #A87900 |
| Diamond | #7BE7FF | #0F8FAE |
| Elite | #A98BFF | #6A3FE0 |

Pink and Elite's lilac are neighbours, so Elite is told apart by its badge shape, its great back wing and turning rays, not by hue alone.

## Typography

- **Unbounded** for headings and Rank names only. It is wide, so it is used sparingly and at modest sizes.
- **Manrope** for body text, labels and all numbers (scores, weights, reps).
- Both are bundled with the app so they work offline, and both cover Spanish accents.
- Numbers use tabular figures so they don't shift sideways as they change.

## Numbers

Formatting follows the app's language: **82,5 kg** and **1.250 pts** in Spanish, 82.5 kg and 1,250 pts in English. The keypad's decimal key matches.

## Icon

**"Semana"**: three dots in a row above a white U, on the indigo background. The first two dots are filled pink and the third is an empty pink ring: two Sessions done, *una más* to go, in the language of the Weekly Target. No barbell. (Other concepts were explored; a reference image someone else made inspired the early "U + barbell" idea and is not used or copied.)

## Navigation

Four bottom tabs:

- **Home (Inicio)**: this week, the Groups' races, and the button to start a Session.
- **Train (Entrenar)**: Routines, Session history, Exercises.
- **Groups (Grupos)**: boards and invites.
- **Profile (Perfil)**: Rank, settings, Visibility.

A Session in progress takes over the whole screen; when the user leaves it, a persistent "Session in progress" bar on every tab returns to it.

## Logging a Session

Each user picks a **logging layout** in Profile; both work on the same Session:

- **List** (default): the whole Session as one scrolling list, described below.
- **Focus**: one Set at a time, with very large numbers, the Exercise's Sets as chips, previous/next controls and a full-width "Done" button in thumb reach.

A third layout (Session list on top with fixed ± controls at the bottom) was prototyped and dropped.

List layout:

- The whole Session is one scrolling list: each Exercise is a block of Set rows, **pre-filled** with the target (the last Session's numbers, or the recommended heavier weight with a "↑ +2.5 kg" badge).
- One tap on ✓ completes a Set exactly as planned. Tapping a number opens a large keypad with ± buttons that step weight by the Exercise's Increment and reps by 1.
- RIR is optional: after ✓, a row of chips (0 · 1 · 2 · 3 · 4+) appears for a few seconds and disappears if ignored.
- One-handed use: large tap targets, primary actions within thumb reach, and the screen stays awake during a Session.

## Home

In order:

1. This week: Weekly Target progress as dots (●●○) and this week's Points.
2. A large "Start Session" button suggesting the next Session of the Routine, including any Deload Week suggestion.
3. One race card per Group with the user's weekly position ("2nd of 5, 40 pts behind Ana").
4. The "since your last visit" summary appears as a card at the top when there is news.

## Group board

Week / Month / Year tabs. Each row shows position, avatar, name, Rank badge, score, the week's Session dots and the latest Personal Record chips ("Bench +3%"). The leader wears a crown. Tapping a member opens their profile, filtered by their Visibility. The Group's Scoring Mode is labelled at the top.

## Celebrations

- **Personal Record during a Session**: a brief animated banner ("PR! Bench +3% · +40 pts") that never blocks logging.
- **A Rank-up**: a full-screen moment in the new Tier's colour, shown on the next app open.
- **Winning a Period** (a week, month or year in any Group): a full-screen crown moment in gold, the crown's colour, reusing the Rank-up structure in a shorter form, shown on the next app open after the Period ends. Tied winners each get it.
- **Finishing a Session**: a summary card with progress toward the Weekly Target, Personal Records and points earned.

## Sound

The Rank-up sound is **Metal**: a kick and a palm-muted guitar chug for each crack in the old badge, a distorted power chord with kick, snare and crash when it shatters, and a riff that grows with the Tier. Every sound lands on something the user can see happen. The weight comes from distorted low-mids, not sub-bass, because phone speakers drop almost everything under about 150 Hz, and nothing rings high and tonal, because that reads as an achievement chime. The prototype synthesizes it; the app should use recorded or produced audio in the same style.

On iPhones the sound **respects the silent switch**, so with the switch on silent a Rank-up plays without sound. ULTI is a web app ([ADR 0003](./adr/0003-offline-first-pwa-not-native.md)), and the only way for a web page to play through the switch is to ask to be treated as media playback, like a video, which also pauses whatever else is playing. Most people lift with music on, and a Rank-up that stops their music is worse than a silent one.

## Rank badges

Every Rank is the same **crest**: a keystone holding a cut gem, between swept blade wings. It is drawn as polished metal lit from above: each piece has a face, a bevelled edge that is bright along the top, a fine rim, and a soft shadow on the layer behind. There are no outlines. Each Tier changes the metal and its stone, and adds a layer:

| Tier | Metal and stone | Adds |
|---|---|---|
| Bronze | Copper, amber | One blade per side |
| Silver | Steel, sapphire | A lower blade |
| Gold | Gold, ruby | A tail blade and a crown spike |
| Diamond | Ice blue, diamond | An upper wing |
| Elite | Violet, magenta | A great amethyst back wing and rays, with every Division detail; a plaque instead of pips, showing the user's position ("#7") if they are in the Season's top 1,000, otherwise their "top X%" |

Within a Tier the crest evolves with every Division, one step you can name at a glance, while its wings spread wider: IV sets studs in the wings, III raises a fin off each wing, II adds a crown spike (side spikes from Gold up), and I makes the crest glow and the gem flare. Five pips under the crest also show the Division (V lights one, I all five).

Small badges (leaderboard rows) are the crest's flat silhouette in the Tier colour. The large badge on Profile adds the pips, progress to the next Division, a shelf of all Tiers (locked ones greyed) and stamps from past Seasons. Every few seconds a white shine sweeps across a large badge.

## The Rank-up moment

A Rank-up is shown full screen on the next app open, in the new Tier's colour.

1. **The old crest waits**: "Tenés novedades" above the user's old crest, and "Tocá para abrir".
2. **It cracks, one hit at a time.** Each hit sends the cracks further out, jolts the crest and plays one sound. The cracks are jagged, branch and taper away from the impact point, drawn as dark splits with a lit edge. The hits come faster and harder on their own (Silver 3, Gold 4, Diamond 5, Elite 6), and each tap lands the next one at once. Light starts leaking through the cracks on the last hits.
3. **It shatters.** The crest flies apart into the pieces its cracks drew, the screen flashes, the Tier colour floods in, and the new crest bursts out while its wings and rays unfold. Higher Tiers add more: from Gold a beam of light and a screen shake, from Diamond turning rays and a second burst. Elite darkens the screen with every hit, holds its breath (the cracked crest swells while the sound draws in), then drops, with aftershock rings. Phones that support it vibrate on the shatter.
4. **The new Rank lands**: the Tier name slams in letter by letter, the Division numeral stamps in, and the crest's pips light one by one, each with a hit.
5. **The proof**: up to three stat chips count up from zero, then a headline and a short kicker appear above a Continue button.

A Division-up within the same Tier skips the cracking: the old crest holds for a second, then becomes the new one with a stamp. Once the reveal has played for a second, a tap skips to the end. With reduced motion, the moment shows its end state without animation.

**Headlines** are written only from the user's real stats: being in Elite, leading a Group, a Streak of 8 weeks or more, a lift up 10% or more, passing someone, Personal Records, the climb since the Season started, how fast it happened, Sessions attended, Points, or an even split between consistency and progress. The most impressive true one becomes the headline, but never one of the last three shown, in the app's direct voice ("9 semanas seguidas cumpliendo. Eso no se regala.", "Sos el número 1 de Los del gym. Cuidá el trono."). The next-best stats become the chips. The kicker rotates through "Ulti cargada", "Rango nuevo" and "Esto es otra cosa", plus "Subiste de liga" when the Tier changed (*liga* means Tier), never the same one twice in a row.

## Moments that reward showing up

- **Finishing a Session**: the Weekly Target dot fills with a pop, with a line such as "Fuiste. Eso es lo que cuenta."
- **Week Stamps and Streak**: every week the user meets their Weekly Target earns a Week Stamp on Profile, and consecutive ones form a Streak. A Deload Week counts like any other week.
- **Friends who trained today** on Home ("Ana ya entrenó hoy"), built only from Session counts, which are always visible, so it never reveals more than Visibility allows. It nudges without push notifications.
- **Calibration copy**: new users and new Exercises say "Tus primeras sesiones fijan tu base", so Calibration feels like progress rather than a score of zero.

## Avatars

Initials on a colour the user picks. No photo uploads in v1.

## Later (v1.1)

- A shareable image card (Rank-up first, then Session summaries), sized for WhatsApp, where Argentine friend groups live.
- A Season recap, reusing the Rank-up structure in a shorter form.

## Not in v1

- **Rest timer.** Considered because nearly every gym logger has one. Rejected for v1: people will leave the app between Sets for social media anyway, and a timer won't stop that, so it isn't worth the extra surface.
