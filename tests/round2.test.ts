import { describe, expect, it } from 'vitest';
import { simulate, play } from '../src/engine/bots';
import { initialState, pushFrames, step } from '../src/engine/engine';
import { scoreRun } from '../src/engine/score';
import type { Frame, TaskId } from '../src/engine/types';
import { buildWorld, makeCfg, MIXABLE } from '../src/engine/world';
import { rerun, validate } from '../src/replay';
import { parseRoute, runHref } from '../src/route';
import type { Logged } from '../src/useRun';

const TASKS: TaskId[] = ['eligibility', 'prior-auth', 'claim-status'];

describe('custom mixes', () => {
  it('reference solves every single obstacle on its own', () => {
    for (const k of MIXABLE) for (const task of TASKS) for (let seed = 1; seed <= 12; seed++) {
      const r = simulate(makeCfg(task, seed, 'custom', [k]), 'reference').result;
      expect({ k, task, seed, verdict: r.verdict, score: r.score }).toEqual({ k, task, seed, verdict: 'pass', score: 100 });
    }
  });
  it('reference solves arbitrary mixes', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const only = MIXABLE.filter((_, i) => ((seed * 2654435761) >>> i) & 1);
      for (const task of TASKS) expect({ seed, only, v: simulate(makeCfg(task, seed, 'custom', only), 'reference').result.verdict }).toEqual({ seed, only, v: 'pass' });
    }
  });
  it('round-trips through the URL and drops unknown obstacles', () => {
    const r = parseRoute('#/run?task=prior-auth&level=custom&seed=4&fr=clinical,bogus,mfa');
    expect(r).toMatchObject({ page: 'run', level: 'custom', only: ['mfa', 'clinical'] });
    if (r.page === 'run') expect(parseRoute(runHref(r))).toEqual(r);
  });
});

describe('clinical questions', () => {
  it('a script that replays stock answers is caught on most seeds, and flagged as harm', () => {
    let unsafe = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = simulate(makeCfg('prior-auth', seed, 'custom', ['clinical']), 'patched').result;
      if (r.verdict === 'unsafe') { unsafe++; expect(r.causes.map((c) => c.id)).toContain('false-answer'); }
    }
    expect(unsafe).toBeGreaterThan(25);
    expect(unsafe).toBeLessThan(40);
  });
  it('will not move on with a question unanswered', () => {
    const w = buildWorld(makeCfg('prior-auth', 3, 'custom', ['clinical']));
    let s = initialState();
    s = { ...s, payer: { ...s.payer, session: 'in', screen: 'paQ', form: { q1: 'Yes' } } };
    const out = step(w, s, { type: 'payer.submit' }, 5);
    expect(out.state.payer.screen).toBe('paQ');
    expect(out.state.payer.error).toMatch(/every question/);
  });
});

describe('diagnosis', () => {
  it('names a cause for every scripted run that falls short', () => {
    for (const level of ['typical', 'hostile'] as const) for (const task of TASKS) for (const bot of ['recorded', 'patched'] as const) for (let seed = 1; seed <= 15; seed++) {
      const r = simulate(makeCfg(task, seed, level), bot).result;
      if (r.verdict !== 'pass') expect({ task, level, bot, seed, n: r.causes.length > 0 }).toEqual({ task, level, bot, seed, n: true });
      else expect(r.causes).toEqual([]);
    }
  });
});

describe('replay links', () => {
  it('rebuild the same result from the logged actions', () => {
    for (const bot of ['recorded', 'patched', 'reference'] as const) for (const task of TASKS) {
      const cfg = makeCfg(task, 6, 'hostile');
      const w = buildWorld(cfg);
      let state = initialState();
      let frames: Frame[] = [];
      const log: Logged[] = [];
      const g = play(w, bot);
      let r = g.next(state);
      while (!r.done) {
        const out = step(w, state, r.value.action, r.value.at);
        if (out.state !== state || out.evs.length) log.push([r.value.at, r.value.action]);
        state = out.state; frames = pushFrames(frames, out.evs, state);
        r = g.next(state);
      }
      const clean = validate(JSON.parse(JSON.stringify(log)))!;
      const again = rerun(w, clean);
      expect(scoreRun(w, again.state, again.frames, 30)).toEqual(scoreRun(w, state, frames, 30));
    }
  });
  it('rejects anything that is not a list of known actions', () => {
    expect(validate([[0, { type: 'finish' }]])).toHaveLength(1);
    expect(validate([[0, { type: 'eval', code: 'x' }]])).toBeNull();
    expect(validate([[5, { type: 'finish' }], [1, { type: 'finish' }]])).toBeNull();
    expect(validate([[0, { type: 'ehr.set', key: 'a', value: 'x'.repeat(500) }]])).toBeNull();
    expect(validate({})).toBeNull();
    expect(validate([[0, { type: 'tab', tab: 'ehr', extra: '<script>' }]])).toEqual([[0, { type: 'tab', tab: 'ehr' }]]);
  });
});

import { readSummary } from '../src/ui/Report';
describe('results file', () => {
  it('keeps known fields and throws away the rest', () => {
    const g = readSummary({ agent: 'mine<script>', rows: [
      { task: 'eligibility', level: 'calm', seed: 1, verdict: 'pass', score: 100, actions: 20, reference: 16, causes: [], replay: 'https://x.example/#/replay?task=eligibility&level=calm&seed=1&log=zAbC_-' },
      { task: 'eligibility', level: 'hostile', seed: 2, verdict: 'weird', score: 900, causes: ['popup', 'made-up'], replay: 'javascript:alert(1)' },
      { task: 'nope', level: 'calm', seed: 3 },
    ] })!;
    expect(g.name).toBe('minescript');
    expect(g.rows).toHaveLength(2);
    expect(g.rows[0].href).toBe('#/replay?task=eligibility&level=calm&seed=1&log=zAbC_-');
    expect(g.rows[1]).toMatchObject({ verdict: 'error', score: 100, causes: ['popup'], href: '#/run?task=eligibility&level=hostile&seed=2' });
    expect(readSummary({ rows: 'x' })).toBeNull();
    expect(readSummary(null)).toBeNull();
  });
});
describe('diagnosis wording', () => {
  it('tells a wrong date format apart from a value in the wrong box', () => {
    const fmt = simulate(makeCfg('eligibility', 2, 'custom', ['strictDates']), 'recorded').result;
    expect(fmt.causes.map((c) => c.id)).toContain('date-format');
    const box = simulate(makeCfg('eligibility', 2, 'custom', ['shuffle']), 'patched').result;
    expect(box.causes.map((c) => c.id)).toContain('wrong-field');
    expect(box.causes.map((c) => c.id)).not.toContain('date-format');
  });
});
