import { afterEach, expect, it } from 'vitest';
import { getMaxDebateRoundsForMast } from '../diagnostics/orchestrator';

const initial = process.env.MAST_CONSILIUM_ROUND_CAP;
afterEach(() => {
  if (initial === undefined) delete process.env.MAST_CONSILIUM_ROUND_CAP;
  else process.env.MAST_CONSILIUM_ROUND_CAP = initial;
});

it('preserves the original two debate rounds when no contest experiment is selected', () => {
  delete process.env.MAST_CONSILIUM_ROUND_CAP;
  expect(getMaxDebateRoundsForMast()).toBe(2);
});

it('enables exactly one debate round only with explicit opt-in', () => {
  process.env.MAST_CONSILIUM_ROUND_CAP = '1';
  expect(getMaxDebateRoundsForMast()).toBe(1);
});

it('does not allow unrecognized settings to change the baseline', () => {
  process.env.MAST_CONSILIUM_ROUND_CAP = '3';
  expect(getMaxDebateRoundsForMast()).toBe(2);
});
