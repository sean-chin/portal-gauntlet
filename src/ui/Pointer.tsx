import { useLayoutEffect, useState, type RefObject } from 'react';
import type { Action } from '../engine/types';
import type { Point } from '../useRun';

/** The name an on-screen control answers to. Only rendered on screens nobody is driving, so it cannot be used as a hook. */
export function actKey(a: Action): string {
  switch (a.type) {
    case 'tab': return `tab:${a.tab}`;
    case 'ehr.open': return `open:${a.id}`;
    case 'ehr.set': return `eset:${a.key}`;
    case 'payer.nav': return `nav:${a.screen}`;
    case 'payer.set': return `set:${a.key}`;
    case 'payer.pick': return `pick:${a.index}`;
    case 'payer.modal': return `modal:${a.choice}`;
    default: return a.type;
  }
}
export const act = (frozen: boolean | undefined, key: string) => (frozen ? { 'data-act': key } : {});

/** A cursor that travels to whatever the scripted operator is about to press. */
export function Pointer({ point, box }: { point: Point | null; box: RefObject<HTMLElement> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const root = box.current;
    if (!point || !root) return;
    const key = actKey(point.action);
    const el = Array.from(root.querySelectorAll<HTMLElement>('[data-act]')).find((e) => e.dataset.act === key);
    if (!el) return;
    // Bring the target into view inside its own scrolling screen, never the page.
    const pane = el.closest<HTMLElement>('.screen, .demo-screen');
    if (pane) {
      const pr = pane.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.bottom > pr.bottom - 12) pane.scrollTop += er.bottom - pr.bottom + 40;
      else if (er.top < pr.top + 12) pane.scrollTop -= pr.top - er.top + 40;
    }
    const b = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setPos({ x: r.left - b.left + Math.min(r.width / 2, 70), y: r.top - b.top + r.height / 2 });
  }, [point, box]);
  if (!pos) return null;
  return (
    <div className="pointer" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} aria-hidden="true">
      <i key={point?.n} />
      <svg width="18" height="22" viewBox="0 0 18 22"><path d="M1 1v17l4.6-4.2 3 7 2.6-1.1-3-6.9H15z" fill="#14181d" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg>
    </div>
  );
}
