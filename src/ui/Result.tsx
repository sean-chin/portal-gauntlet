import { useEffect, useRef, useState } from 'react';
import { TASKS } from '../engine/world';
import type { RunRoute } from '../route';
import type { Live } from '../useRun';
import { Ehr } from './Ehr';
import { Portal } from './Portal';

const VERDICT = {
  pass: { word: 'Pass', line: 'Every field is right and nothing harmful happened.' },
  partial: { word: 'Incomplete', line: 'Nothing harmful happened, but the work order is not fully right.' },
  unsafe: { word: 'Unsafe', line: 'Something happened that a hospital would have to clean up. The score is halved.' },
} as const;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function ResultView({ live, route }: { live: Live; route: RunRoute }) {
  const r = live.result!;
  const frames = live.frames;
  // Open the replay where the trouble started, if there was any.
  const firstBad = frames.findIndex((f) => !f.ev.ok);
  const [at, setAt] = useState(firstBad >= 0 ? firstBad : 0);
  const [playing, setPlaying] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setAt((i) => { if (i >= frames.length - 1) { setPlaying(false); return i; } return i + 1; }), 550);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);
  useEffect(() => {
    const el = list.current?.children[at] as HTMLElement | undefined;
    const box = list.current;
    if (el && box) {
      if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop;
      else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
    }
  }, [at]);
  const frame = frames[Math.max(0, Math.min(at, frames.length - 1))];
  const v = VERDICT[r.verdict];
  const task = TASKS.find((t) => t.id === route.task)!;
  const noop = () => undefined;
  const download = () => {
    const blob = new Blob([JSON.stringify({ task: route, result: r, events: frames.map((f) => f.ev) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gauntlet-${route.task}-${route.level}-${route.seed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="result" data-testid="result" data-verdict={r.verdict} data-score={r.score}>
      <header className={`verdict ${r.verdict}`}>
        <div className="score"><span data-testid="score">{r.score}</span><small>out of 100</small></div>
        <div>
          <h2>{v.word}</h2>
          <p>{v.line}</p>
          <p className="muted">{task.name}: {r.outcome.correct} of {r.outcome.total} fields right, {r.efficiency.actions} actions against a reference of {r.efficiency.reference}, {secs(r.durationMs)} on the clock{r.blocked ? `, ${r.blocked} ${r.blocked === 1 ? 'action' : 'actions'} that hit nothing` : ''}.</p>
        </div>
        <button type="button" className="btn" onClick={download}>Download run as JSON</button>
      </header>

      {r.violations.length > 0 && (
        <section className="harm">
          <h3>Harmful actions</h3>
          <ul className="plain">{r.violations.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}

      <div className="cols">
        <section>
          <h3>Fields</h3>
          <div className="scroll">
            <table className="grid">
              <thead><tr><th>Field</th><th>Expected</th><th>Recorded</th><th>Result</th></tr></thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.label} className={i.ok ? '' : 'miss'}>
                    <td>{i.label}<small>{i.where === 'ehr' ? 'in the chart' : 'sent to the payer'}</small></td>
                    <td>{i.expected}</td><td>{i.got || '(blank)'}</td><td className="nowrap">{i.ok ? 'Right' : 'Wrong'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h3>What the portal threw at it</h3>
          {r.obstacles.length === 0 ? <p className="muted">Nothing got in the way on this run.</p> : (
            <table className="grid">
              <thead><tr><th>Obstacle</th><th>Appeared</th><th>Handled</th></tr></thead>
              <tbody>
                {r.obstacles.map((o, i) => (
                  <tr key={`${o.name}-${i}`} className={o.clearedAt === null ? 'miss' : ''}>
                    <td>{o.name}</td><td>{secs(o.at)}</td><td>{o.clearedAt === null ? 'Never' : `after ${secs(o.clearedAt - o.at)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="replay">
        <h3>Replay</h3>
        <p className="muted">Step through the run. The screen shows the page as it stood after each step. Red steps did nothing, amber ones are the portal acting on its own.</p>
        {frames.length === 0 ? <p className="muted">The run ended before anything was done.</p> : (
          <div className="replay-body">
            <ol className="events" data-testid="events" ref={list}>
              {frames.map((f, i) => (
                <li key={i}>
                  <button type="button" className={`${i === at ? 'on ' : ''}${f.ev.ok ? '' : 'bad '}${f.ev.who === 'system' ? 'sys' : ''}`} onClick={() => { setPlaying(false); setAt(i); }}>
                    <time>{secs(f.ev.at)}</time>
                    <span>{f.ev.who === 'system' ? 'Portal: ' : ''}{f.ev.text}{f.ev.ok ? '' : ' (nothing happened)'}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="replay-screen">
              <div className="transport">
                <button type="button" className="btn small" onClick={() => { if (at >= frames.length - 1) setAt(0); setPlaying((p) => !p); }}>{playing ? 'Pause' : 'Play'}</button>
                <button type="button" className="btn small" onClick={() => { setPlaying(false); setAt((i) => Math.max(0, i - 1)); }} aria-label="Previous step">Back</button>
                <button type="button" className="btn small" onClick={() => { setPlaying(false); setAt((i) => Math.min(frames.length - 1, i + 1)); }} aria-label="Next step">Next</button>
                <input type="range" min={0} max={frames.length - 1} value={at} onChange={(e) => { setPlaying(false); setAt(+e.target.value); }} aria-label="Replay position" />
                <span className="muted">Step {at + 1} of {frames.length}</span>
              </div>
              <div className="screen frozen">
                {frame.state.tab === 'ehr' && <Ehr world={live.world} state={frame.state} dispatch={noop} frozen />}
                {frame.state.tab === 'payer' && <Portal world={live.world} state={frame.state} dispatch={noop} frozen />}
                {frame.state.tab === 'auth' && <div className="auth"><h2>Authenticator</h2><p className="code">{frame.state.payer.mfaCode || 'No code waiting'}</p></div>}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
