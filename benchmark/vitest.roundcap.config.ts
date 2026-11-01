import { defineConfig } from 'vitest/config';
import path from 'node:path';

// A dedicated contest-only harness prevents unrelated paid workflows from
// running when the benchmark's default live-test file list changes.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { include: ['lib/benchmark/mast.cpc.roundcap.pilot.live.test.ts'], environment: 'node' }
});
