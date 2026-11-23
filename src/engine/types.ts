export type TaskId = 'eligibility' | 'prior-auth' | 'claim-status';
export type Level = 'calm' | 'typical' | 'hostile';
export type VisitType = 'pcp' | 'specialist' | 'urgent' | 'er';

export interface Friction {
  mfa: boolean;
  notice: boolean;
  survey: boolean;
  slow: 0 | 1 | 2;
  dependents: boolean;
  synonyms: boolean;
  shuffle: boolean;
  strictDates: boolean;
  forcedLogout: boolean;
  flaky: boolean;
  idleSec: number;
  mathDeductible: boolean;
  decoy: boolean;
  history: boolean;
  testIds: boolean;
}

export interface Cfg { task: TaskId; seed: number; level: Level; friction: Friction }

export interface Member {
  memberId: string; suffix: string; first: string; last: string; dob: string;
  relationship: 'Subscriber' | 'Spouse' | 'Child';
  active: boolean; termDate: string; plan: string;
  copay: Record<VisitType, number>; deductible: number; met: number; ref: string;
}
export interface Patient {
  id: string; mrn: string; first: string; last: string; dob: string;
  memberId: string; appt: string; visit: VisitType; memberIdx: number;
}
export interface Order {
  cpt: string; cptDesc: string; icd: string; icdDesc: string; dos: string; pos: string;
  units: number; urgent: boolean; npi: string; provider: string;
}
export interface Claim {
  no: string; patient: string; mrn: string; dos: string; billed: number;
  status: 'Paid' | 'Denied' | 'In process'; paid: number; carc: string; carcText: string;
  mine: boolean;
  /** Oldest first. The last line is where the claim stands today. */
  history: { date: string; status: Claim['status']; paid: number; carc: string }[];
}
export interface FieldDef { key: string; label: string; type: 'text' | 'select' | 'check'; options?: string[] }
export interface ScoreItem { key: string; label: string; expected: string; kind: 'text' | 'money' | 'date' | 'blank'; where: 'ehr' | 'portal'; record?: string }

export interface World {
  cfg: Cfg; payerName: string; creds: { user: string; pass: string };
  patients: Patient[]; targetId: string; members: Member[];
  order: Order | null; pa: { ref: string; status: string } | null;
  claims: Claim[]; brief: string[]; items: ScoreItem[];
  forcedAt: number;
}

export type PayerScreen = 'login' | 'mfa' | 'home' | 'elig' | 'eligResults' | 'eligDetail'
  | 'pa1' | 'paResults' | 'pa2' | 'pa3' | 'paReview' | 'paDone' | 'claims' | 'claimDetail';
export type ModalKind = 'notice' | 'survey' | 'expiring' | 'withdraw';

export interface PayerState {
  session: 'out' | 'mfa' | 'in'; sessionN: number; lastActive: number; screen: PayerScreen;
  form: Record<string, string>; error: string; modal: ModalKind | null;
  loading: { until: number; apply: Partial<PayerState>; note: string } | null;
  results: number[]; memberIdx: number; claimNo: string;
  submitted: Record<string, string> | null; submittedMember: number;
  actions: number; lastSetKey: string; mfaCode: string; loads: number;
  noticeFor: number; surveyDone: boolean; forcedDone: boolean; flakyDone: boolean;
  withdrawn: string[];
}
export interface EhrState {
  screen: 'list' | 'record'; recordId: string; form: Record<string, string>;
  saved: Record<string, Record<string, string>>; banner: string;
}
export interface Obstacle { name: string; at: number; clearedAt: number | null }
export interface State {
  tab: 'ehr' | 'payer' | 'auth'; now: number;
  ehr: EhrState; payer: PayerState;
  obstacles: Obstacle[]; violations: string[]; blocked: number;
  done: boolean; finishedAt: number;
}
export interface Ev { at: number; who: 'agent' | 'system'; app: 'ehr' | 'portal' | 'bench'; text: string; ok: boolean }
export interface Frame { ev: Ev; state: State }

export type Action =
  | { type: 'tab'; tab: State['tab'] }
  | { type: 'ehr.open'; id: string }
  | { type: 'ehr.back' }
  | { type: 'ehr.set'; key: string; value: string }
  | { type: 'ehr.save' }
  | { type: 'payer.login'; user: string; pass: string }
  | { type: 'payer.mfa'; code: string }
  | { type: 'payer.nav'; screen: 'home' | 'elig' | 'pa1' | 'claims' }
  | { type: 'payer.set'; key: string; value: string }
  | { type: 'payer.submit' }
  | { type: 'payer.pick'; index: number }
  | { type: 'payer.back' }
  | { type: 'payer.decoy' }
  | { type: 'payer.modal'; choice: 'dismiss' | 'stay' | 'confirm' | 'cancel' }
  | { type: 'payer.blocked' }
  | { type: 'payer.logout' }
  | { type: 'tick' }
  | { type: 'finish' };
