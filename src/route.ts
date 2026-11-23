import type { PolicyId } from './engine/bots';
import type { Level, TaskId } from './engine/types';

export interface RunRoute { task: TaskId; level: Level; seed: number; bot: PolicyId | null }
const TASKS: TaskId[] = ['eligibility', 'prior-auth', 'claim-status'];
const LEVELS: Level[] = ['calm', 'typical', 'hostile'];
const BOTS: PolicyId[] = ['recorded', 'patched', 'reference'];

/** Reads "#/run?task=..&level=..&seed=..&bot=..". Anything unrecognised falls back to a safe default. */
export function parseRoute(hash: string): { page: 'home' } | ({ page: 'run' } & RunRoute) {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  if (path !== 'run') return { page: 'home' };
  const q = new URLSearchParams(query);
  const pickOf = <T extends string>(all: T[], v: string | null, d: T): T => (all.includes(v as T) ? (v as T) : d);
  const seed = Number.parseInt(q.get('seed') ?? '', 10);
  const bot = q.get('bot');
  return {
    page: 'run',
    task: pickOf(TASKS, q.get('task'), 'eligibility'),
    level: pickOf(LEVELS, q.get('level'), 'typical'),
    seed: Number.isFinite(seed) && seed >= 0 && seed <= 999999 ? seed : 1,
    bot: BOTS.includes(bot as PolicyId) ? (bot as PolicyId) : null,
  };
}
export function runHref(r: RunRoute): string {
  return `#/run?task=${r.task}&level=${r.level}&seed=${r.seed}${r.bot ? `&bot=${r.bot}` : ''}`;
}
