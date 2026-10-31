import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve: { alias: { '@': path.resolve(__dirname, '.') } }, test: { include: ['lib/benchmark/mast.live.test.ts','lib/benchmark/mast.batch.test.ts'], environment: 'node' } });
