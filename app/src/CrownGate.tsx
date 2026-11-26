import { useEffect, useState } from 'react';
import { supabase } from './auth.ts';
import { CrownMoment } from './Crown.tsx';
import { crownMoment, type Crown } from './crownMoment.ts';
import { useI18n } from './i18n.ts';

// Shows the crowns the server has for the user and they haven't seen, as one moment, on the next
// app open. The server remembers what has been seen (it is the same on every phone), so tapping
// Continue is what clears them: it marks every crown in the moment, and one that fails to mark
// shows again on the next open. Offline, or on any error, nothing shows and the crowns wait.
export function CrownGate() {
  const { t } = useI18n();
  const [crowns, setCrowns] = useState<Crown[]>([]);

  useEffect(() => {
    supabase.rpc('my_crowns').then(
      ({ data }) => setCrowns((data as Crown[] | null) ?? []),
      () => {},
    );
  }, []);

  if (crowns.length === 0) return null;
  const c = t.crown;
  const { period, rows } = crownMoment(crowns);
  const [first] = rows;
  const one = rows.length === 1;
  const onContinue = () => {
    for (const crown of crowns) supabase.rpc('see_crown', { crown_id: crown.id }).then(() => {}, () => {});
    setCrowns([]);
  };
  return (
    <CrownMoment
      key={crowns.map((x) => x.id).join()}
      title={c.title[period]}
      label={one ? first.group : c.crowns(rows.length)}
      headline={one ? c.headline(first.period, first.group, first.tiedWith) : c.many(rows.length)}
      chips={one ? [c.points(first.points), ...(first.tiedWith > 0 ? [c.shared(first.tiedWith)] : [])] : []}
      wins={one ? undefined : rows.map((r) => ({ group: r.group, sub: [c.period[r.period], c.points(r.points), ...(r.tiedWith > 0 ? [c.tiedWith(r.tiedWith)] : [])].join(' · ') }))}
      strings={{ news: c.news, tapHint: c.tapHint, continue: c.continue }}
      onContinue={onContinue}
    />
  );
}
