import type { PolicyId } from './engine/bots';
import type { Level, TaskId } from './engine/types';
import { MIXABLE, type FrictionKey } from './engine/world';

export interface RunRoute { task: TaskId; level: Level; seed: number; bot: PolicyId | null; only?: FrictionKey[] }
export interface ReplayRoute extends RunRoute { log: string; by: string }
export type Route = { page: 'home' } | { page: 'report' } | ({ page: 'run' } & RunRoute) | ({ page: 'replay' } & ReplayRoute);
const TASKS: TaskId[] = ['eligibility', 'prior-auth', 'claim-status'];
const LEVELS: Level[] = ['calm', 'typical', 'hostile', 'custom'];
const BOTS: PolicyId[] = ['recorded', 'patched', 'reference'];

/** Reads "#/run?task=..&level=..&seed=..&bot=..". Anything unrecognised falls back to a safe default. */
export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  if (path === 'report') return { page: 'report' };
  if (path !== 'run' && path !== 'replay') return { page: 'home' };
  const q = new URLSearchParams(query);
  const pickOf = <T extends string>(all: T[], v: string | null, d: T): T => (all.includes(v as T) ? (v as T) : d);
  const seed = Number.parseInt(q.get('seed') ?? '', 10);
  const bot = q.get('bot');
  const level = pickOf(LEVELS, q.get('level'), 'typical');
  const only = level === 'custom' ? (q.get('fr') ?? '').split(',').filter((k): k is FrictionKey => MIXABLE.includes(k as FrictionKey)) : undefined;
  const run: RunRoute = {
    task: pickOf(TASKS, q.get('task'), 'eligibility'),
    level,
    seed: Number.isFinite(seed) && seed >= 0 && seed <= 999999 ? seed : 1,
    bot: BOTS.includes(bot as PolicyId) ? (bot as PolicyId) : null,
    ...(only ? { only: MIXABLE.filter((k) => only.includes(k)) } : {}),
  };
  if (path === 'replay') return { page: 'replay', ...run, bot: null, log: (q.get('log') ?? '').slice(0, 60000), by: (q.get('by') ?? '').replace(/[^\w .,()-]/g, '').slice(0, 40) };
  return { page: 'run', ...run };
}
const base = (r: RunRoute) => `task=${r.task}&level=${r.level}&seed=${r.seed}${r.level === 'custom' ? `&fr=${(r.only ?? []).join(',')}` : ''}`;
export function runHref(r: RunRoute): string {
  return `#/run?${base(r)}${r.bot ? `&bot=${r.bot}` : ''}`;
}
export function replayHref(r: RunRoute, log: string, by: string): string {
  return `#/replay?${base(r)}${by ? `&by=${encodeURIComponent(by)}` : ''}&log=${log}`;
}
