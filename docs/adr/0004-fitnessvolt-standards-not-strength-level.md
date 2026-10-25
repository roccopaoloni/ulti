# Benchmark Lifts come from FitnessVolt, not Strength Level

Strength Levels are measured against FitnessVolt's self-reported gym percentiles (14 lifts, by sex and weight class, CC BY 4.0), copied into our own database and credited on the About screen together with Symmetric Strength, whose dataset they are built from. FitnessVolt also publishes competition percentiles, but only for squat, bench and deadlift, and they skew strong for the same reason as OpenPowerlifting below. Strength Level covers far more exercises (~287), but its terms forbid systematic copying, automated access and "derivative versions of our calculators or standards", and the public GitHub copies of its tables are unlicensed scrapes.

## Considered Options

- **Strength Level**: best coverage, but no API or licence; would need written permission, which we may request later.
- **OpenPowerlifting**: public domain, but only squat, bench and deadlift, and only from competitive lifters, so it skews strong.
- **Our own users' logs**: the long-term goal once there are enough users to compute reliable percentiles per sex and bodyweight.
