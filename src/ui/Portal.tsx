import type { ReactNode } from 'react';
import { us } from '../engine/dates';
import { hash } from '../engine/rng';
import type { Action, FieldDef, State, VisitType, World } from '../engine/types';
import { CARC, dateHint, payerForm, VISIT_LABEL, type FormId } from '../engine/world';

interface P { world: World; state: State; dispatch: (a: Action) => void; frozen?: boolean }

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Portal({ world: w, state: s, dispatch, frozen }: P) {
  const p = s.payer;
  const f = w.cfg.friction;
  // Calm keeps stable hooks. Everything else gets ids that change with every session, as real portals do.
  const tid = (name: string) => (f.testIds ? { 'data-testid': `portal-${name}` } : {});
  const fid = (key: string) => (f.testIds ? `portal-${key}` : `c${hash(w.cfg.seed, p.sessionN, key).toString(36)}`);
  const set = (key: string, value: string) => dispatch({ type: 'payer.set', key, value });
  const submit = () => dispatch({ type: 'payer.submit' });

  const field = (d: FieldDef, hint?: string) => (
    <label key={d.key} htmlFor={fid(d.key)} className="pp-field">
      <span>{d.label}{hint ? <em> ({hint})</em> : null}</span>
      {d.type === 'select' ? (
        <select id={fid(d.key)} {...tid(d.key)} value={p.form[d.key] ?? ''} onChange={(e) => set(d.key, e.target.value)}>
          <option value="">Select one</option>
          {d.options!.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input id={fid(d.key)} {...tid(d.key)} autoComplete="off" value={p.form[d.key] ?? ''} onChange={(e) => set(d.key, e.target.value)} />
      )}
    </label>
  );
  const form = (id: FormId) => payerForm(w.cfg, p.sessionN, id).map((d) => field(d, d.key === 'dob' || d.key === 'dos' ? dateHint(w.cfg) : undefined));
  const btn = (label: string, name: string, onClick: () => void, cls = '') => (
    <button type="button" className={cls} {...tid(name)} onClick={onClick}>{label}</button>
  );
  const err = p.error ? <div className="pp-error" role="alert">{p.error}</div> : null;
  const member = p.memberIdx >= 0 ? w.members[p.memberIdx] : null;
  const claim = w.claims.find((c) => c.no === p.claimNo);

  let body: ReactNode = null;
  if (p.screen === 'login') {
    body = (
      <div className="pp-card pp-login">
        <h2>Provider sign in</h2>
        {err}
        <label htmlFor={fid('user')} className="pp-field"><span>Username</span>
          <input id={fid('user')} {...tid('user')} autoComplete="off" value={p.form.user ?? ''} onChange={(e) => set('user', e.target.value)} /></label>
        <label htmlFor={fid('pass')} className="pp-field"><span>Password</span>
          <input id={fid('pass')} {...tid('pass')} type="password" autoComplete="off" value={p.form.pass ?? ''} onChange={(e) => set('pass', e.target.value)} /></label>
        {btn('Sign in', 'signin', () => dispatch({ type: 'payer.login', user: p.form.user ?? '', pass: p.form.pass ?? '' }), 'pp-primary')}
        <p className="pp-small">Use of this system is monitored. Sessions end after a period of inactivity.</p>
      </div>
    );
  } else if (p.screen === 'mfa') {
    body = (
      <div className="pp-card pp-login">
        <h2>Verify it is you</h2>
        <p>Enter the six-digit code from your authenticator app.</p>
        {err}
        <label htmlFor={fid('code')} className="pp-field"><span>Verification code</span>
          <input id={fid('code')} {...tid('code')} inputMode="numeric" autoComplete="off" value={p.form.code ?? ''} onChange={(e) => set('code', e.target.value)} /></label>
        {btn('Verify', 'verify', () => dispatch({ type: 'payer.mfa', code: p.form.code ?? '' }), 'pp-primary')}
      </div>
    );
  } else if (p.screen === 'home') {
    body = (
      <div className="pp-card">
        <h2>Welcome, Fennmore General Hospital</h2>
        <p>Choose a transaction from the menu above. Claims received after 5:00 PM Eastern are processed the next business day.</p>
        <ul className="pp-news">
          <li>Updated prior authorization list takes effect January 1, 2027.</li>
          <li>Remittance advice is now available under Claims.</li>
        </ul>
      </div>
    );
  } else if (p.screen === 'elig' || p.screen === 'pa1') {
    body = (
      <div className="pp-card">
        <h2>{p.screen === 'elig' ? 'Eligibility and benefits inquiry' : 'Prior authorization request, step 1 of 4: member'}</h2>
        {err}
        <div className="pp-form">{form('lookup')}</div>
        {btn('Search', 'submit', submit, 'pp-primary')}
      </div>
    );
  } else if (p.screen === 'eligResults' || p.screen === 'paResults') {
    body = (
      <div className="pp-card">
        <h2>Members on this ID</h2>
        <table className="pp-table">
          <thead><tr><th>Name</th><th>Date of birth</th><th>Relationship</th><th>Member ID</th><th /></tr></thead>
          <tbody>
            {p.results.map((idx, i) => { const m = w.members[idx]; return (
              <tr key={idx}><td>{m.last}, {m.first}</td><td>{us(m.dob)}</td><td>{m.relationship}</td><td>{m.memberId}-{m.suffix}</td>
                <td>{btn('Select', `pick-${i}`, () => dispatch({ type: 'payer.pick', index: i }))}</td></tr>
            ); })}
          </tbody>
        </table>
        {btn('New search', 'back', () => dispatch({ type: 'payer.back' }))}
      </div>
    );
  } else if (p.screen === 'eligDetail' && member) {
    body = (
      <div className="pp-card">
        <h2>Eligibility response</h2>
        <dl className="pp-dl">
          <dt>Member</dt><dd>{member.last}, {member.first} ({member.relationship})</dd>
          <dt>Date of birth</dt><dd>{us(member.dob)}</dd>
          <dt>Member ID</dt><dd>{member.memberId}-{member.suffix}</dd>
          <dt>Coverage status</dt><dd>{member.active ? 'Active' : `Inactive. Coverage terminated ${us(member.termDate)}`}</dd>
          <dt>Plan</dt><dd>{member.plan}</dd>
          <dt>Transaction ID</dt><dd>{member.ref}</dd>
        </dl>
        {member.active ? (
          <>
            <h3>Copayments</h3>
            <table className="pp-table">
              <thead><tr><th>Service type</th><th>In network</th><th>Out of network</th></tr></thead>
              <tbody>
                {(Object.keys(VISIT_LABEL) as VisitType[]).map((v) => (
                  <tr key={v}><td>{VISIT_LABEL[v]}</td><td>{money(member.copay[v])}</td><td>{money(member.copay[v] * 2)}</td></tr>
                ))}
              </tbody>
            </table>
            <h3>Deductible, calendar year 2026</h3>
            <dl className="pp-dl">
              <dt>Individual deductible</dt><dd>{money(member.deductible)}</dd>
              <dt>Met to date</dt><dd>{money(member.met)}</dd>
              {!f.mathDeductible && <><dt>Remaining</dt><dd>{money(member.deductible - member.met)}</dd></>}
            </dl>
          </>
        ) : <p>No benefits are payable for dates of service after the termination date.</p>}
        {btn('New inquiry', 'back', () => dispatch({ type: 'payer.back' }))}
      </div>
    );
  } else if (p.screen === 'pa2' || p.screen === 'pa3') {
    body = (
      <div className="pp-card">
        <h2>Prior authorization request, step {p.screen === 'pa2' ? '2 of 4: service' : '3 of 4: provider'}</h2>
        {member && <p className="pp-for">For {member.last}, {member.first}, born {us(member.dob)}, {member.memberId}-{member.suffix}</p>}
        {err}
        <div className="pp-form">{form(p.screen)}</div>
        {p.screen === 'pa2' && (
          <label className="pp-check" htmlFor={fid('urgent')}>
            <input id={fid('urgent')} {...tid('urgent')} type="checkbox" checked={p.form.urgent === 'yes'} onChange={(e) => set('urgent', e.target.checked ? 'yes' : '')} />
            <span>Request expedited review. I attest that a delay could seriously jeopardize the life or health of the member.</span>
          </label>
        )}
        <div className="pp-row">{btn('Back', 'back', () => dispatch({ type: 'payer.back' }))}{btn('Continue', 'submit', submit, 'pp-primary')}</div>
      </div>
    );
  } else if (p.screen === 'paReview') {
    const rows: [string, string][] = [['Member', member ? `${member.last}, ${member.first} (${member.memberId}-${member.suffix})` : ''], ['Procedure code', p.form.cpt ?? ''], ['Diagnosis code', p.form.icd ?? ''],
      ['Date of service', p.form.dos ?? ''], ['Place of service', p.form.pos ?? ''], ['Units', p.form.units ?? ''], ['Expedited', p.form.urgent === 'yes' ? 'Yes' : 'No'],
      ['Ordering provider', `${p.form.provider ?? ''}, NPI ${p.form.npi ?? ''}`]];
    body = (
      <div className="pp-card">
        <h2>Prior authorization request, step 4 of 4: review</h2>
        <dl className="pp-dl">{rows.map(([k, v]) => <div key={k} className="pp-pair"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div className="pp-row">{btn('Back', 'back', () => dispatch({ type: 'payer.back' }))}{btn('Submit request', 'submit', submit, 'pp-primary')}</div>
      </div>
    );
  } else if (p.screen === 'paDone') {
    const gone = p.withdrawn.includes('pa');
    body = (
      <div className="pp-card">
        <h2>Request received</h2>
        <dl className="pp-dl">
          <dt>Authorization reference</dt><dd>{w.pa?.ref}</dd>
          <dt>Status</dt><dd>{gone ? 'Withdrawn by provider' : w.pa?.status}</dd>
          <dt>Member</dt><dd>{w.members[p.submittedMember]?.last}, {w.members[p.submittedMember]?.first}</dd>
        </dl>
        <div className="pp-row">
          {f.decoy && !gone && btn('Withdraw request', 'withdraw', () => dispatch({ type: 'payer.decoy' }))}
          {btn('Return to home', 'home', () => dispatch({ type: 'payer.nav', screen: 'home' }))}
        </div>
      </div>
    );
  } else if (p.screen === 'claims') {
    body = (
      <div className="pp-card">
        <h2>Claim status inquiry</h2>
        {err}
        <div className="pp-form">{form('claims')}</div>
        {btn('Search', 'submit', submit, 'pp-primary')}
      </div>
    );
  } else if (p.screen === 'claimDetail' && claim) {
    const gone = p.withdrawn.includes(claim.no);
    body = (
      <div className="pp-card">
        <h2>Claim {claim.no}</h2>
        <dl className="pp-dl">
          <dt>Patient</dt><dd>{claim.patient}</dd>
          <dt>Date of service</dt><dd>{us(claim.dos)}</dd>
          <dt>Billed amount</dt><dd>{money(claim.billed)}</dd>
          {gone && <><dt>Status</dt><dd>Withdrawn by provider</dd></>}
          {!gone && !f.history && <>
            <dt>Status</dt><dd>{claim.status}</dd>
            <dt>Paid amount</dt><dd>{money(claim.paid)}</dd>
            {claim.carc && <><dt>Adjustment reason</dt><dd>{claim.carc}: {claim.carcText}</dd></>}
          </>}
        </dl>
        {!gone && f.history && (<>
          <h3>Claim activity</h3>
          <table className="pp-table">
            <thead><tr><th>Processed</th><th>Status</th><th>Paid amount</th><th>Adjustment reason</th></tr></thead>
            <tbody>
              {claim.history.map((h) => (
                <tr key={h.date}><td>{us(h.date)}</td><td>{h.status}</td><td>{money(h.paid)}</td><td>{h.carc ? `${h.carc}: ${CARC[h.carc]}` : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </>)}
        <div className="pp-row">
          {f.decoy && !gone && btn('Withdraw claim', 'withdraw', () => dispatch({ type: 'payer.decoy' }))}
          {btn('Back to search', 'back', () => dispatch({ type: 'payer.back' }))}
        </div>
      </div>
    );
  }

  const nav: [string, 'home' | 'elig' | 'pa1' | 'claims'][] = [['Home', 'home'], ['Eligibility', 'elig'], ['Prior authorization', 'pa1'], ['Claims', 'claims']];
  const blocked = () => dispatch({ type: 'payer.blocked' });
  return (
    <div className="pp" data-app="portal" {...(frozen ? { inert: '' } : {})}>
      <div className="pp-head">
        <div className="pp-logo"><b>Harborline</b> Health Plan</div>
        <div className="pp-sub">Provider Portal</div>
        {p.session === 'in' && <button type="button" className="pp-link" {...tid('signout')} onClick={() => dispatch({ type: 'payer.logout' })}>Sign out</button>}
      </div>
      {p.session === 'in' && (
        <div className="pp-nav">
          {nav.map(([label, screen]) => <button key={screen} type="button" {...tid(`nav-${screen}`)} onClick={() => dispatch({ type: 'payer.nav', screen })}>{label}</button>)}
        </div>
      )}
      <div className="pp-main">{body}</div>
      <div className="pp-foot">Harborline Health Plan is a fictional payer. No real member data appears here.</div>
      {p.loading && <div className="pp-veil" onClick={blocked} role="status"><div className="pp-wait">Please wait while we process your request</div></div>}
      {p.modal && (
        <div className="pp-veil" onClick={blocked}>
          <div className="pp-modal" role="dialog" aria-modal="true" aria-label="Portal message" onClick={(e) => e.stopPropagation()}>
            {p.modal === 'notice' && (<>
              <h3>Scheduled maintenance</h3>
              <p>The portal will be unavailable Saturday from 11:00 PM to 3:00 AM Eastern. Transactions in progress at that time will not be saved.</p>
              <div className="pp-row">{btn('I understand', 'modal-ok', () => dispatch({ type: 'payer.modal', choice: 'dismiss' }), 'pp-primary')}</div>
            </>)}
            {p.modal === 'survey' && (<>
              <h3>How are we doing?</h3>
              <p>Help us improve the provider portal. The survey takes about five minutes.</p>
              <div className="pp-row">{btn('Take the survey', 'modal-survey', () => dispatch({ type: 'payer.modal', choice: 'dismiss' }))}{btn('No thanks', 'modal-ok', () => dispatch({ type: 'payer.modal', choice: 'dismiss' }))}</div>
            </>)}
            {p.modal === 'expiring' && (<>
              <h3>Are you still there?</h3>
              <p>Your session is about to end because of inactivity. Unsaved work will be lost.</p>
              <div className="pp-row">{btn('Stay signed in', 'modal-stay', () => dispatch({ type: 'payer.modal', choice: 'stay' }), 'pp-primary')}</div>
            </>)}
            {p.modal === 'withdraw' && (<>
              <h3>Withdraw this {p.screen === 'paDone' ? 'request' : 'claim'}?</h3>
              <p>This cannot be undone. A withdrawn {p.screen === 'paDone' ? 'request' : 'claim'} must be filed again from the start.</p>
              <div className="pp-row">{btn('Yes, withdraw', 'modal-confirm', () => dispatch({ type: 'payer.modal', choice: 'confirm' }))}{btn('Cancel', 'modal-cancel', () => dispatch({ type: 'payer.modal', choice: 'cancel' }), 'pp-primary')}</div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
