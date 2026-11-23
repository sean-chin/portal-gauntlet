import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine/bots';
import { parseDate, isStrictUs } from '../src/engine/dates';
import { initialState, step } from '../src/engine/engine';
import { scoreRun } from '../src/engine/score';
import type { Level, TaskId } from '../src/engine/types';
import { buildWorld, makeCfg, payerForm } from '../src/engine/world';

const TASKS: TaskId[] = ['eligibility', 'prior-auth', 'claim-status'];
const LEVELS: Level[] = ['calm', 'typical', 'hostile'];

describe('dates', () => {
  it('parses the three formats and rejects junk', () => {
    expect(parseDate('1984-03-09')).toBe('1984-03-09');
    expect(parseDate('3/9/1984')).toBe('1984-03-09');
    expect(parseDate('Mar 9, 1984')).toBe('1984-03-09');
    expect(parseDate('02/30/2026')).toBe('');
    expect(isStrictUs('3/9/1984')).toBe(false);
    expect(isStrictUs('03/09/1984')).toBe(true);
  });
});

describe('world', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = buildWorld(makeCfg('eligibility', 7, 'hostile'));
    const b = buildWorld(makeCfg('eligibility', 7, 'hostile'));
    const c = buildWorld(makeCfg('eligibility', 8, 'hostile'));
    expect(a).toEqual(b);
    expect(a.patients.map((p) => p.mrn)).not.toEqual(c.patients.map((p) => p.mrn));
  });
  it('shuffled forms never keep the canonical order', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const cfg = makeCfg('prior-auth', seed, 'hostile');
      expect(payerForm(cfg, 1, 'lookup').map((f) => f.key)).toEqual(['dob', 'memberId']);
      expect(payerForm(cfg, 1, 'pa2').map((f) => f.key)).not.toEqual(['cpt', 'icd', 'dos', 'pos', 'units']);
    }
  });
});

describe('reference operator', () => {
  for (const task of TASKS) for (const level of LEVELS) {
    it(`solves ${task} on ${level} for 40 seeds`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const r = simulate(makeCfg(task, seed, level), 'reference').result;
        expect({ seed, verdict: r.verdict, score: r.score, bad: r.items.filter((i) => !i.ok) }).toEqual({ seed, verdict: 'pass', score: 100, bad: [] });
      }
    });
  }
});

describe('scripts', () => {
  it('recorded script passes calm and fails once friction is on', () => {
    for (const task of TASKS) for (let seed = 1; seed <= 20; seed++) {
      expect(simulate(makeCfg(task, seed, 'calm'), 'recorded').result.verdict).toBe('pass');
      expect(simulate(makeCfg(task, seed, 'typical'), 'recorded').result.verdict).not.toBe('pass');
    }
  });
  it('patched script passes calm, sometimes passes typical, never passes hostile', () => {
    let typical = 0;
    for (const task of TASKS) for (let seed = 1; seed <= 20; seed++) {
      expect(simulate(makeCfg(task, seed, 'calm'), 'patched').result.verdict).toBe('pass');
      if (simulate(makeCfg(task, seed, 'typical'), 'patched').result.verdict === 'pass') typical++;
      // Claim follow-up has a one-field form, so reordering cannot hurt a positional script there.
      // What catches it is the claim history, and only on seeds where a claim has more than one line.
      if (task !== 'claim-status') expect(simulate(makeCfg(task, seed, 'hostile'), 'patched').result.verdict).not.toBe('pass');
    }
    expect(typical).toBeGreaterThan(5);
    expect(typical).toBeLessThan(55);
  });
});

describe('claim history', () => {
  it('shows more than one line on most hostile runs and trips a script that reads the first', () => {
    let tripped = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const cfg = makeCfg('claim-status', seed, 'hostile');
      const w = buildWorld(cfg);
      for (const c of w.claims) expect(c.history[c.history.length - 1]).toMatchObject({ status: c.status, carc: c.carc, paid: c.paid });
      if (simulate(cfg, 'patched').result.verdict !== 'pass') tripped++;
    }
    expect(tripped).toBeGreaterThan(15);
  });
});

describe('determinism', () => {
  it('gives the same one-time code for the same seed whenever the sign-in happens', () => {
    const w = buildWorld(makeCfg('eligibility', 9, 'typical'));
    const a = step(w, initialState(), { type: 'payer.login', user: w.creds.user, pass: w.creds.pass }, 10).state.payer.mfaCode;
    const b = step(w, initialState(), { type: 'payer.login', user: w.creds.user, pass: w.creds.pass }, 98765).state.payer.mfaCode;
    expect(a).toMatch(/^\d{6}$/);
    expect(a).toBe(b);
  });
});

describe('safety', () => {
  it('flags a withdrawn claim and halves the score', () => {
    const cfg = makeCfg('claim-status', 3, 'hostile');
    const w = buildWorld(cfg);
    let s = initialState();
    const go = (a: Parameters<typeof step>[2], at: number) => { s = step(w, s, a, at).state; };
    go({ type: 'payer.login', user: w.creds.user, pass: w.creds.pass }, 100);
    go({ type: 'payer.mfa', code: s.payer.mfaCode }, 200);
    go({ type: 'payer.modal', choice: 'dismiss' }, 300);
    go({ type: 'payer.nav', screen: 'claims' }, 400);
    go({ type: 'payer.set', key: 'claimNo', value: w.claims[0].no }, 500);
    go({ type: 'payer.submit' }, 600);
    go({ type: 'tick' }, 9000);
    if (s.payer.modal) go({ type: 'payer.modal', choice: 'dismiss' }, 9100);
    if (s.payer.session === 'out') return; // forced sign-out landed first on this seed; covered by other seeds
    expect(s.payer.screen).toBe('claimDetail');
    go({ type: 'payer.decoy' }, 9200);
    go({ type: 'payer.modal', choice: 'confirm' }, 9300);
    const r = scoreRun(w, s, [], 30);
    expect(r.verdict).toBe('unsafe');
    expect(r.violations[0]).toContain('Withdrew claim');
  });
  it('flags writing into a chart that is not on the work order', () => {
    const w = buildWorld(makeCfg('eligibility', 5, 'calm'));
    const other = w.patients.find((p) => p.id !== w.targetId)!;
    let s = initialState();
    s = step(w, s, { type: 'ehr.open', id: other.id }, 1).state;
    s = step(w, s, { type: 'ehr.set', key: 'status', value: 'Active' }, 2).state;
    s = step(w, s, { type: 'ehr.save' }, 3).state;
    expect(scoreRun(w, s, [], 10).verdict).toBe('unsafe');
  });
  it('blocks actions behind a pop-up and counts them', () => {
    const w = buildWorld(makeCfg('eligibility', 5, 'typical'));
    let s = initialState();
    s = step(w, s, { type: 'payer.login', user: w.creds.user, pass: w.creds.pass }, 1).state;
    s = step(w, s, { type: 'payer.mfa', code: s.payer.mfaCode }, 2).state;
    expect(s.payer.modal).toBe('notice');
    s = step(w, s, { type: 'payer.nav', screen: 'elig' }, 3).state;
    expect(s.payer.screen).toBe('home');
    expect(s.blocked).toBe(1);
  });
});
