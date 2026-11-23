import { longDate, us } from '../engine/dates';
import type { Action, State, World } from '../engine/types';
import { ehrFields, SOP, VISIT_LABEL } from '../engine/world';

interface P { world: World; state: State; dispatch: (a: Action) => void; frozen?: boolean }
const OTHERS = ['J. Farrow', 'M. Castell'];

export function Ehr({ world: w, state: s, dispatch, frozen }: P) {
  const e = s.ehr;
  const claims = w.cfg.task === 'claim-status';
  const fields = ehrFields(w.cfg.task);
  const patient = w.patients.find((p) => p.id === e.recordId);
  const claim = w.claims.find((c) => c.no === e.recordId);
  return (
    <div className="ehr" data-app="ehr">
      <div className="ehr-bar">
        <strong>Larkspur EHR</strong>
        <span>Fennmore General Hospital</span>
        <span className="ehr-user">Signed in as RCM Agent 07</span>
      </div>
      <div className="ehr-menu">
        <span className={e.screen === 'list' ? 'on' : ''}>{claims ? 'Follow-up queue' : 'Schedule'}</span>
        <span className={e.screen === 'record' ? 'on' : ''}>{claims ? 'Claim' : 'Chart'}</span>
        <span>Reports</span><span>Messages</span>
      </div>
      {e.screen === 'list' && !claims && (
        <div className="ehr-body">
          <h2>Schedule for Thursday, December 3, 2026</h2>
          <table className="ehr-table" data-testid="ehr-schedule">
            <thead><tr><th>Time</th><th>Patient</th><th>MRN</th><th>Date of birth</th><th>Visit type</th><th /></tr></thead>
            <tbody>
              {w.patients.map((p) => (
                <tr key={p.id}>
                  <td>{p.appt}</td><td>{p.last}, {p.first}</td><td>{p.mrn}</td><td>{longDate(p.dob)}</td><td>{VISIT_LABEL[p.visit]}</td>
                  <td><button type="button" disabled={frozen} data-testid={`ehr-open-${p.mrn}`} onClick={() => dispatch({ type: 'ehr.open', id: p.id })}>Open chart</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {e.screen === 'list' && claims && (
        <div className="ehr-body">
          <h2>Claim follow-up queue</h2>
          <table className="ehr-table" data-testid="ehr-queue">
            <thead><tr><th>Claim</th><th>Patient</th><th>Date of service</th><th>Billed</th><th>Assigned to</th><th>Worked</th><th /></tr></thead>
            <tbody>
              {w.claims.map((c, i) => (
                <tr key={c.no}>
                  <td>{c.no}</td><td>{c.patient}</td><td>{longDate(c.dos)}</td><td>${c.billed.toFixed(2)}</td>
                  <td>{c.mine ? 'You' : OTHERS[i % 2]}</td><td>{e.saved[c.no] ? 'Yes' : 'No'}</td>
                  <td><button type="button" disabled={frozen} data-testid={`ehr-open-${c.no}`} onClick={() => dispatch({ type: 'ehr.open', id: c.no })}>Open claim</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Follow-up policy</h3>
          <table className="ehr-table ehr-narrow" data-testid="ehr-policy">
            <thead><tr><th>Payer says</th><th>Next action</th></tr></thead>
            <tbody>{SOP.map((r) => <tr key={r.when}><td>{r.when}</td><td>{r.action}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {e.screen === 'record' && (
        <div className="ehr-body">
          {patient && (
            <div className="ehr-banner" data-testid="ehr-banner">
              <div><b>{patient.last}, {patient.first}</b></div>
              <div>MRN {patient.mrn}</div>
              <div>Born {longDate(patient.dob)}</div>
              <div>Insurance: {w.payerName}</div>
              <div>Member ID {patient.memberId}</div>
            </div>
          )}
          {claim && (
            <div className="ehr-banner" data-testid="ehr-banner">
              <div><b>Claim {claim.no}</b></div><div>{claim.patient}</div><div>MRN {claim.mrn}</div>
              <div>Service {longDate(claim.dos)}</div><div>Billed ${claim.billed.toFixed(2)}</div><div>Payer: {w.payerName}</div>
            </div>
          )}
          {patient && w.order && patient.id === w.targetId && (
            <fieldset className="ehr-box" data-testid="ehr-order">
              <legend>Procedure order</legend>
              <dl>
                <dt>Procedure</dt><dd>{w.order.cpt}, {w.order.cptDesc}</dd>
                <dt>Diagnosis</dt><dd>{w.order.icd}, {w.order.icdDesc}</dd>
                <dt>Planned date</dt><dd>{longDate(w.order.dos)}</dd>
                <dt>Place of service</dt><dd>{w.order.pos}</dd>
                <dt>Units</dt><dd>{w.order.units}</dd>
                <dt>Priority</dt><dd>{w.order.urgent ? 'Urgent' : 'Routine'}</dd>
                <dt>Ordering provider</dt><dd>{w.order.provider}, NPI {w.order.npi}</dd>
              </dl>
            </fieldset>
          )}
          {patient && w.order && patient.id !== w.targetId && <p className="ehr-note">No open orders for this patient.</p>}
          <fieldset className="ehr-box">
            <legend>{w.cfg.task === 'eligibility' ? 'Insurance verification' : w.cfg.task === 'prior-auth' ? 'Authorization' : 'Follow-up'}</legend>
            <div className="ehr-form">
              {fields.map((f) => (
                <label key={f.key} htmlFor={`ehr-${f.key}`}>
                  <span>{f.label}</span>
                  {f.type === 'select' ? (
                    <select id={`ehr-${f.key}`} data-testid={`ehr-${f.key}`} disabled={frozen} value={e.form[f.key] ?? ''} onChange={(ev) => dispatch({ type: 'ehr.set', key: f.key, value: ev.target.value })}>
                      <option value="">Select</option>
                      {f.options!.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input id={`ehr-${f.key}`} data-testid={`ehr-${f.key}`} disabled={frozen} autoComplete="off" value={e.form[f.key] ?? ''} onChange={(ev) => dispatch({ type: 'ehr.set', key: f.key, value: ev.target.value })} />
                  )}
                </label>
              ))}
            </div>
            <div className="ehr-actions">
              <button type="button" disabled={frozen} data-testid="ehr-save" onClick={() => dispatch({ type: 'ehr.save' })}>Save</button>
              <button type="button" disabled={frozen} data-testid="ehr-back" onClick={() => dispatch({ type: 'ehr.back' })}>Back to {claims ? 'queue' : 'schedule'}</button>
              {e.banner && <span className="ehr-saved" role="status">{e.banner} at {us('2026-12-03')}</span>}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
