import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(__dirname,'.')}},
 test:{include:['lib/benchmark/isic-risk-replay.test.ts'],environment:'node'}});
