import {it,expect} from 'vitest';
import {runSyntheticFhirTool,SANDBOX_TASKS} from './synthetic-fhir-agent';
it('requires chart review before clinical orders',()=>{
  const state={read:false,orders:[] as string[],flags:[] as string[]};
  expect(runSyntheticFhirTool(state,{tool:'create_service_request',code:'serum-osmolality'},SANDBOX_TASKS[0]).ok).toBe(false);
  expect(runSyntheticFhirTool(state,{tool:'get_observations'},SANDBOX_TASKS[0]).ok).toBe(true);
  expect(runSyntheticFhirTool(state,{tool:'create_service_request',code:'serum-osmolality'},SANDBOX_TASKS[0]).ok).toBe(true);
  expect(state.orders).toEqual(['serum-osmolality']);
});
