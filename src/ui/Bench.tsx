import { useEffect, useMemo, useRef, useState } from 'react';
import { POLICIES, type PolicyId } from '../engine/bots';
import type { Cfg } from '../engine/types';
import { FRICTION_INFO, LEVELS, makeCfg, TASKS } from '../engine/world';
import { runHref, type RunRoute } from '../route';
import { useRun } from '../useRun';
import { Ehr } from './Ehr';
import { Pointer } from './Pointer';
import { Portal } from './Portal';
import { ResultView } from './Result';

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export function Bench({ route }: { route: RunRoute }) {
  const cfg: Cfg = useMemo(() => makeCfg(route.task, route.seed, route.level), [route.task, route.seed, route.level]);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ctl = useMemo(() => ({ paused, speed }), [paused, speed]);
  const live = useRun(cfg, route.bot, ctl);
  const box = useRef<HTMLDivElement>(null);
  const { world: w, state: s, dispatch, result } = live;
  const task = TASKS.find((t) => t.id === cfg.task)!;
  const level = LEVELS.find((l) => l.id === cfg.level)!;
  const policy = POLICIES.find((p) => p.id === route.bot);
  const [confirm, setConfirm] = useState(false);
  // The engine clock only moves when something happens, so people get a wall clock of their own.
  const [wall, setWall] = useState(0);
  useEffect(() => {
    if (route.bot || s.done) return;
    const t0 = performance.now();
    const id = window.setInterval(() => setWall(performance.now() - t0), 1000);
    return () => window.clearInterval(id);
  }, [route.bot, s.done]);

  // What a harness reads: the brief while the run is live, the scorecard once it is over. Never the answers.
  useEffect(() => {
    const api = {
      task: { id: cfg.task, level: cfg.level, seed: cfg.seed, brief: w.brief, signIn: w.creds },
      done: () => s.done,
      result: () => result,
    };
    (window as unknown as { gauntlet: typeof api }).gauntlet = api;
  }, [cfg, w, s.done, result]);

  const on = FRICTION_INFO.filter((f) => cfg.friction[f.key]);
  const tabs: { id: 'ehr' | 'payer' | 'auth'; label: string }[] = [{ id: 'ehr', label: 'Larkspur EHR' }, { id: 'payer', label: 'Harborline provider portal' }];
  if (cfg.friction.mfa) tabs.push({ id: 'auth', label: 'Authenticator' });

  return (
    <div className="bench">
      <aside className="rail">
        <a className="brand" href="#/">Portal Gauntlet</a>
        <h1>{task.name}</h1>
        <p className="rail-meta">{level.name} difficulty, seed {cfg.seed}{policy ? `, played by the ${policy.name.toLowerCase()}` : ''}</p>
        <section data-testid="work-order">
          <h2>Work order</h2>
          {w.brief.map((line) => <p key={line}>{line}</p>)}
        </section>
        <section>
          <h2>Portal sign-in</h2>
          <dl className="creds">
            <dt>Username</dt><dd data-testid="cred-user">{w.creds.user}</dd>
            <dt>Password</dt><dd data-testid="cred-pass">{w.creds.pass}</dd>
          </dl>
        </section>
        <section>
          <h2>What this portal does today</h2>
          {on.length === 0 ? <p>Nothing unusual.</p> : <ul className="plain">{on.map((f) => <li key={f.key}>{f.name}</li>)}</ul>}
        </section>
        {!s.done && (
          <section className="rail-end">
            <p className="timer" aria-live="off">{clock(route.bot ? s.now : wall)} elapsed, {live.frames.filter((f) => f.ev.who === 'agent').length} actions</p>
            {!route.bot && (confirm ? (
              <div className="confirm">
                <p>End the run and score it?</p>
                <button type="button" className="btn solid" data-testid="finish-confirm" onClick={() => dispatch({ type: 'finish' })}>Yes, score it</button>
                <button type="button" className="btn" onClick={() => setConfirm(false)}>Keep working</button>
              </div>
            ) : <button type="button" className="btn solid" data-testid="finish" onClick={() => setConfirm(true)}>Mark work order complete</button>)}
          </section>
        )}
        {s.done && (
          <section className="rail-end">
            {route.bot ? <a className="btn solid" href={runHref({ ...route, bot: null })}>Try this run yourself</a>
              : <button type="button" className="btn solid" onClick={() => window.location.reload()}>Run it again</button>}
            <a className="btn" href={runHref({ ...route, seed: route.seed + 1 })}>Next seed</a>
          </section>
        )}
      </aside>
      <main className="stage">
        {result ? <ResultView live={live} route={route} /> : (
          <>
            <div className="live" ref={box}>
            <div className="tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={s.tab === t.id} data-testid={`tab-${t.id}`} {...(route.bot ? { 'data-act': `tab:${t.id}` } : {})} className={s.tab === t.id ? 'tab on' : 'tab'} onClick={() => dispatch({ type: 'tab', tab: t.id })}>{t.label}</button>
              ))}
            </div>
            <div className="screen" role="tabpanel">
              {s.tab === 'ehr' && <Ehr world={w} state={s} dispatch={dispatch} frozen={!!route.bot} />}
              {s.tab === 'payer' && <Portal world={w} state={s} dispatch={dispatch} frozen={!!route.bot} />}
              {s.tab === 'auth' && (
                <div className="auth" data-app="authenticator">
                  <h2>Authenticator</h2>
                  {s.payer.session === 'mfa'
                    ? <><p>Harborline provider portal</p><p className="code" data-testid="auth-code">{s.payer.mfaCode}</p><p>This code is for the sign-in that is waiting now.</p></>
                    : <p>No sign-in is waiting for a code.</p>}
                </div>
              )}
            </div>
            {route.bot && <Pointer point={live.point} box={box} />}
            </div>
            {route.bot && (
              <div className="botbar">
                <button type="button" className="btn small" onClick={() => setPaused((x) => !x)}>{paused ? 'Resume' : 'Pause'}</button>
                <label>Speed
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                    <option value={0.5}>Half</option><option value={1}>Normal</option><option value={2}>Double</option><option value={6}>Fast</option>
                  </select>
                </label>
                <span className="muted">A scripted run, not a language model.</span>
              </div>
            )}
            <BotLine frames={live.frames} bot={route.bot} />
          </>
        )}
      </main>
    </div>
  );
}

function BotLine({ frames, bot }: { frames: ReturnType<typeof useRun>['frames']; bot: PolicyId | null }) {
  if (!bot) return null;
  const last = frames.slice(-3);
  return (
    <ol className="botline" aria-live="polite">
      {last.map((f, i) => <li key={`${f.ev.at}-${i}`} className={f.ev.ok ? (f.ev.who === 'system' ? 'sys' : '') : 'bad'}>{f.ev.who === 'system' ? 'Portal: ' : ''}{f.ev.text}{f.ev.ok ? '' : ' (nothing happened)'}</li>)}
    </ol>
  );
}
