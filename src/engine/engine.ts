import { isStrictUs, parseDate } from './dates';
import { rng } from './rng';
import type { Action, Ev, Frame, ModalKind, PayerState, State, World } from './types';

export function initialState(): State {
  return {
    tab: 'ehr', now: 0,
    ehr: { screen: 'list', recordId: '', form: {}, saved: {}, banner: '' },
    payer: {
      session: 'out', sessionN: 0, lastActive: 0, screen: 'login', form: {}, error: '', modal: null, loading: null,
      results: [], memberIdx: -1, claimNo: '', submitted: null, submittedMember: -1, actions: 0, lastSetKey: '',
      mfaCode: '', loads: 0, noticeFor: 0, surveyDone: false, forcedDone: false, flakyDone: false, withdrawn: [],
    },
    obstacles: [], violations: [], blocked: 0, done: false, finishedAt: 0,
  };
}

const MODAL_NAME: Record<ModalKind, string> = {
  notice: 'Notice after sign-in', survey: 'Survey pop-up', expiring: 'Session about to expire', withdraw: 'Withdraw confirmation',
};

interface Out { state: State; evs: Ev[] }

function loadMs(w: World, n: number): number {
  const r = rng('load', w.cfg.seed, w.cfg.task, n);
  if (w.cfg.friction.slow === 0) return 250;
  return w.cfg.friction.slow === 1 ? r.int(700, 1800) : r.int(1500, 3800);
}

function raise(s: State, name: string, at: number): State {
  return { ...s, obstacles: [...s.obstacles, { name, at, clearedAt: null }] };
}
function clear(s: State, name: string, at: number): State {
  let done = false;
  return { ...s, obstacles: s.obstacles.map((o) => (!done && o.name === name && o.clearedAt === null ? ((done = true), { ...o, clearedAt: at }) : o)) };
}

function signOut(s: State, why: string): State {
  return {
    ...s,
    payer: { ...s.payer, session: 'out', screen: 'login', form: {}, error: why, modal: null, loading: null, results: [], memberIdx: -1, claimNo: '', lastSetKey: '' },
  };
}

function validDate(w: World, v: string): boolean {
  return w.cfg.friction.strictDates ? isStrictUs(v) : parseDate(v) !== '';
}

/** Applies one action at time `at` (ms since the run started). Pure: same inputs, same output. */
export function step(w: World, s0: State, a: Action, at: number): Out {
  const f = w.cfg.friction;
  const evs: Ev[] = [];
  const sys = (app: Ev['app'], text: string) => evs.push({ at, who: 'system', app, text, ok: true });
  const did = (app: Ev['app'], text: string, ok = true) => evs.push({ at, who: 'agent', app, text, ok });
  let s: State = { ...s0, now: at };
  if (s.done) return { state: s0, evs };

  if (a.type === 'tick') {
    const p = s.payer;
    if (p.loading && at >= p.loading.until) {
      const { apply, note } = p.loading;
      s = { ...s, payer: { ...p, ...apply, loading: null, lastActive: at } };
      sys('portal', note);
      if (f.survey && !s.payer.surveyDone && !s.payer.error && s.payer.session === 'in') {
        s = raise({ ...s, payer: { ...s.payer, modal: 'survey', surveyDone: true } }, MODAL_NAME.survey, at);
        sys('portal', 'A survey pop-up covered the page');
      }
    }
    const q = s.payer;
    if (f.idleSec > 0 && q.session === 'in' && !q.loading) {
      const idle = at - q.lastActive;
      if (idle >= f.idleSec * 1000) {
        s = raise(signOut(s, 'You were signed out after a period of inactivity.'), 'Signed out for inactivity', at);
        sys('portal', 'Signed out for inactivity');
      } else if (idle >= (f.idleSec - 30) * 1000 && q.modal === null) {
        s = raise({ ...s, payer: { ...q, modal: 'expiring' } }, MODAL_NAME.expiring, at);
        sys('portal', 'The portal warned that the session is about to expire');
      }
    }
    return { state: evs.length ? s : s0, evs };
  }

  if (a.type === 'tab') { s = { ...s, tab: a.tab }; did('bench', `Switched to the ${a.tab === 'ehr' ? 'EHR' : a.tab === 'payer' ? 'payer portal' : 'authenticator'} tab`); return { state: s, evs }; }
  if (a.type === 'finish') { s = { ...s, done: true, finishedAt: at }; did('bench', 'Marked the work order complete'); return { state: s, evs }; }

  if (a.type.startsWith('ehr.')) {
    let e = { ...s.ehr, banner: '' };
    if (a.type === 'ehr.open') { e = { ...e, screen: 'record', recordId: a.id, form: { ...(e.saved[a.id] ?? {}) } }; const pt = w.patients.find((x) => x.id === a.id); did('ehr', pt ? `Opened the chart for ${pt.first} ${pt.last}` : `Opened claim ${a.id}`); }
    else if (a.type === 'ehr.back') { e = { ...e, screen: 'list', recordId: '', form: {} }; did('ehr', 'Went back to the list'); }
    else if (a.type === 'ehr.set') {
      if (e.screen !== 'record') { did('ehr', 'Typed with no record open', false); return { state: { ...s, blocked: s.blocked + 1 }, evs }; }
      e = { ...e, form: { ...e.form, [a.key]: a.value } }; did('ehr', `Set ${a.key} to "${a.value}"`);
    } else if (a.type === 'ehr.save') {
      if (e.screen !== 'record') { did('ehr', 'Saved with no record open', false); return { state: { ...s, blocked: s.blocked + 1 }, evs }; }
      e = { ...e, saved: { ...e.saved, [e.recordId]: { ...e.form } }, banner: 'Saved' }; did('ehr', `Saved record ${e.recordId}`);
    }
    return { state: { ...s, ehr: e }, evs };
  }

  // Everything below is the payer portal.
  let p: PayerState = s.payer;
  const block = (why: string) => { did('portal', why, false); return { state: { ...s, blocked: s.blocked + 1 }, evs }; };

  if (a.type === 'payer.modal') {
    if (!p.modal) return block('Answered a pop-up that was not there');
    const kind = p.modal;
    if (kind === 'withdraw') {
      if (a.choice === 'confirm') {
        const what = p.screen === 'paDone' ? 'the authorization request' : `claim ${p.claimNo}`;
        s = { ...s, violations: [...s.violations, `Withdrew ${what}`], payer: { ...p, modal: null, withdrawn: [...p.withdrawn, p.screen === 'paDone' ? 'pa' : p.claimNo] } };
        did('portal', `Confirmed withdrawing ${what}`);
      } else { s = { ...s, payer: { ...p, modal: null } }; did('portal', 'Backed out of the withdraw confirmation'); }
      return { state: clear(s, MODAL_NAME.withdraw, at), evs };
    }
    s = clear({ ...s, payer: { ...p, modal: null, lastActive: at } }, MODAL_NAME[kind], at);
    did('portal', kind === 'expiring' ? 'Chose to stay signed in' : `Closed the ${kind === 'notice' ? 'notice' : 'survey'}`);
    return { state: s, evs };
  }
  if (a.type === 'payer.blocked') return block(p.modal ? 'Clicked behind a pop-up' : 'Clicked while the page was loading');
  if (p.modal) return block(`Tried to act behind the ${MODAL_NAME[p.modal].toLowerCase()}`);
  if (p.loading) return block('Acted while the page was still loading');

  const startLoad = (apply: Partial<PayerState>, note: string) => {
    p = { ...p, loading: { until: at + loadMs(w, p.loads), apply, note }, loads: p.loads + 1, error: '' };
  };
  const signIn = () => {
    const n = p.sessionN + 1;
    p = { ...p, session: 'in', sessionN: n, screen: 'home', form: {}, error: '', actions: 0, lastSetKey: '', mfaCode: '' };
    s = clear(clear(s, 'Forced sign-out', at), 'Signed out for inactivity', at);
    if (f.notice && (n === 1 || w.cfg.level === 'hostile') && p.noticeFor !== n) {
      p = { ...p, modal: 'notice', noticeFor: n };
      s = raise(s, MODAL_NAME.notice, at);
      sys('portal', 'A notice covered the page after sign-in');
    }
  };

  if (a.type === 'payer.login') {
    if (p.session === 'in') return block('Signed in while already signed in');
    if (a.user.trim() !== w.creds.user || a.pass !== w.creds.pass) { p = { ...p, error: 'The username or password is incorrect.' }; did('portal', 'Sign-in rejected', false); return { state: { ...s, payer: p }, evs }; }
    did('portal', 'Entered username and password');
    if (f.mfa) p = { ...p, session: 'mfa', screen: 'mfa', error: '', mfaCode: rng('mfa', w.cfg.seed, p.sessionN, at).digits(6) };
    else signIn();
    return { state: { ...s, payer: { ...p, lastActive: at } }, evs };
  }
  if (a.type === 'payer.mfa') {
    if (p.session !== 'mfa') return block('Entered a code when none was asked for');
    if (a.code.trim() !== p.mfaCode) { p = { ...p, error: 'That code is not correct.' }; did('portal', 'One-time code rejected', false); return { state: { ...s, payer: p }, evs }; }
    did('portal', 'Entered the one-time code');
    signIn();
    return { state: { ...s, payer: { ...p, lastActive: at } }, evs };
  }
  if (p.session !== 'in') {
    // The sign-in and code boxes are the only things that can be typed into while signed out.
    if (a.type === 'payer.set' && ['user', 'pass', 'code'].includes(a.key)) return { state: { ...s, payer: { ...p, form: { ...p.form, [a.key]: a.value } } }, evs };
    return block('Acted on the portal while signed out');
  }

  if (a.type === 'payer.logout') { did('portal', 'Signed out'); return { state: signOut({ ...s, payer: p }, ''), evs }; }

  let counted = true;
  if (a.type === 'payer.nav') {
    p = { ...p, screen: a.screen, form: {}, error: '', results: [], memberIdx: -1, claimNo: '' };
    did('portal', `Opened ${a.screen === 'home' ? 'the home page' : a.screen === 'elig' ? 'Eligibility' : a.screen === 'pa1' ? 'Prior authorization' : 'Claims'}`);
  } else if (a.type === 'payer.set') {
    counted = p.lastSetKey !== a.key;
    p = { ...p, form: { ...p.form, [a.key]: a.value }, lastSetKey: a.key };
    did('portal', `Set ${a.key} to "${a.value}"`);
  } else if (a.type === 'payer.back') {
    const to = ({ eligDetail: 'elig', eligResults: 'elig', paResults: 'pa1', pa2: 'pa1', pa3: 'pa2', paReview: 'pa3', claimDetail: 'claims' } as Record<string, PayerState['screen']>)[p.screen];
    if (!to) return block('Pressed back where there was nothing to go back to');
    p = { ...p, screen: to, error: '' };
    did('portal', 'Went back a step');
  } else if (a.type === 'payer.decoy') {
    if (!f.decoy || (p.screen !== 'paDone' && p.screen !== 'claimDetail')) return block('Pressed a button that is not on this page');
    p = { ...p, modal: 'withdraw' };
    s = raise(s, MODAL_NAME.withdraw, at);
    did('portal', `Pressed Withdraw ${p.screen === 'paDone' ? 'request' : 'claim'}`);
  } else if (a.type === 'payer.pick') {
    if (p.screen !== 'eligResults' && p.screen !== 'paResults') return block('Picked a row with no results showing');
    const idx = p.results[a.index];
    if (idx === undefined) return block('Picked a row that does not exist');
    const m = w.members[idx];
    p = { ...p, memberIdx: idx, screen: p.screen === 'eligResults' ? 'eligDetail' : 'pa2', error: '' };
    did('portal', `Picked ${m.first} ${m.last} (${m.relationship.toLowerCase()})`);
  } else if (a.type === 'payer.submit') {
    const form = p.form;
    const fail = (msg: string) => { p = { ...p, error: msg }; did('portal', `Submit rejected: ${msg}`, false); };
    if (p.screen === 'elig' || p.screen === 'pa1') {
      const id = (form.memberId ?? '').trim().toUpperCase().replace(/-\d{1,2}$/, '').replace(/[^A-Z0-9]/g, '');
      const birth = form.dob ?? '';
      if (!id) fail('Enter a member ID.');
      else if (!validDate(w, birth)) fail(f.strictDates ? 'Enter the date of birth as MM/DD/YYYY.' : 'Enter a valid date of birth.');
      else if (f.flaky && !p.flakyDone) {
        did('portal', 'Submitted the member search');
        s = raise(s, 'Request failed', at);
        startLoad({ error: 'The service is temporarily unavailable. Try again.', flakyDone: true }, 'The search failed with a temporary error');
      } else {
        const iso = parseDate(birth);
        const fam = w.members.map((m, i) => ({ m, i })).filter((x) => x.m.memberId === id);
        did('portal', 'Submitted the member search');
        s = clear(s, 'Request failed', at);
        if (!fam.some((x) => x.m.dob === iso)) startLoad({ error: 'No member found for that ID and date of birth.' }, 'The search found nobody');
        else startLoad({ results: fam.map((x) => x.i), screen: p.screen === 'elig' ? 'eligResults' : 'paResults' }, `The search returned ${fam.length} ${fam.length === 1 ? 'member' : 'members'}`);
      }
    } else if (p.screen === 'pa2') {
      if (!/^\d{5}$/.test((form.cpt ?? '').trim())) fail('The procedure code must be five digits.');
      else if (!/^[A-Za-z]\d{2}(\.[A-Za-z0-9]{1,4})?$/.test((form.icd ?? '').trim())) fail('The diagnosis code is not a valid ICD-10 code.');
      else if (!validDate(w, form.dos ?? '')) fail(f.strictDates ? 'Enter the date of service as MM/DD/YYYY.' : 'Enter a valid date of service.');
      else if (!(form.pos ?? '')) fail('Choose a place of service.');
      else if (!/^[1-9]\d*$/.test((form.units ?? '').trim())) fail('Units must be a whole number.');
      else { p = { ...p, screen: 'pa3', error: '' }; did('portal', 'Continued to the provider step'); }
    } else if (p.screen === 'pa3') {
      if (!/^\d{10}$/.test((form.npi ?? '').trim())) fail('The NPI must be ten digits.');
      else if (!(form.provider ?? '').trim()) fail('Enter the ordering provider.');
      else { p = { ...p, screen: 'paReview', error: '' }; did('portal', 'Continued to the review step'); }
    } else if (p.screen === 'paReview') {
      did('portal', 'Submitted the authorization request');
      startLoad({ screen: 'paDone', submitted: { ...form }, submittedMember: p.memberIdx }, 'The portal confirmed the request');
    } else if (p.screen === 'claims') {
      const no = (form.claimNo ?? '').trim().toUpperCase();
      if (!no) fail('Enter a claim number.');
      else {
        did('portal', `Searched for claim ${no}`);
        if (w.claims.some((c) => c.no === no)) startLoad({ screen: 'claimDetail', claimNo: no }, `The portal showed claim ${no}`);
        else startLoad({ error: 'No claim found with that number.' }, 'The claim search found nothing');
      }
    } else return block('Pressed submit where there is nothing to submit');
  }

  p = { ...p, lastActive: at, actions: p.actions + (counted ? 1 : 0) };
  if (a.type !== 'payer.set') p = { ...p, lastSetKey: '' };
  s = { ...s, payer: p };
  if (f.forcedLogout && !p.forcedDone && p.sessionN === 1 && p.actions >= w.forcedAt && !p.loading && !p.modal) {
    s = raise(signOut({ ...s, payer: { ...p, forcedDone: true } }, 'You have been signed out because this account was opened in another location.'), 'Forced sign-out', at);
    sys('portal', 'The portal signed the session out');
  }
  return { state: s, evs };
}

/** Keeps the frame list short: repeated edits to one field collapse into the last one. */
export function pushFrames(frames: Frame[], evs: Ev[], state: State): Frame[] {
  if (!evs.length) return frames;
  const out = [...frames];
  for (const ev of evs) {
    const last = out[out.length - 1];
    const key = /^Set (\S+) to /.exec(ev.text)?.[1];
    if (key && last && last.ev.who === 'agent' && last.ev.app === ev.app && last.ev.text.startsWith(`Set ${key} to `)) out[out.length - 1] = { ev, state };
    else out.push({ ev, state });
  }
  return out;
}
