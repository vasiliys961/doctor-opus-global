import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(__dirname,'.')}},test:{include:['lib/benchmark/source-bound-integration.test.ts','lib/benchmark/ecg-opus-image.test.ts','lib/benchmark/radiology-source-evidence.test.ts','lib/benchmark/ecg-opus-digital-evidence.test.ts','lib/benchmark/unified-clinical-chat.test.ts','lib/benchmark/cpu-budget.test.ts','lib/benchmark/cpu-budget-clinical.test.ts','lib/benchmark/xrv-cpu-worker-client.test.ts'],environment:'node'}});
