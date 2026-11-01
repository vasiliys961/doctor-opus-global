import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve: { alias: { '@': path.resolve(__dirname, '.') } }, test: { include: ['lib/benchmark/mast.test.ts','lib/benchmark/vision-complex-routing.test.ts','lib/benchmark/mast.roundcap.test.ts','lib/benchmark/medical-vision.test.ts','lib/benchmark/mast.opus-default.test.ts','lib/benchmark/clinical-safety-review.test.ts','lib/benchmark/drug-label-evidence.test.ts','lib/benchmark/derm-risk-triage.test.ts'], environment: 'node' } });
