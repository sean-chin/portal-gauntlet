import { useEffect, useMemo, useState } from 'react';
import { POLICIES, simulate } from '../engine/bots';
import { CAUSE_TITLE, type CauseId } from '../engine/score';
import type { Level, TaskId } from '../engine/types';
import { LEVELS, makeCfg, TASKS } from '../engine/world';
import { runHref } from '../route';

type Verdict = 'pass' | 'partial' | 'unsafe' | 'error';
interface Row { task: TaskId; level: Level; seed: number; verdict: Verdict; score: number; actions: number; reference: number; causes: CauseId[]; href: string }
interface Group { id: string; name: string; note: string; rows: Row[]; yours?: boolean }
const WORD: Record<Verdict, string> = { pass: 'Passed', partial: 'Fell short', unsafe: 'Unsafe', error: 'Crashed' };
const GLYPH: Record<Verdict, string> = { pass: '', partial: '–', unsafe: '×', error: '!' };
const TASK_IDS = TASKS.map((t) => t.id);
const LEVEL_IDS = LEVELS.map((l) => l.id);

/** A results file is input from outside. Keep only fields we know, in the shapes we expect. */
export function readSummary(raw: unknown): Group | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const x = raw as { agent?: unknown; rows?: unknown };
  if (!Array.isArray(x.rows) || x.rows.length === 0 || x.rows.length > 5000) return null;
  const rows: Row[] = [];
  for (const r of x.rows as Record<string, unknown>[]) {
    if (typeof r !== 'object' || r === null) return null;
    if (!TASK_IDS.includes(r.task as TaskId) || !LEVEL_IDS.includes(r.level as Level) || !Number.isInteger(r.seed)) continue;
    const verdict = (['pass', 'partial', 'unsafe'] as Verdict[]).includes(r.verdict as Verdict) ? (r.verdict as Verdict) : 'error';
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const replay = typeof r.replay === 'string' && r.replay.length < 70000 ? /#\/replay\?[A-Za-z0-9_=&%.,()-]+$/.exec(r.replay)?.[0] ?? '' : '';
    rows.push({
      task: r.task as TaskId, level: r.level as Level, seed: r.seed as number, verdict, score: Math.max(0, Math.min(100, num(r.score))),
      actions: num(r.actions), reference: num(r.reference),
      causes: Array.isArray(r.causes) ? (r.causes.filter((c) => typeof c === 'string' && c in CAUSE_TITLE) as CauseId[]) : [],
      href: replay || runHref({ task: r.task as TaskId, level: r.level as Level, seed: r.seed as number, bot: null }),
    });
  }
  if (!rows.length) return null;
  const name = typeof x.agent === 'string' ? x.agent.replace(/[^\w .,()-]/g, '').slice(0, 40) : '';
  return { id: 'yours', name: name || 'Your agent', note: 'Loaded from a results file. Each square opens the replay of that run.', rows, yours: true };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="stat"><span>{label}</span><b>{value}</b>{sub ? <small>{sub}</small> : null}</div>;
}

function GroupView({ g, seeds }: { g: Group; seeds: number[] }) {
  const pass = g.rows.filter((r) => r.verdict === 'pass').length;
  const unsafe = g.rows.filter((r) => r.verdict === 'unsafe').length;
  const mean = Math.round(g.rows.reduce((a, r) => a + r.score, 0) / g.rows.length);
  const done = g.rows.filter((r) => r.verdict === 'pass' && r.reference > 0);
  const extra = done.length ? Math.round((100 * done.reduce((a, r) => a + r.actions / r.reference, 0)) / done.length - 100) : null;
  const counts = new Map<CauseId, number>();
  for (const r of g.rows) for (const c of r.causes) counts.set(c, (counts.get(c) ?? 0) + 1);
  const causes = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = causes[0]?.[1] ?? 1;
  const [tip, setTip] = useState<Row | null>(null);
  const cols = seeds.length ? seeds : [...new Set(g.rows.map((r) => r.seed))].sort((a, b) => a - b);
  return (
    <section className={`group${g.yours ? ' yours' : ''}`} data-testid={`group-${g.id}`}>
      <header>
        <div><h2>{g.name}</h2><p className="muted">{g.note}</p></div>
        <div className="stats">
          <Stat label="Passed" value={`${Math.round((100 * pass) / g.rows.length)}%`} sub={`${pass} of ${g.rows.length} runs`} />
          <Stat label="Unsafe" value={String(unsafe)} sub={unsafe === 1 ? 'run' : 'runs'} />
          <Stat label="Mean score" value={String(mean)} sub="out of 100" />
          <Stat label="Extra actions" value={extra === null ? 'n/a' : `${extra > 0 ? '+' : ''}${extra}%`} sub="on passed runs" />
        </div>
      </header>
      <div className="group-body">
        <div className="heat-wrap">
          <div className="scroll">
            <table className="heat" onMouseLeave={() => setTip(null)}>
              <thead><tr><th>Task</th><th>Portal</th><th colSpan={cols.length}>One square per seed</th><th>Passed</th></tr></thead>
              <tbody>
                {TASKS.map((t) => LEVELS.map((l, li) => {
                  const rs = g.rows.filter((r) => r.task === t.id && r.level === l.id);
                  if (!rs.length) return null;
                  return (
                    <tr key={`${t.id}${l.id}`} className={li === 0 ? 'first' : ''}>
                      <th scope="row">{li === 0 ? t.name : ''}</th><td>{l.name}</td>
                      {cols.map((seed) => {
                        const r = rs.find((x) => x.seed === seed);
                        return <td key={seed} className="cell">{r ? <a className={r.verdict} href={r.href} onMouseEnter={() => setTip(r)} onFocus={() => setTip(r)} aria-label={`${t.name}, ${l.name}, seed ${seed}: ${WORD[r.verdict]}, ${r.score} out of 100`}>{GLYPH[r.verdict]}</a> : <i />}</td>;
                      })}
                      <td className="n">{rs.filter((r) => r.verdict === 'pass').length} of {rs.length}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
          <p className="tip" aria-live="polite">{tip ? <><b>{TASKS.find((t) => t.id === tip.task)!.name}, {tip.level}, seed {tip.seed}.</b> {WORD[tip.verdict]} with {tip.score} out of 100{tip.causes.length ? `. ${tip.causes.map((c) => CAUSE_TITLE[c]).join('. ')}.` : '.'}</> : 'Point at a square to see what happened in that run. Click it to open the run.'}</p>
        </div>
        <div className="why">
          <h3>Why runs fell short</h3>
          {causes.length === 0 ? <p className="muted">Nothing fell short.</p> : (
            <ul>
              {causes.map(([id, n]) => (
                <li key={id}><span>{CAUSE_TITLE[id]}</span><div><i style={{ width: `${(100 * n) / top}%` }} /></div><b>{n}</b></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function Report() {
  const [n, setN] = useState(12);
  const [groups, setGroups] = useState<Group[]>([]);
  const [progress, setProgress] = useState(0);
  const [yours, setYours] = useState<Group | null>(null);
  const [error, setError] = useState('');
  const seeds = useMemo(() => Array.from({ length: n }, (_, i) => i + 1), [n]);

  useEffect(() => {
    // 9 cells for each of three scripted operators, worked through a row at a time so the page stays responsive.
    const jobs = POLICIES.flatMap((p) => TASKS.flatMap((t) => LEVELS.map((l) => ({ p, t, l }))));
    const acc: Group[] = POLICIES.map((p) => ({ id: p.id, name: p.name, note: p.blurb, rows: [] }));
    let i = 0;
    let id = 0;
    setGroups([]); setProgress(0);
    const next = () => {
      const j = jobs[i++];
      const g = acc.find((x) => x.id === j.p.id)!;
      for (const seed of seeds) {
        const r = simulate(makeCfg(j.t.id, seed, j.l.id), j.p.id).result;
        g.rows.push({ task: j.t.id, level: j.l.id, seed, verdict: r.verdict, score: r.score, actions: r.efficiency.actions, reference: r.efficiency.reference, causes: r.causes.map((c) => c.id), href: runHref({ task: j.t.id, level: j.l.id, seed, bot: j.p.id }) });
      }
      setProgress(i / jobs.length);
      if (i < jobs.length) id = window.setTimeout(next, 0); else setGroups(acc.map((x) => ({ ...x })));
    };
    id = window.setTimeout(next, 50);
    return () => window.clearTimeout(id);
  }, [seeds]);

  const load = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (file.size > 20_000_000) { setError('That file is too large to be a results summary.'); return; }
    try {
      const g = readSummary(JSON.parse(await file.text()));
      if (g) setYours(g); else setError('That file does not look like a summary written by the runner.');
    } catch { setError('That file is not valid JSON.'); }
  };

  return (
    <div className="home report">
      <header className="hero">
        <a className="back" href="#/">Portal Gauntlet</a>
        <h1>Report</h1>
        <p className="lede">Every run of every scripted operator, one square each, with the reasons runs fell short. Load the summary your own agent produced to see it on the same page.</p>
      </header>
      <div className="report-bar">
        <label>Seeds per row
          <select value={n} onChange={(e) => setN(Number(e.target.value))}><option value={12}>12</option><option value={24}>24</option><option value={40}>40</option></select>
        </label>
        <label className="btn">Load your agent's summary.json<input type="file" accept="application/json,.json" data-testid="load-summary" onChange={(e) => load(e.target.files?.[0])} /></label>
        <ul className="legend"><li><i className="pass" />Passed</li><li><i className="partial">–</i>Fell short</li><li><i className="unsafe">×</i>Unsafe</li></ul>
      </div>
      {error && <p className="report-error" role="alert">{error}</p>}
      {yours && <GroupView g={yours} seeds={[]} />}
      {groups.length === 0 && <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress * 100}%` }} /><span>Running {POLICIES.length * TASKS.length * LEVELS.length * n} runs in your browser</span></div>}
      {groups.map((g) => <GroupView key={g.id} g={g} seeds={seeds} />)}
      <p className="muted">The scripted operators are plain code, not language models. To get a summary for your own agent, run <code>npm run bench -- --agent ./your-agent.mjs --seed 1,2,3</code> in the repo and load <code>harness/out/summary.json</code> here. The file never leaves your browser.</p>
    </div>
  );
}
