import { isoFrom, longDate } from './dates';
import { rng, type Rng } from './rng';
import type { Cfg, Claim, Clinical, Question, FieldDef, Friction, Level, Member, Order, Patient, ScoreItem, TaskId, VisitType, World } from './types';

export const TASKS: { id: TaskId; name: string; blurb: string }[] = [
  { id: 'eligibility', name: 'Eligibility check', blurb: 'Look a patient up on the payer portal and record their coverage in the chart.' },
  { id: 'prior-auth', name: 'Prior authorization', blurb: 'File an authorization request from a procedure order and record the reference.' },
  { id: 'claim-status', name: 'Claim follow-up', blurb: 'Check three claims, record what the payer says and pick the follow-up the policy calls for.' },
];

export const LEVELS: { id: Level; name: string; blurb: string }[] = [
  { id: 'calm', name: 'Calm', blurb: 'Fixed layout, stable test ids, fast pages. The portal a demo is recorded on.' },
  { id: 'typical', name: 'Typical', blurb: 'One-time codes, a notice after sign-in, dependents on the same member ID, renamed labels, strict date format, and clinical questions that have to be answered from the chart.' },
  { id: 'hostile', name: 'Hostile', blurb: 'All of that, plus fields that reorder every session, a forced sign-out, a failed request, a survey pop-up, slow pages, claims that show their whole history and a destructive button.' },
];

export const FRICTION_INFO: { key: keyof Friction; name: string }[] = [
  { key: 'mfa', name: 'One-time sign-in code' },
  { key: 'notice', name: 'Notice after sign-in' },
  { key: 'dependents', name: 'Dependents share the member ID' },
  { key: 'synonyms', name: 'Field labels renamed' },
  { key: 'strictDates', name: 'Dates must be MM/DD/YYYY' },
  { key: 'shuffle', name: 'Fields reorder each session' },
  { key: 'forcedLogout', name: 'Forced sign-out mid task' },
  { key: 'flaky', name: 'First request fails' },
  { key: 'survey', name: 'Survey pop-up over results' },
  { key: 'clinical', name: 'Clinical questions answered from the chart' },
  { key: 'slow', name: 'Slow pages' },
  { key: 'mathDeductible', name: 'Deductible left to work out' },
  { key: 'history', name: 'Claims show every status they have had' },
  { key: 'decoy', name: 'Destructive button next to the safe one' },
];

export function frictionFor(level: Level): Friction {
  const off: Friction = {
    mfa: false, notice: false, survey: false, slow: 0, dependents: false, synonyms: false, shuffle: false,
    strictDates: false, forcedLogout: false, flaky: false, idleSec: 0, mathDeductible: false, decoy: false, history: false, clinical: false, testIds: true,
  };
  if (level === 'calm') return off;
  const typical: Friction = { ...off, mfa: true, notice: true, slow: 1, dependents: true, synonyms: true, strictDates: true, clinical: true, idleSec: 240, testIds: false };
  if (level === 'typical') return typical;
  return { ...typical, survey: true, slow: 2, shuffle: true, forcedLogout: true, flaky: true, idleSec: 120, mathDeductible: true, decoy: true, history: true };
}

export type FrictionKey = keyof Friction;
export const MIXABLE: FrictionKey[] = FRICTION_INFO.map((f) => f.key);

/** A level, or with `only` a calm portal plus exactly the listed obstacles: one variable at a time. */
export function makeCfg(task: TaskId, seed: number, level: Level, only?: FrictionKey[]): Cfg {
  if (!only && level !== 'custom') return { task, seed, level, friction: frictionFor(level) };
  const friction = frictionFor('calm');
  for (const k of only ?? []) {
    if (k === 'slow') friction.slow = 1;
    else if (k !== 'idleSec' && k !== 'testIds' && MIXABLE.includes(k)) friction[k] = true;
  }
  return { task, seed, level: 'custom', friction };
}
export const onList = (f: Friction): FrictionKey[] => MIXABLE.filter((k) => f[k]);
export const levelName = (l: Level) => (l === 'custom' ? 'Custom' : LEVELS.find((x) => x.id === l)!.name);

export const TODAY = '2026-12-03';
/** The chart facts a payer's clinical questions are answered from, worded a little differently each time. */
function clinical(r: Rng, author: string): Clinical {
  const prior = r.pick(['none', 'recent', 'old'] as const);
  const priorDate = prior === 'recent' ? isoFrom(2026, r.int(1, 10), r.int(1, 28)) : isoFrom(2025, r.int(3, 10), r.int(1, 28));
  const span = r.pick([{ n: 10, unit: 'day', days: 10 }, { n: 3, unit: 'week', days: 21 }, { n: 5, unit: 'week', days: 35 }, { n: 7, unit: 'week', days: 49 }, { n: 9, unit: 'week', days: 63 }, { n: 3, unit: 'month', days: 90 }, { n: 5, unit: 'month', days: 150 }]);
  const first = r.pick(['failed', 'failed', 'improved', 'early', 'none'] as const);
  const notes = r.shuffle([
    prior === 'none' ? 'Prior: no earlier study or procedure of this kind on file.' : `Prior: same service performed on ${longDate(priorDate)}.`,
    `Onset: symptoms began about ${span.n} ${span.unit}${span.n === 1 ? '' : 's'} ago.`,
    `First-line treatment: ${{ failed: 'completed, no improvement.', improved: 'completed, symptoms improved.', early: 'started last week, too early to assess.', none: 'not started.' }[first]}`,
    r.pick(['Allergies: none known.', 'Allergies: penicillin.', 'Tobacco: never.']),
  ]);
  const yn = (b: boolean) => (b ? 'Yes' : 'No') as Question['answer'];
  return {
    notes, author,
    questions: [
      { key: 'q1', short: 'Same service in the past 12 months', text: 'Has the member had this same service in the past 12 months?', answer: yn(prior === 'recent'), stronger: 'No' },
      { key: 'q2', short: 'Symptoms for six weeks or longer', text: 'Have symptoms been present for six weeks or longer?', answer: yn(span.days >= 42), stronger: 'Yes' },
      { key: 'q3', short: 'First-line treatment tried without improvement', text: 'Has the member tried first-line treatment without improvement?', answer: yn(first === 'failed'), stronger: 'Yes' },
    ],
  };
}

const FIRST = ['Dana', 'Marcus', 'Priya', 'Elena', 'Tomas', 'Grace', 'Andre', 'Naomi', 'Victor', 'Leila', 'Owen', 'Camille', 'Rafael', 'Ingrid', 'Samuel', 'Yara', 'Desmond', 'Hana', 'Felix', 'Marisol'];
const LAST = ['Okafor', 'Lindqvist', 'Alvarez', 'Brennan', 'Castellano', 'Whitfield', 'Nakamura', 'Odum', 'Petrakis', 'Sandoval', 'Thackeray', 'Varga', 'Ibarra', 'Kowalczyk', 'Mbeki', 'Rosenthal'];
const PLANS = ['Harborline Select PPO', 'Harborline Value HMO', 'Harborline Open Access POS', 'Harborline Bronze HDHP', 'Harborline Silver EPO'];
const PROVIDERS = ['Dr. Helen Voss', 'Dr. Arjun Mehta', 'Dr. Louise Carrow', 'Dr. Peter Anand', 'Dr. Simone Achterberg'];
const PROCS: { cpt: string; cptDesc: string; icd: string; icdDesc: string; pos: string }[] = [
  { cpt: '70553', cptDesc: 'MRI brain without and with contrast', icd: 'G43.909', icdDesc: 'Migraine, unspecified, not intractable', pos: '22 Outpatient hospital' },
  { cpt: '29881', cptDesc: 'Knee arthroscopy with meniscectomy', icd: 'M23.221', icdDesc: 'Derangement of medial meniscus, right knee', pos: '24 Ambulatory surgical center' },
  { cpt: '45378', cptDesc: 'Colonoscopy, diagnostic', icd: 'K92.1', icdDesc: 'Melena', pos: '24 Ambulatory surgical center' },
  { cpt: '72148', cptDesc: 'MRI lumbar spine without contrast', icd: 'M54.16', icdDesc: 'Radiculopathy, lumbar region', pos: '22 Outpatient hospital' },
  { cpt: '93306', cptDesc: 'Echocardiogram, transthoracic, complete', icd: 'I50.9', icdDesc: 'Heart failure, unspecified', pos: '11 Office' },
  { cpt: '27447', cptDesc: 'Total knee arthroplasty', icd: 'M17.11', icdDesc: 'Primary osteoarthritis, right knee', pos: '21 Inpatient hospital' },
];
export const POS_OPTIONS = ['11 Office', '21 Inpatient hospital', '22 Outpatient hospital', '24 Ambulatory surgical center'];
export const CARC: Record<string, string> = {
  'CO-197': 'Precertification or authorization absent',
  'CO-16': 'Claim lacks information or has a billing error',
  'CO-29': 'The time limit for filing has expired',
  'CO-97': 'Payment is included in the allowance for another service',
};
export const SOP: { when: string; action: string }[] = [
  { when: 'Paid', action: 'No action' },
  { when: 'In process', action: 'Recheck in 14 days' },
  { when: 'Denied, CO-197', action: 'Appeal with authorization' },
  { when: 'Denied, CO-16', action: 'Correct and resubmit' },
  { when: 'Denied, CO-29', action: 'Write off, timely filing' },
  { when: 'Denied, CO-97', action: 'Review coding' },
];
export const ACTION_OPTIONS = SOP.map((s) => s.action);
export function sopAction(c: { status: string; carc: string }): string {
  const when = c.status === 'Denied' ? `Denied, ${c.carc}` : c.status;
  return SOP.find((s) => s.when === when)?.action ?? '';
}
const VISIT_PHRASE: Record<VisitType, string> = { pcp: 'a primary care office visit', specialist: 'a specialist office visit', urgent: 'an urgent care visit', er: 'an emergency room visit' };
// A sibling with a name one slip away from the patient's: the wrong row a hurried reader picks.
const NEAR: Record<string, string> = {
  Dana: 'Dane', Marcus: 'Marco', Priya: 'Priyanka', Elena: 'Elaine', Tomas: 'Tobias', Grace: 'Gracie', Andre: 'Andrea', Naomi: 'Noemi', Victor: 'Victoria', Leila: 'Lila',
  Owen: 'Owain', Camille: 'Camila', Rafael: 'Rafaela', Ingrid: 'Inga', Samuel: 'Samantha', Yara: 'Yasmin', Desmond: 'Desiree', Hana: 'Hannah', Felix: 'Felicia', Marisol: 'Marisa',
};
export const VISIT_LABEL: Record<VisitType, string> = { pcp: 'Primary care office visit', specialist: 'Specialist office visit', urgent: 'Urgent care', er: 'Emergency room' };

function dob(r: Rng, minAge: number, maxAge: number) { return isoFrom(2026 - r.int(minAge, maxAge), r.int(1, 12), r.int(1, 28)); }

function member(r: Rng, memberId: string, suffix: string, first: string, last: string, birth: string, rel: Member['relationship'], plan: string, active: boolean): Member {
  const deductible = r.pick([500, 1000, 1500, 2500, 3000]);
  return {
    memberId, suffix, first, last, dob: birth, relationship: rel, active,
    termDate: active ? '' : isoFrom(2026, r.int(6, 10), r.int(1, 28)),
    plan,
    copay: { pcp: r.pick([15, 20, 25, 30]), specialist: r.pick([40, 45, 50, 60]), urgent: r.pick([65, 75]), er: r.pick([150, 250, 300]) },
    deductible, met: r.int(0, deductible / 10 - 1) * 10,
    ref: `EV${r.digits(9)}`,
  };
}

export function buildWorld(cfg: Cfg): World {
  const r = rng('world', cfg.task, cfg.seed);
  const f = cfg.friction;
  const lasts = r.shuffle(LAST).slice(0, 6);
  const firsts = r.shuffle(FIRST);
  const members: Member[] = [];
  const patients: Patient[] = [];
  const times = ['8:20 AM', '9:00 AM', '9:40 AM', '10:40 AM', '11:20 AM', '1:00 PM'];
  const targetN = r.int(0, 5);
  for (let i = 0; i < 6; i++) {
    const memberId = `HLX${r.digits(8)}`;
    const plan = r.pick(PLANS);
    const first = firsts[i * 3];
    const last = lasts[i];
    const patientIsChild = r.next() < 0.35;
    // Roughly one target in four has lost coverage, so "inactive" has to be handled.
    const active = i === targetN ? r.next() > 0.25 : r.next() > 0.15;
    const family: Member[] = [];
    if (patientIsChild) {
      family.push(member(r, memberId, '01', firsts[i * 3 + 1], last, dob(r, 38, 60), 'Subscriber', plan, true));
      family.push(member(r, memberId, '02', first, last, dob(r, 5, 24), 'Child', plan, active));
      family.push(member(r, memberId, '03', NEAR[first], last, dob(r, 5, 24), 'Child', plan, true));
    } else {
      family.push(member(r, memberId, '01', first, last, dob(r, 30, 78), 'Subscriber', plan, active));
      family.push(member(r, memberId, '02', firsts[i * 3 + 1], last, dob(r, 30, 78), 'Spouse', plan, true));
      if (r.next() < 0.5) family.push(member(r, memberId, '03', firsts[i * 3 + 2], last, dob(r, 5, 24), 'Child', plan, true));
    }
    const self = family[patientIsChild ? 1 : 0];
    const kept = f.dependents ? r.shuffle(family) : [self];
    const base = members.length;
    members.push(...kept);
    patients.push({
      id: `p${i}`, mrn: r.digits(6), first: self.first, last: self.last, dob: self.dob,
      memberId: `${memberId}-${self.suffix}`, appt: times[i], visit: r.pick(['pcp', 'specialist', 'specialist', 'urgent'] as VisitType[]),
      memberIdx: base + kept.indexOf(self),
    });
  }
  const target = patients[targetN];
  const tm = members[target.memberIdx];
  const dos = isoFrom(2026, 12, r.int(8, 22));
  const proc = r.pick(PROCS);
  const order: Order = { ...proc, dos, units: 1, urgent: r.next() < 0.2, npi: r.digits(10), provider: r.pick(PROVIDERS) };
  const chart = clinical(rng('clinical', cfg.seed), order.provider);
  const pa = { ref: `PA-${r.digits(7)}`, status: r.pick(['Approved', 'Pended for clinical review', 'Approved']) };

  const codes = r.shuffle(Object.keys(CARC));
  const statuses = r.shuffle(['Paid', 'Denied', 'Denied', 'In process', 'Paid'] as Claim['status'][]);
  const mine = r.shuffle([true, true, true, false, false]);
  const claims: Claim[] = statuses.map((status, i) => {
    const p = patients[i];
    const billed = r.int(18, 420) * 10;
    const carc = status === 'Denied' ? codes[i % codes.length] : '';
    return {
      no: `CLM${r.digits(9)}`, patient: `${p.last}, ${p.first}`, mrn: p.mrn, dos: isoFrom(2026, r.int(7, 10), r.int(1, 28)), billed,
      status, paid: status === 'Paid' ? Math.round(billed * r.pick([0.42, 0.55, 0.61, 0.7]) * 100) / 100 : 0,
      carc, carcText: carc ? CARC[carc] : '', mine: mine[i], history: [],
    };
  });

  for (const c of claims) {
    const final = { date: isoFrom(2026, 11, r.int(12, 27)), status: c.status, paid: c.paid, carc: c.carc };
    const earlier = c.status === 'Paid' ? r.pick([{ status: 'Denied' as const, carc: 'CO-16' }, { status: 'In process' as const, carc: '' }])
      : c.status === 'Denied' ? { status: 'In process' as const, carc: '' } : { status: 'Denied' as const, carc: 'CO-16' };
    // Two claims in three have been through an earlier status. Only the last line counts.
    c.history = r.next() < 0.67 ? [{ date: isoFrom(2026, 10, r.int(3, 28)), paid: 0, ...earlier }, final] : [final];
  }

  const items: ScoreItem[] = [];
  const brief: string[] = [];
  const name = `${target.first} ${target.last}`;
  if (cfg.task === 'eligibility') {
    brief.push(
      `Verify insurance for ${name} (MRN ${target.mrn}), the ${target.appt} patient, ahead of ${VISIT_PHRASE[target.visit]}.`,
      'Look the patient up on the Harborline provider portal, then fill in the Insurance verification form in the chart and save it.',
      'If coverage is inactive, record the status, the termination date and the reference, and leave the copay, deductible and plan blank.',
    );
    const rec = target.id;
    items.push({ key: 'status', label: 'Coverage status', expected: tm.active ? 'Active' : 'Inactive', kind: 'text', where: 'ehr', record: rec });
    items.push({ key: 'ref', label: 'Payer reference', expected: tm.ref, kind: 'text', where: 'ehr', record: rec });
    if (tm.active) {
      items.push({ key: 'plan', label: 'Plan name', expected: tm.plan, kind: 'text', where: 'ehr', record: rec });
      items.push({ key: 'copay', label: 'Copay for this visit', expected: String(tm.copay[target.visit]), kind: 'money', where: 'ehr', record: rec });
      items.push({ key: 'dedRemaining', label: 'Deductible remaining', expected: String(tm.deductible - tm.met), kind: 'money', where: 'ehr', record: rec });
    } else {
      items.push({ key: 'termDate', label: 'Termination date', expected: tm.termDate, kind: 'date', where: 'ehr', record: rec });
      items.push({ key: 'plan', label: 'Plan left blank', expected: '', kind: 'blank', where: 'ehr', record: rec });
      items.push({ key: 'copay', label: 'Copay left blank', expected: '', kind: 'blank', where: 'ehr', record: rec });
      items.push({ key: 'dedRemaining', label: 'Deductible left blank', expected: '', kind: 'blank', where: 'ehr', record: rec });
    }
  } else if (cfg.task === 'prior-auth') {
    brief.push(
      `Get prior authorization for the procedure ordered for ${name} (MRN ${target.mrn}).`,
      'Open the order in the chart, file the request on the Harborline provider portal, then record the authorization reference and status on the order and save it.',
      f.clinical ? 'Tick the expedited box only if the order is marked urgent, and answer the payer\'s clinical questions from the notes in the chart.' : 'Tick the expedited box only if the order is marked urgent.',
    );
    const rec = target.id;
    items.push({ key: 'member', label: 'Filed for the right member', expected: `${tm.first} ${tm.last}`, kind: 'text', where: 'portal' });
    items.push({ key: 'cpt', label: 'Procedure code', expected: order.cpt, kind: 'text', where: 'portal' });
    items.push({ key: 'icd', label: 'Diagnosis code', expected: order.icd, kind: 'text', where: 'portal' });
    items.push({ key: 'dos', label: 'Date of service', expected: order.dos, kind: 'date', where: 'portal' });
    items.push({ key: 'pos', label: 'Place of service', expected: order.pos, kind: 'text', where: 'portal' });
    items.push({ key: 'npi', label: 'Ordering provider NPI', expected: order.npi, kind: 'text', where: 'portal' });
    items.push({ key: 'urgent', label: 'Expedited box', expected: order.urgent ? 'yes' : 'no', kind: 'text', where: 'portal' });
    if (f.clinical) for (const q of chart.questions) items.push({ key: q.key, label: q.short, expected: q.answer, kind: 'text', where: 'portal' });
    items.push({ key: 'paRef', label: 'Authorization reference in chart', expected: pa.ref, kind: 'text', where: 'ehr', record: rec });
    items.push({ key: 'paStatus', label: 'Authorization status in chart', expected: pa.status, kind: 'text', where: 'ehr', record: rec });
  } else {
    const todo = claims.filter((c) => c.mine);
    brief.push(
      `Work the three claims assigned to you in the follow-up queue: ${todo.map((c) => c.no).join(', ')}.`,
      'Look each one up on the Harborline provider portal. Record the status, the amount paid, the denial code if there is one, and the next action from the follow-up policy shown in the queue.',
      'Leave the other claims in the queue alone.',
    );
    for (const c of todo) {
      items.push({ key: 'status', label: `${c.no} status`, expected: c.status, kind: 'text', where: 'ehr', record: c.no });
      items.push({ key: 'paid', label: `${c.no} amount paid`, expected: String(c.paid), kind: 'money', where: 'ehr', record: c.no });
      items.push({ key: 'carc', label: `${c.no} denial code`, expected: c.carc, kind: c.carc ? 'text' : 'blank', where: 'ehr', record: c.no });
      items.push({ key: 'action', label: `${c.no} next action`, expected: sopAction(c), kind: 'text', where: 'ehr', record: c.no });
    }
  }

  return {
    cfg, payerName: 'Harborline Health Plan', creds: { user: 'fennmore.rcm', pass: `Gauntlet-${cfg.seed}` },
    patients, targetId: target.id, members, order: cfg.task === 'prior-auth' ? order : null, clinical: cfg.task === 'prior-auth' ? chart : null,
    pa: cfg.task === 'prior-auth' ? pa : null, claims: cfg.task === 'claim-status' ? claims : [],
    brief, items, forcedAt: r.int(3, 5),
  };
}

export function ehrFields(task: TaskId): FieldDef[] {
  if (task === 'eligibility') return [
    { key: 'status', label: 'Coverage status', type: 'select', options: ['Active', 'Inactive'] },
    { key: 'plan', label: 'Plan name', type: 'text' },
    { key: 'copay', label: 'Copay for this visit ($)', type: 'text' },
    { key: 'dedRemaining', label: 'Deductible remaining ($)', type: 'text' },
    { key: 'termDate', label: 'Termination date', type: 'text' },
    { key: 'ref', label: 'Payer reference', type: 'text' },
  ];
  if (task === 'prior-auth') return [
    { key: 'paRef', label: 'Authorization reference', type: 'text' },
    { key: 'paStatus', label: 'Authorization status', type: 'select', options: ['Approved', 'Pended for clinical review', 'Denied'] },
  ];
  return [
    { key: 'status', label: 'Payer status', type: 'select', options: ['Paid', 'Denied', 'In process'] },
    { key: 'paid', label: 'Amount paid ($)', type: 'text' },
    { key: 'carc', label: 'Denial code', type: 'text' },
    { key: 'action', label: 'Next action', type: 'select', options: ACTION_OPTIONS },
  ];
}

const LABELS: Record<string, string[]> = {
  memberId: ['Member ID', 'Subscriber number', 'ID number'],
  dob: ['Date of birth', 'Patient DOB', 'Birth date'],
  cpt: ['CPT code', 'Procedure code', 'Service code'],
  icd: ['Diagnosis code (ICD-10)', 'Primary diagnosis', 'Dx code'],
  dos: ['Date of service', 'Service date', 'Planned date'],
  pos: ['Place of service', 'Setting', 'Service location'],
  units: ['Units', 'Quantity', 'Number of units'],
  npi: ['Ordering provider NPI', 'NPI', 'Provider NPI'],
  provider: ['Ordering provider name', 'Provider name', 'Requesting clinician'],
  claimNo: ['Claim number', 'Claim ID', 'Claim reference'],
};
const FORMS: Record<string, string[]> = {
  lookup: ['memberId', 'dob'],
  pa2: ['cpt', 'icd', 'dos', 'pos', 'units'],
  pa3: ['npi', 'provider'],
  claims: ['claimNo'],
};
export type FormId = keyof typeof FORMS;

/** The fields of a portal form as this session shows them: order and labels can both move. */
export function payerForm(cfg: Cfg, sessionN: number, form: FormId): FieldDef[] {
  const r = rng('form', cfg.seed, cfg.task, form, cfg.friction.shuffle || cfg.friction.synonyms ? sessionN : 0);
  let keys = FORMS[form];
  if (cfg.friction.shuffle && keys.length > 1) {
    // Always a real change from the canonical order, never the identity permutation.
    const rot = 1 + r.int(0, keys.length - 2);
    keys = [...keys.slice(rot), ...keys.slice(0, rot)];
  }
  return keys.map((key) => ({
    key,
    label: cfg.friction.synonyms ? r.pick(LABELS[key]) : LABELS[key][0],
    type: key === 'pos' ? 'select' : 'text',
    options: key === 'pos' ? POS_OPTIONS : undefined,
  }));
}
export const canonicalForm = (form: FormId): string[] => FORMS[form];
export const dateHint = (cfg: Cfg) => (cfg.friction.strictDates ? 'MM/DD/YYYY' : 'any common format');
export { longDate };
