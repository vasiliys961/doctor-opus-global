import {defineConfig} from 'vitest/config';
export default defineConfig({test:{
 include:['lib/benchmark/thyroid-ultrasound-public-three.live.test.ts'],
 testTimeout:1200000,hookTimeout:1200000,maxWorkers:1,fileParallelism:false
}});
