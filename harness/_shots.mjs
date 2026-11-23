import { chromium } from 'playwright';
const BASE='http://localhost:4173'; const out=process.argv[2]; const only=process.argv[3];
const b = await chromium.launch();
const errs=[];
export const shot = async (name, url, w, h, prep, full=false, dsf=2, clip) => {
  if (only && !name.includes(only)) return;
  const c = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor: dsf, permissions: ['clipboard-read','clipboard-write'] });
  const p = await c.newPage(); p.on('pageerror', e=>errs.push(name+': '+e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(name+': '+m.text()); });
  await p.goto(BASE+url); await p.waitForTimeout(400); const el = prep ? await prep(p) : null;
  if (el) await el.screenshot({ path:`${out}/${name}.png` }); else await p.screenshot({ path:`${out}/${name}.png`, fullPage: full }); await c.close();
};
const fast = async (p) => { await p.locator('.botbar select').selectOption('6'); };
const done = async (p) => { await fast(p); await p.waitForSelector('[data-testid=result]', { timeout: 180000 }); await p.waitForTimeout(300); };
const set = process.argv[4] ?? 'r2';
if (set === 'r2') {
await shot('01-obstacle-mixer', '/#/', 1440, 1000, async p => { await p.getByText('Your own mix').click(); await p.waitForTimeout(300); return p.locator('section.start'); });
await shot('02-one-obstacle-at-a-time', '/#/', 1440, 1000, async p => { await p.waitForFunction(() => !document.querySelector('.ones td.wait'), null, {timeout: 60000}); return p.locator('section[aria-labelledby=one-h]'); });
await shot('03-clinical-notes-in-chart', '/#/run?task=prior-auth&level=typical&seed=2', 1440, 900, async p => { const mrn = (await p.getByTestId('work-order').innerText()).match(/MRN (\d+)/)[1]; await p.getByTestId('ehr-open-'+mrn).click(); });
await shot('04-clinical-questions-on-portal', '/#/run?task=prior-auth&level=typical&seed=2&bot=reference', 1440, 900, async p => { await p.waitForSelector('text=step 4 of 5'); await p.waitForTimeout(700); await p.getByRole('button',{name:'Pause'}).click(); await p.waitForTimeout(500); });
await shot('05-false-answer-flagged', '/#/run?task=prior-auth&level=custom&fr=clinical&seed=3&bot=patched', 1440, 900, async p => { await done(p); });
await shot('06-shared-replay-link', '/#/run?task=claim-status&level=hostile&seed=4&bot=patched', 1440, 900, async p => { await done(p); await p.getByTestId('share').click(); await p.waitForTimeout(500); const url = await p.evaluate(() => navigator.clipboard.readText()); console.log('replay url length', url.length); await p.goto(url); await p.waitForSelector('[data-testid=result]'); await p.waitForTimeout(400); });
}
if (set === 'r3') {
await shot('01-report-scripted-operators', '/#/report', 1440, 900, async p => { await p.waitForSelector('[data-testid=group-reference]', {timeout: 120000}); await p.locator('[data-testid=group-patched] .heat a.unsafe').first().hover(); }, true);
await shot('02-report-with-your-agent', '/#/report', 1440, 900, async p => { await p.waitForSelector('[data-testid=group-reference]', {timeout: 120000}); await p.getByTestId('load-summary').setInputFiles('harness/out/summary.json'); await p.waitForSelector('[data-testid=group-yours]'); await p.locator('[data-testid=group-yours] .heat a').first().hover(); });
await shot('03-report-phone', '/#/report', 390, 844, async p => { await p.waitForSelector('[data-testid=group-reference]', {timeout: 120000}); }, true, 1);
}
await b.close(); console.log(errs.length? errs.join('\n') : 'no page errors');
