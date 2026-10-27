import { useEffect, useState } from 'react';
import { supabase } from './auth.ts';
import { CrownMoment } from './Crown.tsx';
import { useI18n } from './i18n.ts';

type Crown = { id: number; group_name: string; period: 'week' | 'month' | 'year'; points: number; shared_with: number };

// Shows the crowns the server has for the user and they haven't seen, one after another, on the
// next app open. The server remembers what has been seen (it is the same on every phone), so
// tapping Continue is what clears a crown. Offline, or on any error, nothing shows and the crowns
// wait for the next open.
export function CrownGate() {
  const { t } = useI18n();
  const [crowns, setCrowns] = useState<Crown[]>([]);

  useEffect(() => {
    supabase.rpc('my_crowns').then(
      ({ data }) => setCrowns((data as Crown[] | null) ?? []),
      () => {},
    );
  }, []);

  const [crown] = crowns;
  if (!crown) return null;
  const c = t.crown;
  return (
    <CrownMoment
      key={crown.id}
      title={c.title[crown.period]}
      headline={c.headline(crown.period, crown.group_name, crown.shared_with)}
      chips={[c.points(crown.points), ...(crown.shared_with > 0 ? [c.shared(crown.shared_with)] : [])]}
      strings={{ news: c.news, tapHint: c.tapHint, continue: c.continue }}
      onContinue={() => {
        supabase.rpc('see_crown', { crown_id: crown.id }).then(() => {}, () => {});
        setCrowns((all) => all.slice(1));
      }}
    />
  );
}
