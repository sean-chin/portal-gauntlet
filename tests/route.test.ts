import { describe, expect, it } from 'vitest';
import { parseRoute, runHref } from '../src/route';

describe('route', () => {
  it('round-trips a run', () => {
    const r = { task: 'claim-status', level: 'hostile', seed: 42, bot: 'patched' } as const;
    expect(parseRoute(runHref(r))).toEqual({ page: 'run', ...r });
  });
  it('falls back to safe values for anything it does not recognise', () => {
    expect(parseRoute('#/run?task=<script>&level=nope&seed=1e99&bot=evil')).toEqual({ page: 'run', task: 'eligibility', level: 'typical', seed: 1, bot: null });
    expect(parseRoute('#/run?seed=-5')).toMatchObject({ seed: 1 });
    expect(parseRoute('')).toEqual({ page: 'home' });
    expect(parseRoute('#/elsewhere')).toEqual({ page: 'home' });
  });
});
