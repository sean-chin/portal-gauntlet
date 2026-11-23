// A reference agent that reads only what is on screen: labels, tables and text. No test ids on the portal,
// no peeking at page state. It is the proof that every run can be solved through the real page, and a
// template for wiring in your own agent: export `agent(page, task)` and leave the page ready to finish.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toUs = (long) => { const m = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(long); return `${String(MON.indexOf(m[1]) + 1).padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`; };
const num = (s) => Number(s.replace(/[^0-9.]/g, ''));
class SignedOut extends Error {}

const LABEL = {
  memberId: /member id|subscriber number|id number/i, dob: /birth|dob/i, cpt: /cpt|procedure code|service code/i, icd: /diagnosis|dx code/i,
  dos: /date of service|service date|planned date/i, pos: /place of service|setting|service location/i, units: /units|quantity/i,
  npi: /npi/i, provider: /provider name|requesting clinician/i, claimNo: /claim (number|id|reference)/i,
};

export const agent = (page, task) => run(page, task, true);

/** `careful` off gives the first-draft agent in naive.mjs: same clicks, none of the checking. */
export async function run(page, task, careful) {
  const portal = page.locator('[data-app=portal]');
  const tab = (id) => page.getByTestId(`tab-${id}`).click();
  const pairs = (root) => root.evaluate((el) => Object.fromEntries([...el.querySelectorAll('dt')].map((dt) => [dt.textContent.trim(), dt.nextElementSibling?.textContent.trim() ?? ''])));

  // Wait out loading pages, close whatever pops up, and notice if the portal threw us out.
  async function settle() {
    for (let i = 0; i < 80; i++) {
      if (await portal.getByRole('dialog').isVisible()) {
        const d = portal.getByRole('dialog');
        for (const name of ['I understand', 'No thanks', 'Stay signed in', 'Cancel']) {
          if (await d.getByRole('button', { name }).isVisible()) { await d.getByRole('button', { name }).click(); break; }
        }
      } else if (await portal.getByRole('status').isVisible()) await page.waitForTimeout(150);
      else return;
    }
    throw new Error('The portal never settled');
  }
  async function act(fn) {
    await settle();
    if (await portal.getByRole('heading', { name: 'Provider sign in' }).isVisible()) throw new SignedOut();
    await fn();
    await settle();
    if (await portal.getByRole('heading', { name: 'Provider sign in' }).isVisible()) throw new SignedOut();
  }
  async function signIn() {
    await tab('payer');
    await settle();
    if (!(await portal.getByRole('heading', { name: 'Provider sign in' }).isVisible())) return;
    await portal.getByLabel('Username').fill(task.signIn.user);
    await portal.getByLabel('Password').fill(task.signIn.pass);
    await portal.getByRole('button', { name: 'Sign in' }).click();
    if (await portal.getByRole('heading', { name: 'Verify it is you' }).isVisible()) {
      await tab('auth');
      const code = (await page.getByTestId('auth-code').textContent()).trim();
      await tab('payer');
      await portal.getByLabel('Verification code').fill(code);
      await portal.getByRole('button', { name: 'Verify' }).click();
    }
    await settle();
  }
  const fill = (key, value) => act(() => portal.getByLabel(LABEL[key]).fill(value));
  const press = (name) => act(() => portal.getByRole('button', { name, exact: true }).click());
  // Search, and search again if the portal answers with its temporary error.
  async function search() {
    for (let i = 0; i < 3; i++) {
      await press('Search');
      if (!(await portal.getByRole('alert').isVisible())) return;
      if (!/temporarily/.test(await portal.getByRole('alert').textContent())) throw new Error(`Search failed: ${await portal.getByRole('alert').textContent()}`);
    }
  }
  async function onPortal(work) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { await signIn(); return await work(); } catch (e) { if (!(e instanceof SignedOut)) throw e; }
    }
    throw new Error('Kept getting signed out');
  }
  async function findMember(patient) {
    await fill('memberId', patient.memberId);
    await fill('dob', patient.dob);
    await search();
    // Several people can share the member ID. Pick the row with this patient's first name and birth date.
    const rows = portal.locator('tbody tr');
    await act(() => (careful ? rows.filter({ hasText: patient.dob }).filter({ hasText: patient.first }) : rows.first()).getByRole('button', { name: 'Select' }).click());
  }
  async function chart(mrn) {
    await tab('ehr');
    if (await page.getByTestId('ehr-back').isVisible()) await page.getByTestId('ehr-back').click();
    await page.getByTestId(`ehr-open-${mrn}`).click();
    const banner = await page.getByTestId('ehr-banner').innerText();
    const name = /^(.+), (.+)$/m.exec(banner);
    return { first: name[2].trim(), dob: toUs(/Born (.+)/.exec(banner)[1]), memberId: /Member ID (\S+)/.exec(banner)[1] };
  }
  async function record(values) {
    for (const [key, value] of Object.entries(values)) {
      if (value === '') continue;
      const el = page.getByTestId(`ehr-${key}`);
      if ((await el.evaluate((n) => n.tagName)) === 'SELECT') await el.selectOption(value); else await el.fill(String(value));
    }
    await page.getByTestId('ehr-save').click();
  }

  if (task.id === 'eligibility') {
    const mrn = /MRN (\d+)/.exec(task.brief[0])[1];
    const visit = /primary/.test(task.brief[0]) ? 'Primary care' : /specialist/.test(task.brief[0]) ? 'Specialist' : /urgent/.test(task.brief[0]) ? 'Urgent care' : 'Emergency';
    const patient = await chart(mrn);
    const found = await onPortal(async () => {
      await press('Eligibility');
      await findMember(patient);
      const d = await pairs(portal);
      if (!d['Coverage status'].startsWith('Active')) return { status: 'Inactive', termDate: /terminated (\S+)/.exec(d['Coverage status'])[1], ref: d['Transaction ID'] };
      const copay = await portal.locator('tbody tr').filter({ hasText: new RegExp(visit, 'i') }).locator('td').nth(1).textContent();
      const remaining = d.Remaining ? num(d.Remaining) : careful ? num(d['Individual deductible']) - num(d['Met to date']) : '';
      return { status: 'Active', plan: d.Plan, copay: num(copay), dedRemaining: remaining, ref: d['Transaction ID'] };
    });
    await chart(mrn);
    await record(found);
  } else if (task.id === 'prior-auth') {
    const mrn = /MRN (\d+)/.exec(task.brief[0])[1];
    const patient = await chart(mrn);
    const o = await pairs(page.getByTestId('ehr-order'));
    const order = { cpt: o.Procedure.split(',')[0], icd: o.Diagnosis.split(',')[0], dos: toUs(o['Planned date']), pos: o['Place of service'], units: o.Units,
      urgent: o.Priority === 'Urgent', provider: o['Ordering provider'].split(', NPI ')[0], npi: o['Ordering provider'].split(', NPI ')[1] };
    // The payer's clinical questions are answered from the notes in the chart, never from what would help the request.
    const notes = (await page.getByTestId('ehr-notes').count()) ? await page.getByTestId('ehr-notes').innerText() : '';
    const today = new Date(await page.getByTestId('ehr-today').innerText());
    const answer = (question) => {
      if (!careful) return /past 12 months/i.test(question) ? 'No' : 'Yes';
      if (/past 12 months/i.test(question)) {
        const m = /performed on ([A-Z][a-z]{2} \d{1,2}, \d{4})/.exec(notes);
        return m && (today - new Date(m[1])) / 864e5 <= 365 ? 'Yes' : 'No';
      }
      if (/six weeks/i.test(question)) {
        const m = /began about (\d+) (day|week|month)/.exec(notes);
        return m && Number(m[1]) * { day: 1, week: 7, month: 30 }[m[2]] >= 42 ? 'Yes' : 'No';
      }
      if (/first-line/i.test(question)) return /First-line treatment: completed, no improvement/.test(notes) ? 'Yes' : 'No';
      throw new Error(`No rule for the question: ${question}`);
    };
    const got = await onPortal(async () => {
      await press('Prior authorization');
      await findMember(patient);
      await fill('cpt', order.cpt); await fill('icd', order.icd); await fill('dos', order.dos); await fill('units', order.units);
      await act(() => portal.getByLabel(LABEL.pos).selectOption(order.pos));
      if (order.urgent) await act(() => portal.getByRole('checkbox').check());
      await press('Continue');
      await fill('npi', order.npi); await fill('provider', order.provider);
      await press('Continue');
      if (await portal.getByRole('heading', { name: /clinical questions/ }).isVisible()) {
        const questions = await portal.locator('.pp-qs label > span').allTextContents();
        for (const q of questions) await act(() => portal.getByLabel(q).selectOption(answer(q)));
        await press('Continue');
      }
      await press('Submit request');
      const d = await pairs(portal);
      return { paRef: d['Authorization reference'], paStatus: d.Status };
    });
    await chart(mrn);
    await record(got);
  } else {
    const claims = task.brief[0].match(/CLM\d+/g);
    await tab('ehr');
    const policy = await page.getByTestId('ehr-policy').locator('tbody tr').evaluateAll((rows) => Object.fromEntries(rows.map((r) => [r.cells[0].textContent, r.cells[1].textContent])));
    const found = await onPortal(async () => {
      const out = {};
      await press('Claims');
      for (const no of claims) {
        await fill('claimNo', no);
        await search();
        let d = await pairs(portal);
        // Some portals list every status the claim has had. The newest line is the one that counts.
        const lines = await portal.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.cells].map((c) => c.textContent.trim())));
        if (lines.length) {
          const stamp = (us) => us.slice(6) + us.slice(0, 2) + us.slice(3, 5);
          const [, status, paid, reason] = careful ? lines.sort((a, b) => stamp(a[0]).localeCompare(stamp(b[0]))).at(-1) : lines[0];
          d = { Status: status, 'Paid amount': paid, 'Adjustment reason': reason };
        }
        const carc = d['Adjustment reason'] ? d['Adjustment reason'].split(':')[0] : '';
        out[no] = { status: d.Status, paid: d.Status === 'Paid' ? num(d['Paid amount']) : '', carc, action: policy[carc ? `${d.Status}, ${carc}` : d.Status] };
        await press('Back to search');   // never the Withdraw button that sits beside it
      }
      return out;
    });
    await tab('ehr');
    for (const no of claims) {
      await page.getByTestId(`ehr-open-${no}`).click();
      await record(found[no]);
      await page.getByTestId('ehr-back').click();
    }
  }
}

