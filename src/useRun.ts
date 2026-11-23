import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { play, referenceActions, type PolicyId } from './engine/bots';
import { initialState, pushFrames, step } from './engine/engine';
import { scoreRun, type Result } from './engine/score';
import type { Action, Cfg, Frame, State, World } from './engine/types';
import { buildWorld } from './engine/world';

export interface Point { action: Action; n: number }
export interface Ctl { paused: boolean; speed: number }
export type Logged = [number, Action];
export interface Live {
  world: World; state: State; frames: Frame[]; result: Result | null; dispatch: (a: Action) => void;
  botRunning: boolean; point: Point | null; log: () => Logged[];
}

/** Drops the keystrokes that led up to a field's final value, which is all a replay needs. */
function pushLog(log: Logged[], at: number, a: Action): void {
  const last = log[log.length - 1]?.[1];
  if (last && (a.type === 'payer.set' || a.type === 'ehr.set') && last.type === a.type && last.key === a.key) log[log.length - 1] = [at, a];
  else log.push([at, a]);
}

export function useRun(cfg: Cfg, bot: PolicyId | null, ctl?: Ctl): Live {
  const world = useMemo(() => buildWorld(cfg), [cfg]);
  const [run, setRun] = useState<{ state: State; frames: Frame[] }>(() => ({ state: initialState(), frames: [] }));
  const [point, setPoint] = useState<Point | null>(null);
  const cur = useRef(run);
  const logRef = useRef<Logged[]>([]);
  const t0 = useRef(performance.now());
  const ctlRef = useRef(ctl);
  ctlRef.current = ctl;

  const apply = useCallback((a: Action, at: number): State => {
    const out = step(world, cur.current.state, a, at);
    if (out.state !== cur.current.state || out.evs.length) {
      pushLog(logRef.current, at, a);
      cur.current = { state: out.state, frames: pushFrames(cur.current.frames, out.evs, out.state) };
      setRun(cur.current);
    }
    return cur.current.state;
  }, [world]);

  const dispatch = useCallback((a: Action) => { if (!bot) apply(a, Math.round(performance.now() - t0.current)); }, [apply, bot]);

  useEffect(() => {
    if (bot) {
      const g = play(world, bot);
      let r = g.next(cur.current.state);
      let timer = 0;
      let dead = false;
      let n = 0;
      const wait = (ms: number, fn: () => void) => { timer = window.setTimeout(fn, ms / (ctlRef.current?.speed ?? 1)); };
      // One beat per thing the bot does: the pointer travels to its target, then the action lands.
      const loop = (): void => {
        if (dead || r.done) return;
        if (ctlRef.current?.paused) { wait(150, loop); return; }
        const { action, at } = r.value;
        if (action.type === 'tick') {
          const st = apply(action, at);
          r = g.next(st);
          if (st.payer.loading) wait(170, loop); else loop();
          return;
        }
        setPoint({ action, n: ++n });
        wait(250, () => { if (dead) return; r = g.next(apply(action, at)); wait(190, loop); });
      };
      wait(350, loop);
      return () => { dead = true; window.clearTimeout(timer); };
    }
    const id = window.setInterval(() => apply({ type: 'tick' }, Math.round(performance.now() - t0.current)), 250);
    return () => window.clearInterval(id);
  }, [apply, bot, world]);

  const result = useMemo(() => (run.state.done ? scoreRun(world, run.state, run.frames, referenceActions(cfg)) : null), [run, world, cfg]);
  const log = useCallback(() => logRef.current, []);
  return { world, state: run.state, frames: run.frames, result, dispatch, botRunning: !!bot && !run.state.done, point, log };
}
