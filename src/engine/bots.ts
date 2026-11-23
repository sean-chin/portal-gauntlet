import { us } from './dates';
import { initialState, pushFrames, step } from './engine';
import { scoreRun, type Result } from './score';
import type { Action, Cfg, Frame, State, World } from './types';
import { buildWorld, canonicalForm, payerForm, sopAction, type FormId } from './world';

export interface Caps { dismiss: boolean; wait: boolean; relogin: boolean; retry: boolean; byLabel: boolean; matchMember: boolean; usDates: boolean; math: boolean }
export type PolicyId = 'recorded' | 'patched' | 'reference';
export const POLICIES: { id: PolicyId; name: string; blurb: string; caps: Caps }[] = [
  { id: 'recorded', name: 'Recorded script', blurb: 'Replays the happy path by screen position and never looks at what came back.',
    caps: { dismiss: false, wait: false, relogin: false, retry: false, byLabel: false, matchMember: false, usDates: false, math: false } },
  { id: 'patched', name: 'Patched script', blurb: 'The same script after a few incidents: waits for pages, closes pop-ups, retries, signs back in, fixes the date format.',
    caps: { dismiss: true, wait: true, relogin: true, retry: true, byLabel: false, matchMember: false, usDates: true, math: false } },
  { id: 'reference', name: 'Reference operator', blurb: 'Finds fields by label, checks whose row it picked and works out what the page leaves out. Proves every run can be solved.',
    caps: { dismiss: true, wait: true, relogin: true, retry: true, byLabel: true, matchMember: true, usDates: true, math: true } },
];

interface Mem { loggedIn: boolean; loginAt: number; payerDone: boolean; lastSubmit: boolean; read: Record<string, Record<string, string>> }
interface Ctx { w: World; s: State; mem: Mem; caps: Caps }
type Step = (c: Ctx) => Action | null;

const STEP_MS = 900;

function script(w: World): Step[] {
  const f = w.cfg.friction;
  const target = w.patients.find((p) => p.id === w.targetId)!;
  const date = (c: Ctx, iso: string) => (c.caps.usDates ? us(iso) : iso);
  const fill = (form: FormId, key: string, value: (c: Ctx) => string): Step => (c) => {
    const fields = payerForm(w.cfg, c.s.payer.sessionN, form);
    const k = c.caps.byLabel ? key : fields[canonicalForm(form).indexOf(key)].key;
    return { type: 'payer.set', key: k, value: value(c) };
  };
  const submit: Step = (c) => { c.mem.lastSubmit = true; return { type: 'payer.submit' }; };
  const pick: Step = (c) => ({
    type: 'payer.pick',
    index: c.caps.matchMember ? c.s.payer.results.findIndex((i) => w.members[i].dob === target.dob && w.members[i].first === target.first) : 0,
  });
  const signIn: Step[] = [
    (c) => { c.mem.loggedIn = true; return { type: 'payer.login', user: w.creds.user, pass: w.creds.pass }; },
    // The code lives in another tab, so reading it costs two tab switches, as it would for any agent.
    ...(f.mfa ? [(() => ({ type: 'tab', tab: 'auth' })) as Step, (() => ({ type: 'tab', tab: 'payer' })) as Step, ((c) => ({ type: 'payer.mfa', code: c.s.payer.mfaCode })) as Step] : []),
  ];
  const lookup: Step[] = [fill('lookup', 'memberId', () => target.memberId), fill('lookup', 'dob', (c) => date(c, target.dob)), submit, pick];
  const write = (id: string, values: (c: Ctx) => Record<string, string>): Step[] => [
    () => ({ type: 'ehr.open', id }),
    ...Array.from({ length: 6 }, (_, i): Step => (c) => { const e = Object.entries(values(c)).filter(([, v]) => v !== '')[i]; return e ? { type: 'ehr.set', key: e[0], value: e[1] } : null; }),
    () => ({ type: 'ehr.save' }),
  ];
  const leavePortal: Step = (c) => { c.mem.payerDone = true; return { type: 'tab', tab: 'ehr' }; };
  const finish: Step = () => ({ type: 'finish' });
  const toPortal: Step = () => ({ type: 'tab', tab: 'payer' });

  if (w.cfg.task === 'eligibility') {
    return [toPortal, ...signIn, () => ({ type: 'payer.nav', screen: 'elig' }), ...lookup,
      (c) => {
        const p = c.s.payer;
        if (p.screen !== 'eligDetail') return null;
        const m = w.members[p.memberIdx];
        c.mem.read.elig = m.active
          ? { status: 'Active', plan: m.plan, copay: String(m.copay[target.visit]), dedRemaining: c.caps.math || !f.mathDeductible ? String(m.deductible - m.met) : '', ref: m.ref }
          : { status: 'Inactive', termDate: us(m.termDate), ref: m.ref };
        return null;
      },
      leavePortal, ...write(target.id, (c) => c.mem.read.elig ?? {}), finish];
  }
  if (w.cfg.task === 'prior-auth') {
    const o = w.order!;
    return [() => ({ type: 'ehr.open', id: target.id }), toPortal, ...signIn, () => ({ type: 'payer.nav', screen: 'pa1' }), ...lookup,
      fill('pa2', 'cpt', () => o.cpt), fill('pa2', 'icd', () => o.icd), fill('pa2', 'dos', (c) => date(c, o.dos)), fill('pa2', 'pos', () => o.pos), fill('pa2', 'units', () => String(o.units)),
      () => (o.urgent ? { type: 'payer.set', key: 'urgent', value: 'yes' } : null), submit,
      fill('pa3', 'npi', () => o.npi), fill('pa3', 'provider', () => o.provider), submit, submit,
      (c) => { if (c.s.payer.screen === 'paDone') c.mem.read.pa = { paRef: w.pa!.ref, paStatus: w.pa!.status }; return null; },
      leavePortal, ...write(target.id, (c) => c.mem.read.pa ?? {}), finish];
  }
  const mine = w.claims.filter((c) => c.mine);
  return [toPortal, ...signIn, () => ({ type: 'payer.nav', screen: 'claims' }),
    ...mine.flatMap((cl): Step[] => [
      fill('claims', 'claimNo', () => cl.no), submit,
      (c) => {
        if (c.s.payer.screen === 'claimDetail' && c.s.payer.claimNo === cl.no) {
          // With the history showing, a script that reads the first line gets a status the claim no longer has.
          const line = f.history && !c.caps.math ? cl.history[0] : cl;
          c.mem.read[cl.no] = { status: line.status, paid: line.status === 'Paid' ? String(line.paid) : '', carc: line.carc, action: sopAction(line) };
        }
        return null;
      },
      () => ({ type: 'payer.back' }),
    ]),
    leavePortal,
    ...mine.flatMap((cl): Step[] => [...write(cl.no, (c) => c.mem.read[cl.no] ?? {}), () => ({ type: 'ehr.back' })]),
    finish];
}

export interface Run { world: World; frames: Frame[]; state: State; result: Result }

/** A bot as a generator of timed actions, so the UI can play it live and tests can run it flat out. */
export function* play(w: World, policy: PolicyId): Generator<{ at: number; action: Action }, void, State> {
  const caps = POLICIES.find((p) => p.id === policy)!.caps;
  const steps = script(w);
  const mem: Mem = { loggedIn: false, loginAt: 0, payerDone: false, lastSubmit: false, read: {} };
  mem.loginAt = w.cfg.task === 'prior-auth' ? 2 : 1;
  let pc = 0;
  let at = 0;
  let s: State = yield { at, action: { type: 'tick' } };
  for (let n = 0; n < 400 && pc < steps.length && !s.done; n++) {
    at += STEP_MS;
    s = yield { at, action: { type: 'tick' } };
    const p = s.payer;
    if (p.loading && caps.wait) continue;
    if (p.modal && caps.dismiss) {
      s = yield { at, action: { type: 'payer.modal', choice: p.modal === 'expiring' ? 'stay' : p.modal === 'withdraw' ? 'cancel' : 'dismiss' } };
      continue;
    }
    if (caps.relogin && mem.loggedIn && !mem.payerDone && p.session === 'out') { pc = mem.loginAt; mem.loggedIn = false; mem.lastSubmit = false; }
    if (caps.retry && mem.lastSubmit && p.error.includes('temporarily')) { s = yield { at, action: { type: 'payer.submit' } }; continue; }
    mem.lastSubmit = false;
    const action = steps[pc++]({ w, s, mem, caps });
    if (action) s = yield { at, action };
  }
}

const refCache = new Map<string, number>();
export function referenceActions(cfg: Cfg): number {
  const key = `${cfg.task}|${cfg.seed}|${cfg.level}`;
  if (!refCache.has(key)) refCache.set(key, simulate(cfg, 'reference', true).frames.filter((f) => f.ev.who === 'agent').length);
  return refCache.get(key)!;
}

export function simulate(cfg: Cfg, policy: PolicyId, isReference = false): Run {
  const world = buildWorld(cfg);
  let state = initialState();
  let frames: Frame[] = [];
  const g = play(world, policy);
  let r = g.next(state);
  while (!r.done) {
    const out = step(world, state, r.value.action, r.value.at);
    state = out.state;
    frames = pushFrames(frames, out.evs, state);
    r = g.next(state);
  }
  const ref = isReference ? frames.filter((f) => f.ev.who === 'agent').length : referenceActions(cfg);
  return { world, frames, state, result: scoreRun(world, state, frames, ref) };
}
