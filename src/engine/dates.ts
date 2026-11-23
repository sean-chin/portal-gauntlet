const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
function valid(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Parses ISO, M/D/YYYY and "Mon D, YYYY". Returns ISO or '' when it cannot. */
export function parseDate(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m && valid(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m && valid(+m[3], +m[1], +m[2])) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(s);
  if (m) {
    const mi = MON.findIndex((x) => x.toLowerCase() === m![1].toLowerCase()) + 1;
    if (mi && valid(+m[3], mi, +m[2])) return `${m[3]}-${pad(mi)}-${pad(+m[2])}`;
  }
  return '';
}
export const isStrictUs = (s: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(s.trim()) && parseDate(s) !== '';
export function us(iso: string): string { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; }
export function longDate(iso: string): string { const [y, m, d] = iso.split('-'); return `${MON[+m - 1]} ${+d}, ${y}`; }
export function isoFrom(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}`; }
