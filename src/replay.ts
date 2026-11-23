import { initialState, pushFrames, step } from './engine/engine';
import type { Action, Frame, State, World } from './engine/types';
import type { Logged } from './useRun';

const TABS = ['ehr', 'payer', 'auth'];
const SCREENS = ['home', 'elig', 'pa1', 'claims'];
const CHOICES = ['dismiss', 'stay', 'confirm', 'cancel'];
const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;

/** A replay link is input from a stranger. Rebuild each action from known fields only, or reject the lot. */
function clean(a: unknown): Action | null {
  if (typeof a !== 'object' || a === null) return null;
  const x = a as Record<string, unknown>;
  switch (x.type) {
    case 'tab': return TABS.includes(x.tab as string) ? { type: 'tab', tab: x.tab as State['tab'] } : null;
    case 'ehr.open': return str(x.id, 40) ? { type: 'ehr.open', id: x.id } : null;
    case 'ehr.set': return str(x.key, 40) && str(x.value) ? { type: 'ehr.set', key: x.key, value: x.value } : null;
    case 'payer.set': return str(x.key, 40) && str(x.value) ? { type: 'payer.set', key: x.key, value: x.value } : null;
    case 'payer.login': return str(x.user) && str(x.pass) ? { type: 'payer.login', user: x.user, pass: x.pass } : null;
    case 'payer.mfa': return str(x.code, 20) ? { type: 'payer.mfa', code: x.code } : null;
    case 'payer.nav': return SCREENS.includes(x.screen as string) ? { type: 'payer.nav', screen: x.screen as 'home' } : null;
    case 'payer.pick': return Number.isInteger(x.index) && (x.index as number) >= 0 && (x.index as number) < 50 ? { type: 'payer.pick', index: x.index as number } : null;
    case 'payer.modal': return CHOICES.includes(x.choice as string) ? { type: 'payer.modal', choice: x.choice as 'dismiss' } : null;
    case 'ehr.back': case 'ehr.save': case 'payer.submit': case 'payer.back': case 'payer.decoy': case 'payer.blocked': case 'payer.logout': case 'tick': case 'finish':
      return { type: x.type };
    default: return null;
  }
}
export function validate(raw: unknown): Logged[] | null {
  if (!Array.isArray(raw) || raw.length > 4000) return null;
  const out: Logged[] = [];
  let prev = 0;
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== 2) return null;
    const at = row[0];
    const a = clean(row[1]);
    if (typeof at !== 'number' || !Number.isFinite(at) || at < prev || at > 6 * 3600 * 1000 || !a) return null;
    prev = at;
    out.push([Math.round(at), a]);
  }
  return out;
}

const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Packs a run's actions into something short enough to live in a link. */
export async function encodeLog(log: Logged[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(log));
  if (typeof CompressionStream === 'undefined') return `j${b64(bytes)}`;
  return `z${b64(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
}
export async function decodeLog(text: string): Promise<Logged[] | null> {
  try {
    if (!/^[jz][A-Za-z0-9_-]+$/.test(text)) return null;
    let bytes: Uint8Array = unb64(text.slice(1));
    if (text[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    if (bytes.length > 400000) return null;
    return validate(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return null; }
}

/** Runs a logged list of actions through the engine again. Same world, same actions, same result. */
export function rerun(world: World, log: Logged[]): { state: State; frames: Frame[] } {
  let state = initialState();
  let frames: Frame[] = [];
  for (const [at, a] of log) {
    const out = step(world, state, a, at);
    state = out.state;
    frames = pushFrames(frames, out.evs, state);
  }
  return { state, frames };
}
