import { useEffect, useMemo, useRef, useState } from 'react';
import { POLICIES } from '../engine/bots';
import { LEVELS, makeCfg, TASKS } from '../engine/world';
import { runHref, type RunRoute } from '../route';
import { useRun } from '../useRun';
import { Ehr } from './Ehr';
import { Pointer } from './Pointer';
import { Portal } from './Portal';

// Three short runs that between them show a harmful mistake, a clean solve under pressure and a stale read.
const REEL: RunRoute[] = [
  { task: 'prior-auth', level: 'typical', seed: 2, bot: 'patched' },
  { task: 'eligibility', level: 'hostile', seed: 7, bot: 'reference' },
  { task: 'claim-status', level: 'hostile', seed: 4, bot: 'patched' },
];
const WORD = { pass: 'Passed', partial: 'Fell short', unsafe: 'Unsafe' } as const;

function Reel({ route, onDone }: { route: RunRoute; onDone: () => void }) {
  const cfg = useMemo(() => makeCfg(route.task, route.seed, route.level), [route]);
  const live = useRun(cfg, route.bot);
  const { state: s, result } = live;
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(onDone, 5000);
    return () => window.clearTimeout(id);
  }, [result, onDone]);
  const box = useRef<HTMLDivElement>(null);
  const last = live.frames[live.frames.length - 1]?.ev;
  const noop = () => undefined;
  const who = POLICIES.find((p) => p.id === route.bot)!.name;
  const what = TASKS.find((t) => t.id === route.task)!.name.toLowerCase();
  const how = LEVELS.find((l) => l.id === route.level)!.name.toLowerCase();
  return (
    <figure className="demo">
      <figcaption>
        <span><b>{who}</b> doing a {what} on the {how} portal</span>
        <a href={runHref(route)}>Open this run</a>
      </figcaption>
      <div className="demo-screen" aria-hidden="true" ref={box}>
        {s.tab === 'ehr' && <Ehr world={live.world} state={s} dispatch={noop} frozen />}
        {s.tab === 'payer' && <Portal world={live.world} state={s} dispatch={noop} frozen />}
        {s.tab === 'auth' && <div className="auth"><h2>Authenticator</h2><p className="code">{s.payer.mfaCode || 'No code waiting'}</p></div>}
        {!result && <Pointer point={live.point} box={box} />}
        {result && (
          <div className={`demo-end ${result.verdict}`}>
            <b>{WORD[result.verdict]}, {result.score} out of 100</b>
            <span>{result.violations[0] ?? `${result.outcome.correct} of ${result.outcome.total} fields right`}</span>
          </div>
        )}
      </div>
      <p className={`demo-line ${last && !last.ok ? 'bad' : ''}`}>{last ? `${last.who === 'system' ? 'Portal: ' : ''}${last.text}${last.ok ? '' : ' (nothing happened)'}` : 'Starting'}</p>
    </figure>
  );
}

export function Demo() {
  const [i, setI] = useState(0);
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const next = useMemo(() => () => setI((n) => (n + 1) % REEL.length), []);
  if (still) return null;
  return <Reel key={i} route={REEL[i]} onDone={next} />;
}
