import { useEffect, useMemo, useRef, useState } from 'react';
import { POLICIES } from '../engine/bots';
import type { Frame } from '../engine/types';
import { levelName, makeCfg, TASKS } from '../engine/world';
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
const APPS = [
  { id: 'ehr', name: 'Larkspur EHR' },
  { id: 'payer', name: 'Harborline portal' },
  { id: 'auth', name: 'Authenticator' },
] as const;
const HOLD = 6000;

const who = (r: RunRoute) => POLICIES.find((p) => p.id === r.bot)!.name;
const what = (r: RunRoute) => TASKS.find((t) => t.id === r.task)!.name;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function Line({ f }: { f: Frame }) {
  const { ev } = f;
  const cls = !ev.ok ? 'bad' : ev.who === 'system' ? 'sys' : '';
  return (
    <li className={cls}>
      <time>{secs(ev.at)}</time>
      <span>{ev.who === 'system' ? `Portal: ${ev.text}` : ev.text}{ev.ok ? '' : ' (nothing happened)'}</span>
    </li>
  );
}

function Reel({ route, onDone }: { route: RunRoute; onDone: () => void }) {
  const cfg = useMemo(() => makeCfg(route.task, route.seed, route.level), [route]);
  const live = useRun(cfg, route.bot);
  const { state: s, result, frames } = live;
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(onDone, HOLD);
    return () => window.clearTimeout(id);
  }, [result, onDone]);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  // Keep the newest line in view inside the log, without ever scrolling the page.
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [frames.length]);
  const noop = () => undefined;
  const acts = frames.filter((f) => f.ev.who === 'agent').length;
  const misses = frames.filter((f) => !f.ev.ok).length;
  const clock = frames.length ? frames[frames.length - 1].ev.at : 0;

  return (
    <div className="mon-body">
      <div className="mon-screen">
        <div className="apps" aria-hidden="true">
          {APPS.map((a) => <span key={a.id} className={s.tab === a.id ? 'on' : ''}>{a.name}</span>)}
        </div>
        <div className="demo-screen" aria-hidden="true" ref={box}>
          {s.tab === 'ehr' && <Ehr world={live.world} state={s} dispatch={noop} frozen />}
          {s.tab === 'payer' && <Portal world={live.world} state={s} dispatch={noop} frozen />}
          {s.tab === 'auth' && <div className="auth"><h2>Authenticator</h2><p className="code">{s.payer.mfaCode || 'No code waiting'}</p></div>}
          {!result && <Pointer point={live.point} box={box} />}
        </div>
      </div>
      <aside className="mon-log" aria-label="Run log">
        <dl className="mon-stats">
          <div><dt>Clock</dt><dd>{secs(clock)}</dd></div>
          <div><dt>Actions</dt><dd>{acts}</dd></div>
          <div><dt>Obstacles</dt><dd>{s.obstacles.length}</dd></div>
          <div><dt>Misses</dt><dd className={misses ? 'bad' : ''}>{misses}</dd></div>
        </dl>
        <ol ref={list} aria-live="off">
          {frames.length === 0 && <li className="idle"><time>0.0s</time><span>Reading the work order</span></li>}
          {frames.map((f, i) => <Line key={i} f={f} />)}
        </ol>
        {result ? (
          <div className={`mon-verdict v-${result.verdict}`} data-testid="demo-verdict">
            <p><b>{result.score}</b><span>/100</span><em>{WORD[result.verdict]}</em></p>
            <p className="why">{result.violations[0] ?? `${result.outcome.correct} of ${result.outcome.total} fields right`}</p>
            <a href={runHref(route)}>Open the full scorecard</a>
          </div>
        ) : (
          <div className="mon-verdict running"><p className="why">Scored when the operator presses finish.</p></div>
        )}
      </aside>
    </div>
  );
}

export function Demo() {
  const [i, setI] = useState(0);
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const next = useMemo(() => () => setI((n) => (n + 1) % REEL.length), []);
  if (still) return null;
  return (
    <figure className="monitor">
      <figcaption>
        <div className="reels" role="tablist" aria-label="Sample runs">
          {REEL.map((r, n) => (
            <button key={n} role="tab" aria-selected={n === i} className={n === i ? 'on' : ''} onClick={() => setI(n)}>
              <b>{what(r)}</b>
              <span>{who(r)}, {levelName(r.level).toLowerCase()} portal</span>
            </button>
          ))}
        </div>
      </figcaption>
      <Reel key={i} route={REEL[i]} onDone={next} />
    </figure>
  );
}
