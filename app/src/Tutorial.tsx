import { useState, type ReactNode } from 'react';
import type { Rank, Tier } from '@ulti/rules';
import { Badge } from './Badge.tsx';
import { useI18n } from './i18n.ts';
import { checkIcon, trophyIcon } from './icons.tsx';

// The Tutorial: a welcome card, then five slides. Finishing and Skipping both end
// it with `onDone`; closing the app midway ends nothing, so it starts again from the welcome card.

const tiers: Tier[] = ['bronze', 'silver', 'gold', 'diamond', 'elite'];
const roman = ['', 'I', 'II', 'III', 'IV', 'V'];

function Welcome() {
  return (
    <div className="tut-art tut-welcome-art" aria-hidden="true">
      <span className="tut-tag">1</span>
      <span className="tut-cell">60<small>kg</small></span>
      <span className="tut-x">×</span>
      <span className="tut-cell">8</span>
      <span className="tut-check">{checkIcon}</span>
    </div>
  );
}

function ScoreArt() {
  const a = useI18n().t.tutorial.art;
  return (
    <div className="tut-score">
      <div className="tut-chip">
        {trophyIcon}
        <span><b>{a.pr}</b><small>{a.prSub}</small></span>
        <span className="tut-plus">+18</span>
      </div>
      <div className="tut-chip">
        <span className="dot filled" />
        <span><b>{a.show}</b><small>{a.showSub}</small></span>
        <span className="tut-plus">+10</span>
      </div>
    </div>
  );
}

function StampsArt() {
  const a = useI18n().t.tutorial.art;
  return (
    <div className="tut-stamps">
      <div className="tut-stamps-row">
        {['10-12', '10-19', '10-26', '11-02'].map((week) => <span key={week} className="tut-stamp">{week}</span>)}
        <span className="tut-stamp empty">11-09</span>
      </div>
      <span className="disp tut-streak">{a.streak}</span>
    </div>
  );
}

function CalibrationArt() {
  const a = useI18n().t.tutorial.art;
  return (
    <div className="tut-calib">
      <p className="muted tut-calib-line">{a.calibLine}</p>
      <div className="tut-calib-steps">
        {a.calib.map((step, i) => (
          <div key={step} className={i === 3 ? 'pr' : undefined}>
            {i === 3 && trophyIcon}
            {step}
            <br />
            {i < 3 ? <span>{a.baseline}</span> : 'PR'}
          </div>
        ))}
      </div>
    </div>
  );
}

// The real crests, still: the five Tiers at Division III (Elite has none), then Gold from V up to I.
function RankArt() {
  const { t } = useI18n();
  const r = t.rank;
  return (
    <div className="tut-crests">
      <div className="tut-crest-row">
        {tiers.map((tier) => {
          const rank: Rank = { tier, division: tier === 'elite' ? null : 3 };
          return <Badge key={tier} rank={rank} tierName={r.tier[tier]} mode="still" />;
        })}
      </div>
      <div className="tut-crest-row gold">
        {([5, 4, 3, 2, 1] as const).map((division) => (
          <span key={division}>
            <Badge rank={{ tier: 'gold', division }} tierName={r.tier.gold} mode="still" />
            <b>{roman[division]}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function GroupsArt() {
  const a = useI18n().t.tutorial.art;
  const people: [string, string, number, boolean?][] = [['Sofi', '#ffc83d', 412], [a.me, '#ff4d9d', 365, true], ['Juan', '#7be7ff', 340], ['Meli', '#c5e46a', 298]];
  return (
    <div className="tut-groups">
      {people.map(([name, colour, points, me], i) => (
        <div key={name} className={`tut-board-row${me ? ' me' : ''}`}>
          <span className="pos">{i + 1}</span>
          <span className="av" style={{ background: colour }}>{name[0]}</span>
          <b>{name}</b>
          <span className="pts">{points}</span>
        </div>
      ))}
    </div>
  );
}

const slideArt: ReactNode[] = [<ScoreArt />, <StampsArt />, <CalibrationArt />, <RankArt />, <GroupsArt />];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const u = t.tutorial;
  // 0 is the welcome card, 1 to 5 the slides.
  const [step, setStep] = useState(0);
  const slide = step - 1;
  const last = slide === u.slides.length - 1;
  return (
    <div className="tutorial">
      <button type="button" className="tut-skip" onClick={onDone}>
        {u.skip}
      </button>
      {step === 0 ? (
        <div className="tut-welcome">
          <Welcome />
          <h1 className="disp">{u.welcomeTitle}</h1>
          <p>{u.welcomeText}</p>
          <button type="button" className="btn-primary" onClick={() => setStep(1)}>
            {u.welcomeGo}
          </button>
        </div>
      ) : (
        <div className="tut-slide" key={step}>
          <div className="tut-art">{slideArt[slide]}</div>
          <h1 className="disp">{u.slides[slide].title}</h1>
          <p>{u.slides[slide].text}</p>
          <div className="tut-pager" aria-hidden="true">
            {u.slides.map((_, i) => <i key={i} className={i === slide ? 'on' : undefined} />)}
          </div>
          <button type="button" className="btn-primary" onClick={() => (last ? onDone() : setStep(step + 1))}>
            {last ? u.slideGo : u.next}
          </button>
        </div>
      )}
    </div>
  );
}
