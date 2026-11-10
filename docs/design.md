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

The trademark colour is **hot pink** on deep indigo. Pink is used for primary buttons, ✓ and the "↑ go heavier" badge. Tier colours are reserved for Rank badges, Rank-up screens and crowns and are never UI accents. Red is only for errors and destructive actions: a clear red (hue 0, between the pink accent and the orange the app avoids), never coral. It is filled only on the final "are you sure?" button of a destructive sheet (leave or delete a Group, delete the account, remove a member, discard an empty Session, delete a Set); every other destructive action, such as the links that open those sheets or "Remove and reset link", is red text with no fill, and error messages are red text too.

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
| Danger (text and fill, errors too) | #FF4D4D | #C4161C |
| Text on danger fill | #1A0614 | #FFFFFF |
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

Every screen fits the phone's width, from 320px up: it scrolls up and down, never sideways. Only a row of chips may swipe sideways, inside itself. Pinch-zoom stays on.

## Logging a Session

Each user picks a **logging layout** in Profile; both work on the same Session:

- **List** (default): the whole Session as one scrolling list, described below.
- **Focus**: one Set at a time, with very large numbers, the Exercise's Sets as chips, previous/next controls and a full-width "Done" button in thumb reach.

A third layout (Session list on top with fixed ± controls at the bottom) was prototyped and dropped.

List layout:

- The whole Session is one scrolling list: each Exercise is a block of Set rows, **pre-filled** with the target (the last Session's numbers, or the recommended heavier weight with a "↑ +2.5 kg" badge).
- One tap on ✓ completes a Set exactly as planned. Tapping a number opens a large keypad with ± buttons that step weight by the Exercise's Increment and reps by 1.
- Rows not logged yet show the Warm-up or Working tag too: what automatic labelling would give the row if the plan were logged, following the weight as it changes. Tapping the tag locks in the lifter's choice, and a Set keeps the label its row showed when ✓ is tapped.
- RIR is optional, with an ⓘ that explains it: after ✓ on a Working Set, a row of chips (0 · 1 · 2 · 3 · 4+) stays until the lifter answers or logs the next Set. A Warm-up Set never shows it, and flipping a logged Set to Warm-up clears its RIR. Skipping it on the Session's first Working Set hides it for the rest of that Session; it comes back in the next one.
- Tapping a logged Set's ✓ un-logs it: the Set is deleted and its row comes back editable with the same numbers and label (in Focus, a logged Set shows an outline "Un-log set" button with an undo arrow in place of the filled Done). Logging it again saves a new Set and asks for RIR as usual; leaving without logging it again leaves no Set.
- A logged Set has a ≡ handle (List layout only): press and slide it to put the Set in its real place among its Exercise's Sets, the same gesture as on the Routine screen. The new order is the truth: it gets a **position** that syncs with the Set (the logged time is never rewritten), and the Warm-up labels, RIR prompt, Points and next Session's pre-filled rows follow it. A Set dropped in front of a Warm-up Set (detected or by hand) becomes a Warm-up Set of the lifter's own, even the heaviest; any other move leaves a hand-set label as it is, and detected labels are worked out again from the new places. Sets without a position keep their logged order and come after positioned ones.
- A dumbbell Exercise says its weight is per dumbbell, on its rows and its keypad. The weight is stored and scored per dumbbell, so no numbers change.
- One-handed use: large tap targets, primary actions within thumb reach, and the screen stays awake during a Session.

### Implausible Sets

Saving a Set (✓, Focus's Done, or editing a Set in a Session's detail) first checks it for an Implausible Set, on the phone and offline. Custom Exercises are never checked.

- **Beyond any human.** Each catalog Exercise has a ceiling in kg: its all-time record, equipped lifts included, or a generous hand-picked number where no record exists. A Set whose e1RM (bodyweight plus added weight for a bodyweight Exercise, or the added weight alone when no bodyweight is logged) is over the ceiling is never saved, Warm-up Sets included. The sheet says **"No me caminés, no estás levantando eso."** / *"¿Se te fue el dedo? Revisá el peso y las repes."* (EN: **"Nice try. Nobody lifts that."** / *"Fat-fingered it? Check the weight and reps."*) with one button, **Corregir** / **Fix it**, that returns to the numbers. The server scores any such Set that reaches it (from an old or modified app) as if it weren't there.
- **Too big a jump.** Only Sets that could be a Personal Record are checked: catalog Exercise, Working Set, 1–12 reps, past Calibration and not a Deload Session. One whose e1RM is more than the limit above the lifter's best going into the last 28 days (or their Calibration best, if they're newer than that) is a jump. The limit depends on the Strength Level of that best: +40% below the 25th percentile, +20% from the 25th to the 75th, +10% above the 75th; a lifter without sex or bodyweight counts as the 50th. The sheet says **"¿Ah, sí? ¿{X}% más en un mes?"** / *"Si lo levantaste, guardala. No suma puntos, pero queda como tu nueva mejor marca."* (EN: **"Oh really? {X}% up in a month?"** / *"If you lifted it, save it. It won't earn Points, but it becomes your new best."*) with **Corregir** / **Sí, lo levanté** (EN: **Fix it** / **I lifted it**). A saved jump earns no Progress Points but becomes the lifter's best and the baseline for later checks, as Calibration does, so an honest returning lifter is asked once. The rule is the same on the server whether or not anyone tapped the override, so nothing extra is stored.

## Home

In order:

1. This week: Weekly Target progress as dots (●●○) and this week's Points.
2. A large "Start Session" button suggesting the next Session of the Routine, including any Deload Week suggestion.
3. One race card per Group with the user's weekly position ("2nd of 5, 40 pts behind Ana").
4. The "since your last visit" summary appears as a card at the top when there is news.

During a Deload Week, Home shows a "Deload Week" badge with a **Cancel** link. It asks "Back to a normal week?" ("Your next Sessions use your normal weights. The Sessions you already logged stay as Deload Sessions.", with **Back to normal** / **Keep deloading**). A Deload Week can be started in any week that is not one already. If last week counts as deloaded (its Deload Week was not cancelled, or it holds a Deload Session), starting asks first: "You deloaded last week. Deload again this week?" (**Start Deload Week** / **Not now**). See [ADR 0007](adr/0007-deload-weeks-unlimited-and-cancellable.md).

## Stall, Fatigue and Deload advice

The rules behind the per-Exercise badge and the Home Deload card. See [ADR 0009](adr/0009-stall-and-fatigue-from-rir-adjusted-e1rm.md).

- **What is compared.** Working Sets of 1–12 reps, outside Deload Sessions; Calibration Sessions only set the baseline. A Session's figure is its top Set's e1RM, RIR-adjusted (W × (1 + (reps + RIR) / 30), RIR 4+ as 4) when both Sessions being compared logged RIR, plain Epley otherwise. A bodyweight Exercise counts the lifter's average bodyweight plus the added weight. The "best before" reaches back over the up to 6 Sessions before, but never past the latest Session whose top Working Set was at least 7.5% lighter than the one before it.
- **Fatigue** on an Exercise is regression on the RIR-adjusted e1RM: each of its last 2 Sessions is at least 3% below the average of the Sessions in its best-before window (when the Session logged RIR, the average is over the window's Sessions that did too, adjusted; else plain e1RM over all of them). Effort creeping up to hold the same numbers shows as the same weight with less in reserve, a falling adjusted figure, so it has no rule of its own. The badge says to drop about 10% and build back up (reset weight rounded to the Increment, reps at the bottom of the Rep Range), with "Keep the same weight" to dismiss.
- **Stall** on an Exercise is at least 3 Sessions over at least 3 weeks without beating the best before, with no Fatigue: the Sessions at the end of the history that each fail to beat their best before (equal does not beat it) number at least 3, and the last is at least 21 days after the Session that set the best, the one just before them. Only Sessions on or after the date of the last Switch count as failing (the best before may reach further back), and the 21 days run from that date if it is later. The badge suggests the next Rep Range among 4–6 · 6–8 · 8–10 · 10–12: one bracket down (heavier) when the current range's midpoint is 8 or more, one up otherwise, never past 10–12. Its weight puts the new range's bottom at RIR 2 from the recent best adjusted e1RM, rounded down to the Increment (best 100 kg to 6–8: 100 / (1 + 8/30) = 78.9, so 77.5 kg). **Switch** changes that Exercise's Rep Range on that Routine Day and stores the day it happened on that Exercise's entry (`rangeSince`; a hand edit of the Rep Range on the Routine screen does the same); **Keep** dismisses.
- **One badge per Exercise**: Fatigue, else Stall, else go heavier.
- **Deload Week suggestion**: Fatigue on Exercises of 2 or more different compound Movement Patterns among the Routine's Exercises (or, with no Routine, the Exercises trained in the last 4 weeks). After a **high-intensity streak** (6 weeks in a row whose average RIR over compound Working Sets is 1 or less; a week with no compound RIR logged, or a deloaded week, breaks it) one pattern is enough. The card names up to 2 of the lifts ("Your squat and bench press are showing fatigue. Take a Deload Week to recover."), adding "…after 6 weeks of hard training" when the streak decided it. Not within 4 weeks of the last Deload Week's start, of a dismissal, or of the first Session. While it is suggested, the per-Exercise badges of the lifts it covers are hidden. There is no suggestion based on time alone.

## Group board

Week / Month / Year tabs. Each row shows position, avatar, name, Rank badge, score, the week's Session dots and the latest Personal Record chips ("Bench +3%"). The leader wears a crown. Tapping a member opens their profile, filtered by their Visibility. The Group's Scoring Mode is labelled at the top. The board is also the member list: the name stays on one line (cut with an ellipsis), "You" and "Owner" are small tags beside it. The Group header has the name, Invite and a ⚙ that opens Group settings, a screen of its own under the Groups tab: the Owner chooses the Scoring Mode and resets the invite link, and everyone sees the members and Leave Group.

Each row has two lines beside the avatar: the name with its "You" tag and the leader's crown, then the "Owner" tag and the latest Personal Record chip. The small Rank badge sits on the avatar's lower corner. On the right, the points sit above the week's Session dots, then a › to the member's profile. Position, avatar, points and › are centred on the row. Group and member names show exactly as typed, never uppercased, and everything on the board is in Manrope; only the screen title uses Unbounded. Approved mockup: `prototype/ulti-groups.mockup.html`, with renders in `docs/screenshots/groups-mockup/`.

## Celebrations

- **Personal Record during a Session**: a brief animated banner ("PR! Bench +3% · +40 pts") that never blocks logging.
- **A Rank-up**: a full-screen moment in the new Tier's colour, shown on the next app open.
- **Winning a Period** (a week, month or year in any Group): a full-screen crown moment in gold, the crown's colour, reusing the Rank-up structure in a shorter form, shown on the next app open after the Period ends. Tied winners each get it.
- **Finishing a Session**: a summary card with progress toward the Weekly Target, Personal Records and points earned.

## Sound

The Rank-up sound is **Metal**: a kick and a palm-muted guitar chug for each crack in the old badge, a distorted power chord with kick, snare and crash when it shatters, and a riff that grows with the Tier. Every sound lands on something the user can see happen. The weight comes from distorted low-mids, not sub-bass, because phone speakers drop almost everything under about 150 Hz, and nothing rings high and tonal, because that reads as an achievement chime. The prototype synthesizes it, and the app ships that synthesized sound until recorded or produced audio in the same style exists (see [deferred decisions](./deferred-decisions.md)).

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

A Rank-up is shown full screen on the next app open, in the new Tier's colour. On a phone that has already seen a Rank it appears as soon as Home opens, decided from the Season Rank Points the phone already has, without waiting for the server (the Elite plaque fills in when the server's position arrives). A phone that has never seen a Rank waits for the server first, so a new phone's empty history can't pass for a Rank.

1. **The old crest waits**: "Tenés novedades" above the user's old crest, and "Tocá para abrir".
2. **It cracks, one hit at a time.** Each hit sends the cracks further out, jolts the crest and plays one sound. The cracks are jagged, branch and taper away from the impact point, drawn as dark splits with a lit edge. The hits come faster and harder on their own (Silver 3, Gold 4, Diamond 5, Elite 6), and each tap lands the next one at once. Light starts leaking through the cracks on the last hits.
3. **It shatters.** The crest flies apart into the pieces its cracks drew, the screen flashes, the Tier colour floods in, and the new crest bursts out while its wings and rays unfold. Higher Tiers add more: from Gold a beam of light and a screen shake, from Diamond turning rays and a second burst. Elite darkens the screen with every hit, holds its breath (the cracked crest swells while the sound draws in), then drops, with aftershock rings. Phones that support it vibrate on the shatter.
4. **The new Rank lands**: the Tier name slams in letter by letter, the Division numeral stamps in, and the crest's pips light one by one, each with a hit.
5. **The proof**: up to three stat chips count up from zero, then a headline and a short kicker appear above a Continue button.

A Division-up within the same Tier skips the cracking. Like a Tier-up it waits for the user's first tap on their current crest, with "Tenés novedades" and "Tocá para abrir"; the tap stamps the new crest in at once, with no hold for a second. Once the reveal has played for a second, a tap skips to the end. With reduced motion, the moment shows its end state without animation.

**Headlines** are written only from the user's real stats: being in Elite, leading a Group, a Streak of 8 weeks or more, a lift up 10% or more, passing someone, Personal Records, the climb since the Season started, how fast it happened, Sessions attended, Points, or an even split between consistency and progress. The most impressive true one becomes the headline, but never one of the last three shown, in the app's direct voice ("9 semanas seguidas cumpliendo. Eso no se regala.", "Sos el número 1 de Los del gym. Cuidá el trono."). The next-best stats become the chips. The kicker rotates through "Ulti cargada", "Rango nuevo" and "Esto es otra cosa", plus "Subiste de liga" when the Tier changed (*liga* means Tier), never the same one twice in a row.

## Moments that reward showing up

- **Finishing a Session**: the Weekly Target dot fills with a pop, with a line such as "Fuiste. Eso es lo que cuenta."
- **Week Stamps and Streak**: every week the user meets their Weekly Target earns a Week Stamp on Profile, and consecutive ones form a Streak. A Deload Week counts like any other week.
- **Friends who trained today** on Home ("Ana ya entrenó hoy"), built only from Session counts, which are always visible, so it never reveals more than Visibility allows. It nudges without push notifications.
- **Calibration copy**: new users and new Exercises say "Tus primeras sesiones fijan tu base", so Calibration feels like progress rather than a score of zero.

## Avatars

Initials on a colour the user picks. No photo uploads in v1.

The colours are coral, sand, lime, teal, sky blue and pink: all light, so the initials are dark in both themes, and none of them a Tier colour or the accent. The initials are the first letters of the first two words of the display name, or its first two letters if it is one word ("Ana" → AN, "Lu Fernández" → LF).

## Later (v1.1)

- A shareable image card (Rank-up first, then Session summaries), sized for WhatsApp, where Argentine friend groups live.
- A Season recap, reusing the Rank-up structure in a shorter form.

## Not in v1

- **Rest timer.** Considered because nearly every gym logger has one. Rejected for v1: people will leave the app between Sets for social media anyway, and a timer won't stop that, so it isn't worth the extra surface.
