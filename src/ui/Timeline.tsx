import type { Frame, Obstacle } from '../engine/types';

const LANES: { app: Frame['ev']['app']; name: string }[] = [{ app: 'ehr', name: 'EHR' }, { app: 'portal', name: 'Portal' }];
const secs = (ms: number) => `${Math.round(ms / 1000)}s`;

/** The whole run on one strip: what was done where, what the portal did on its own, and how long each obstacle stood. */
export function Timeline({ frames, obstacles, duration, at, onPick }: { frames: Frame[]; obstacles: Obstacle[]; duration: number; at: number; onPick: (i: number) => void }) {
  const end = Math.max(duration, frames[frames.length - 1]?.ev.at ?? 0, 1);
  const x = (ms: number) => `${(100 * Math.min(ms, end)) / end}%`;
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - box.left) / box.width) * end;
    let best = 0;
    frames.forEach((f, i) => { if (Math.abs(f.ev.at - t) < Math.abs(frames[best].ev.at - t)) best = i; });
    onPick(best);
  };
  const marks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * end);
  return (
    <div className="tl" role="img" aria-label={`Timeline of the run: ${frames.length} steps over ${secs(end)}, ${obstacles.length} obstacles.`}>
      <div className="tl-names">{LANES.map((l) => <span key={l.app}>{l.name}</span>)}<span>Obstacles</span></div>
      <div className="tl-track" onClick={pick}>
        {LANES.map((l) => (
          <div key={l.app} className="tl-lane">
            {frames.map((f, i) => (f.ev.app === l.app ? <i key={i} className={`${f.ev.ok ? '' : 'bad '}${f.ev.who === 'system' ? 'sys' : ''}`} style={{ left: x(f.ev.at) }} /> : null))}
          </div>
        ))}
        <div className="tl-lane tl-obs">
          {obstacles.map((o, i) => (
            <b key={i} className={o.clearedAt === null ? 'open' : ''} title={`${o.name}${o.clearedAt === null ? ', never handled' : ''}`}
              style={{ left: x(o.at), width: `max(6px, calc(${x(o.clearedAt ?? end)} - ${x(o.at)}))` }} />
          ))}
        </div>
        {frames.map((f, i) => (f.ev.app === 'bench' && f.ev.text.startsWith('Switched') ? <u key={i} style={{ left: x(f.ev.at) }} /> : null))}
        {frames[at] && <s style={{ left: x(frames[at].ev.at) }} />}
      </div>
      <div className="tl-axis">{marks.map((m) => <span key={m} style={{ left: x(m) }}>{secs(m)}</span>)}</div>
      <p className="tl-key muted"><i /> action <i className="bad" /> action that did nothing <i className="sys" /> the portal acting on its own <u /> tab switch <b /> obstacle, from when it appeared until it was handled</p>
    </div>
  );
}
