# Gym Tracker

A training log where friends compete on *showing up* and *improving*, not on how much they lift, and where the app tells each lifter when to go heavier and when to back off.

The app ships in English and Rioplatense Spanish; each term lists the Spanish word the app uses for it.

## Training

**Session**:
One visit to the gym, logged as a sequence of Sets.
_Avoid_: Workout, training, visit
_Rioplatense_: Sesión

**Set**:
One bout of an Exercise, recorded as weight × reps, optionally with RIR.
_Rioplatense_: Serie

**Working Set**:
A Set done at training weight. Only Working Sets count toward scoring and recommendations.
_Rioplatense_: Serie efectiva

**Warm-up Set**:
A lighter Set done to prepare for the Working Sets of an Exercise.
_Rioplatense_: Serie de entrada en calor

**Weekly Target**:
The number of Sessions a user commits to doing each week.
_Avoid_: Goal, frequency
_Rioplatense_: Objetivo semanal

**Exercise**:
A named movement from the app's catalog, such as Back Squat or Bench Press. Only catalog Exercises can earn Progress Points.
_Avoid_: Movement, lift (when meaning the catalog entry)
_Rioplatense_: Ejercicio

**Custom Exercise**:
An Exercise a user creates themselves. It can be logged but never earns Progress Points.
_Rioplatense_: Ejercicio personalizado

**Routine**:
A user's saved training plan: which Exercises to do in which Session, each with a number of Sets and a Rep Range.
_Avoid_: Program, plan, template
_Rioplatense_: Rutina

**Rep Range**:
The target number of reps per Set for an Exercise in a Routine, such as 8–12.
_Rioplatense_: Repeticiones objetivo (never "rango", which means Rank)

**RIR**:
Reps in reserve: how many more reps the lifter believes they could have done at the end of a Set. Optional.
_Avoid_: RPE
_Rioplatense_: RIR (repes en reserva)

**e1RM**:
Estimated one-rep max: the heaviest single rep a Set implies the lifter could do, used to compare Sets across different rep counts.
_Rioplatense_: 1RM estimado

**Personal Record**:
A Set whose e1RM beats the lifter's all-time best on that Exercise.
_Avoid_: PB, max
_Rioplatense_: PR

**Calibration**:
A lifter's first Sessions with an Exercise, which establish their starting best and cannot produce Personal Records.
_Rioplatense_: Calibración

**Strength Level**:
How advanced a lifter is on an Exercise compared with other lifters of the same sex and bodyweight.
_Avoid_: Experience, training age

**Benchmark Lift**:
An Exercise with published strength standards, from which a lifter's Strength Level is measured.

## Recommendations

**Increment**:
The weight added to an Exercise when the app recommends going heavier.
_Rioplatense_: Incremento

**Stall**:
An Exercise whose e1RM has stopped improving, for which the app recommends dropping the weight and building back up.
_Avoid_: Plateau
_Rioplatense_: Estancamiento

**Deload Week**:
A planned week of deliberately lighter training to recover from accumulated fatigue.
_Rioplatense_: Semana de descarga

## Scoring

**Scoring Event**:
A single achievement that can earn points: a Personal Record or a completed Session.

**Points**:
What a user earns from their Scoring Events under the one standard formula that is the same for everyone. Points drive Rank.
_Avoid_: Global points, XP, score
_Rioplatense_: Puntos

**Progress Points**:
The part of Points earned from Personal Records, weighted so that a given improvement is worth more the more advanced the lifter already is.
_Rioplatense_: Puntos de progreso

**Consistency Points**:
The part of Points earned by completing Sessions toward one's Weekly Target, including during a Deload Week.
_Rioplatense_: Puntos de constancia

## Competition

**Group**:
A set of users who compete against each other on shared leaderboards. A user can belong to many Groups.
_Avoid_: League, team, party
_Rioplatense_: Grupo

**Owner**:
The member who controls a Group's settings: its creator, or the longest-standing member once the creator leaves.
_Avoid_: Admin, host
_Rioplatense_: Creador

**Visibility**:
What a user allows Group members to see of their training. Each user chooses it for themselves, and it is the same in every Group they belong to.
_Avoid_: Privacy settings, sharing
_Rioplatense_: Visibilidad

**Scoring Mode**:
A preset formula a Group picks to re-score its members' Scoring Events into a Group Score instead of standard Points.
_Rioplatense_: Modo de puntuación

**Group Score**:
A user's training re-scored under a Group's Scoring Mode for one Period.
_Rioplatense_: Puntaje del grupo

**Period**:
A calendar week, month or year over which a Group crowns a winner.
_Avoid_: Round, cycle
_Rioplatense_: Período

**Season**:
A fixed stretch of the calendar over which Rank is earned, after which it partially resets.
_Rioplatense_: Temporada

**Tier**:
A named band of Rank: Bronze, Silver, Gold, Diamond and Elite.
_Rioplatense_: Liga (Bronce, Plata, Oro, Diamante, Élite). In English, "league" is avoided everywhere.

**Division**:
A step within a Tier below Elite, from V (lowest) to I (highest). Elite has no Divisions.
_Rioplatense_: División

**Rank**:
A user's Tier and Division in the current Season, such as Gold III.
_Avoid_: Level, league, elo
_Rioplatense_: Rango ("Oro III")
