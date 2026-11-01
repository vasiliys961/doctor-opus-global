import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(__dirname,'.')}},test:{include:['lib/benchmark/medagentbench-v2-heart-rate.live.test.ts'],environment:'node'}});
