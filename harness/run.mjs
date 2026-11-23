// Runs an agent over a batch of runs and writes one summary.
//
//   npm run build && npm run preview &
//   npm run bench                                        reference agent, every task and level, seed 7
//   npm run bench -- --agent ./my-agent.mjs --level hostile --seed 1,2,3,4,5
//   BASE=https://your-deploy.example npm run bench
//
// An agent is a module that exports `async function agent(page, task)`. It gets a Playwright page already
// on the run and the work order ({ id, level, seed, brief, signIn }). The runner presses finish for it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const levels = arg('level', 'calm,typical,hostile').split(',');
const tasks = arg('task', 'eligibility,prior-auth,claim-status').split(',');
const seeds = arg('seed', '7').split(',').map(Number);
const agentPath = arg('agent', './harness/agents/reference.mjs');
const parallel = Number(arg('parallel', '6'));
const timeout = Number(arg('timeout', '180')) * 1000;
const { agent } = await import(pathToFileURL(resolve(agentPath)).href);

const jobs = [];
for (const task of tasks) for (const level of levels) for (const seed of seeds) jobs.push({ task, level, seed });
const browser = await chromium.launch();
const rows = [];
mkdirSync('harness/out', { recursive: true });

async function one(j) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const row = { ...j, verdict: 'error', score: 0, error: '' };
  try {
    await page.goto(`${BASE}/#/run?task=${j.task}&level=${j.level}&seed=${j.seed}`);
    const task = await page.evaluate(() => window.gauntlet.task);
    await Promise.race([agent(page, task), new Promise((_, no) => setTimeout(() => no(new Error('Timed out')), timeout))]);
    await page.getByTestId('finish').click();
    await page.getByTestId('finish-confirm').click();
    const r = await page.evaluate(() => window.gauntlet.result());
    Object.assign(row, { verdict: r.verdict, score: r.score, fields: `${r.outcome.correct}/${r.outcome.total}`, actions: r.efficiency.actions, reference: r.efficiency.reference,
      obstacles: r.obstacles.length, blocked: r.blocked, violations: r.violations, wrong: r.items.filter((i) => !i.ok).map((i) => `${i.label}: expected ${i.expected}, got ${i.got || '(blank)'}`) });
  } catch (e) {
    row.error = e.message.split('\n')[0];
    await page.screenshot({ path: `harness/out/error-${j.task}-${j.level}-${j.seed}.png` }).catch(() => {});
  }
  if (errors.length) row.pageErrors = errors;
  rows.push(row);
  const tag = row.verdict === 'pass' && !errors.length ? 'ok  ' : 'FAIL';
  console.log(`${tag} ${j.task.padEnd(13)} ${j.level.padEnd(8)} seed ${String(j.seed).padEnd(4)} ${row.verdict.padEnd(8)} ${String(row.score).padStart(3)}/100` +
    (row.error ? `  ${row.error}` : `  ${row.actions} actions (reference ${row.reference}), ${row.obstacles} obstacles`) + (errors.length ? `  page errors: ${errors.join('; ')}` : ''));
  for (const w of [...(row.wrong ?? []), ...(row.violations ?? [])]) console.log(`       ${w}`);
  await page.close();
}

const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => { while (queue.length) await one(queue.shift()); }));
await browser.close();

const by = (level) => rows.filter((r) => r.level === level);
const summary = {
  base: BASE, agent: agentPath, runs: rows.length,
  passRate: rows.filter((r) => r.verdict === 'pass').length / rows.length,
  unsafe: rows.filter((r) => r.verdict === 'unsafe').length,
  byLevel: Object.fromEntries(levels.map((l) => [l, { runs: by(l).length, pass: by(l).filter((r) => r.verdict === 'pass').length, meanScore: Math.round(by(l).reduce((a, r) => a + r.score, 0) / Math.max(1, by(l).length)) }])),
  rows: rows.sort((a, b) => `${a.task}${a.level}${a.seed}`.localeCompare(`${b.task}${b.level}${b.seed}`)),
};
writeFileSync('harness/out/summary.json', JSON.stringify(summary, null, 2));
console.log(`\n${rows.filter((r) => r.verdict === 'pass').length} of ${rows.length} passed, ${summary.unsafe} unsafe. Summary written to harness/out/summary.json`);
process.exit(rows.every((r) => r.verdict === 'pass' && !r.pageErrors) ? 0 : 1);
