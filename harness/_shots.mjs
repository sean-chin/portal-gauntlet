import { chromium } from 'playwright';
const BASE='http://localhost:4173'; const out=process.argv[2];
const b = await chromium.launch();
const errs=[];
const shot = async (name, url, w, h, prep, full=false, dsf=2) => {
  const c = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor: dsf });
  const p = await c.newPage(); p.on('pageerror', e=>errs.push(name+': '+e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(name+': '+m.text()); });
  await p.goto(BASE+url); await p.waitForTimeout(400); if (prep) await prep(p);
  await p.screenshot({ path:`${out}/${name}.png`, fullPage: full }); await c.close();
};
const done = async (p) => { await p.waitForSelector('[data-testid=result]', { timeout: 180000 }); await p.waitForTimeout(300); };
await shot('01-landing-live-run', '/#/', 1440, 900, async p => { await p.waitForSelector('.pointer'); await p.waitForTimeout(6000); });
await shot('02-scripted-run-with-cursor', '/#/run?task=prior-auth&level=hostile&seed=7&bot=reference', 1440, 900, async p => { await p.waitForSelector('text=step 2 of'); await p.waitForTimeout(2500); });
await shot('03-why-it-fell-short', '/#/run?task=prior-auth&level=typical&seed=2&bot=patched', 1440, 900, async p => { await p.locator('.botbar select').selectOption('6'); await done(p); }, true);
await shot('04-timeline-hostile', '/#/run?task=claim-status&level=hostile&seed=4&bot=patched', 1440, 900, async p => { await p.locator('.botbar select').selectOption('6'); await done(p); await p.getByRole('button',{name:'Show the step'}).first().click(); await p.waitForTimeout(900); }, true);
await shot('05-phone-result', '/#/run?task=eligibility&level=typical&seed=7&bot=recorded', 390, 844, async p => { await p.locator('.botbar select').selectOption('6'); await done(p); }, true, 1);
await b.close(); console.log(errs.length? errs.join('\n') : 'no page errors');
