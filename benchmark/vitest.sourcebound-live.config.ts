import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(__dirname,'.')}},test:{include:['lib/benchmark/source-bound-rexrank-two.live.test.ts'],environment:'node',testTimeout:900000}});
