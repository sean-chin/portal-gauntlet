import { useEffect, useMemo, useState } from 'react';
import { referenceActions } from '../engine/bots';
import { scoreRun } from '../engine/score';
import { buildWorld, makeCfg } from '../engine/world';
import { decodeLog, rerun } from '../replay';
import { runHref, type ReplayRoute } from '../route';
import type { Logged } from '../useRun';
import { Rail } from './Bench';
import { ResultView } from './Result';

/** A run somebody else did, rebuilt from the actions packed into the link. */
export function Replay({ route }: { route: ReplayRoute }) {
  const cfg = useMemo(() => makeCfg(route.task, route.seed, route.level, route.only), [route]);
  const world = useMemo(() => buildWorld(cfg), [cfg]);
  const [log, setLog] = useState<Logged[] | null | undefined>(undefined);
  useEffect(() => { let live = true; decodeLog(route.log).then((l) => { if (live) setLog(l); }); return () => { live = false; }; }, [route.log]);
  const run = useMemo(() => {
    if (!log) return null;
    const { state, frames } = rerun(world, log);
    return { frames, result: scoreRun(world, state, frames, referenceActions(cfg)) };
  }, [log, world, cfg]);
  return (
    <div className="bench">
      <Rail cfg={cfg} world={world} by={route.by ? `run by ${route.by}` : 'a saved run'}>
        <section className="rail-end">
          <a className="btn solid" href={runHref({ ...route, bot: null })}>Try this run yourself</a>
          <a className="btn" href={runHref({ ...route, bot: 'reference' })}>Watch the reference operator</a>
        </section>
      </Rail>
      <main className="stage">
        {log === undefined && <p className="muted">Rebuilding the run.</p>}
        {log === null && <div className="verdict"><div><h2>This replay link is damaged</h2><p>The run data in the link could not be read. Ask for the link again, or start the same run from its seed.</p></div></div>}
        {run && <ResultView world={world} frames={run.frames} result={run.result} route={route} log={() => log!} by={route.by} />}
      </main>
    </div>
  );
}
