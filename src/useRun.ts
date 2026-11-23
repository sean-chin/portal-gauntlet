import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { play, referenceActions, type PolicyId } from './engine/bots';
import { initialState, pushFrames, step } from './engine/engine';
import { scoreRun, type Result } from './engine/score';
import type { Action, Cfg, Frame, State, World } from './engine/types';
import { buildWorld } from './engine/world';

export interface Live { world: World; state: State; frames: Frame[]; result: Result | null; dispatch: (a: Action) => void; botRunning: boolean }

export function useRun(cfg: Cfg, bot: PolicyId | null): Live {
  const world = useMemo(() => buildWorld(cfg), [cfg]);
  const [run, setRun] = useState<{ state: State; frames: Frame[] }>(() => ({ state: initialState(), frames: [] }));
  const cur = useRef(run);
  const t0 = useRef(performance.now());

  const apply = useCallback((a: Action, at: number): State => {
    const out = step(world, cur.current.state, a, at);
    if (out.state !== cur.current.state || out.evs.length) {
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
      const id = window.setInterval(() => {
        // Run forward to the next thing the bot actually does, then pause so a person can follow it.
        for (let i = 0; i < 60 && !r.done; i++) {
          const acted = r.value.action.type !== 'tick';
          r = g.next(apply(r.value.action, r.value.at));
          if (acted) break;
        }
        if (r.done) window.clearInterval(id);
      }, 420);
      return () => window.clearInterval(id);
    }
    const id = window.setInterval(() => apply({ type: 'tick' }, Math.round(performance.now() - t0.current)), 250);
    return () => window.clearInterval(id);
  }, [apply, bot, world]);

  const result = useMemo(() => (run.state.done ? scoreRun(world, run.state, run.frames, referenceActions(cfg)) : null), [run, world, cfg]);
  return { world, state: run.state, frames: run.frames, result, dispatch, botRunning: !!bot && !run.state.done };
}
