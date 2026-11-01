import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(__dirname,'.')}},test:{include:['lib/benchmark/mast.synthetic-fhir.live.test.ts'],environment:'node'}});
