export function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export interface Rng { next(): number; int(lo: number, hi: number): number; pick<T>(a: readonly T[]): T; shuffle<T>(a: readonly T[]): T[]; digits(n: number): string }
export function rng(...parts: (string | number)[]): Rng {
  let a = hash(...parts);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next, int,
    pick: (arr) => arr[int(0, arr.length - 1)],
    shuffle: (arr) => { const b = [...arr]; for (let i = b.length - 1; i > 0; i--) { const j = int(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; },
    digits: (n) => { let s = ''; for (let i = 0; i < n; i++) s += int(i === 0 ? 1 : 0, 9); return s; },
  };
}
