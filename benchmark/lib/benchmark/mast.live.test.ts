import { it, expect } from 'vitest';
import { answerMastCase } from './mast';
it('evaluates a synthetic case using the real multi-agent consilium', async () => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing');
  const started=Date.now();
  const result=await answerMastCase('Synthetic case. A 44-year-old person has polyuria and polydipsia for 3 weeks. Fasting plasma glucose is 340 mg/dL, HbA1c 11.4%, serum ketones negative. Hemodynamically stable. Provide likely diagnosis, differential and safe next steps.');
  if (!('response' in result)) throw new Error('Expected MAST general response schema');
  const output=result.response;
  const hasClinicalContent=/diabet|hyperglyc|glycemi/i.test(output);
  console.log(JSON.stringify({elapsedMs:Date.now()-started,responseLength:output.length,hasClinicalContent,hasDiagnosis:/Most likely diagnosis:/.test(output),hasRationale:/Rationale:/.test(output)}));
  expect(output.length).toBeGreaterThan(80);
  expect(hasClinicalContent).toBe(true);
}, 420000);
