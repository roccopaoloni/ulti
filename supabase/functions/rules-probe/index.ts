// Spike: proves an Edge Function can import the rules package. Removed once CI shows it bundles and runs.
import { deriveScoringEvents } from '@ulti/rules';

Deno.serve(() => Response.json({ scoringEvents: deriveScoringEvents({ sessions: [] }) }));
