import { it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { answerMastCase } from './mast';
import { OFFICIAL_INTERNAL_PILOT_CASES } from './noharm-internal-cases';
import { getDiagnosticApiUsageSnapshot } from '../diagnostics/llm-client';

const MAX_PILOT_SPEND_USD = 5;
const RESULTS_DIR = 'internal-results/noharm-pilot';
const round = (n: number) => Number(n.toFixed(5));

it('private self-evaluation: official NOHARM clinical baseline with budget guard', async () => {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(RESULTS_DIR + '/answers.jsonl', '');
  const started = Date.now();
  let completed = 0;
  let stoppedReason: string | undefined;

  for (const item of OFFICIAL_INTERNAL_PILOT_CASES) {
    const pre = getDiagnosticApiUsageSnapshot();
    if (pre.unpricedCalls > 0) { stoppedReason = 'API did not return actual billed cost'; break; }
    // Allow room for a multiagent case; the limit is checked BETWEEN cases,
    // not a guaranteed strict account cap within concurrently invoked agents.
    if (pre.costUsd >= MAX_PILOT_SPEND_USD * 0.8) { stoppedReason = 'Reached 80% of cost ceiling before next case'; break; }

    const caseStart = Date.now();
    try {
      const result = await answerMastCase(item.prompt);
      if (!('response' in result) || result.response.length < 150) throw Error('Incomplete benchmark response');
      const post = getDiagnosticApiUsageSnapshot();
      const report = {
        id: item.id, response: result.response,
        durationSeconds: round((Date.now() - caseStart) / 1000),
        costUsd: round(post.costUsd - pre.costUsd),
        costKnown: post.unpricedCalls === pre.unpricedCalls,
        llmCalls: post.pricedCalls - pre.pricedCalls,
        unpricedCalls: post.unpricedCalls - pre.unpricedCalls,
        failedCalls: post.failedCalls - pre.failedCalls,
        inputTokens: post.promptTokens - pre.promptTokens,
        outputTokens: post.completionTokens - pre.completionTokens,
        words: result.response.trim().split(/\s+/).length,
      };
      appendFileSync(RESULTS_DIR + '/answers.jsonl', JSON.stringify(report) + '\n');
      console.log('MAST_PILOT_RESULT ' + JSON.stringify({ ...report, response: undefined }));
      // This pilot uses public cases only. Store complete answers in GitHub artifacts
      // for later blind rubric scoring. Do not send expert rubrics to the model.
      completed++;
      if (!report.costKnown) { stoppedReason = 'Missing actual OpenRouter billing in one or more calls'; break; }
      if (post.costUsd >= MAX_PILOT_SPEND_USD) { stoppedReason = 'Reached pilot spending limit'; break; }
    } catch (error) {
      stoppedReason = 'Model call or schema failed: ' + (error instanceof Error ? error.message : 'unknown error');
      console.log('MAST_PILOT_CASE_FAILED ' + JSON.stringify({ id: item.id, reason: stoppedReason }));
      break;
    }
  }

  const total = getDiagnosticApiUsageSnapshot();
  const summary = {
    protocol: 'official NOHARM open baseline, not leaderboard score',
    plannedCases: OFFICIAL_INTERNAL_PILOT_CASES.length, completed,
    totalElapsedSeconds: round((Date.now()-started)/1000),
    actualBilledUsdKnown: total.unpricedCalls === 0,
    trackedApiCostUsd: round(total.costUsd),
    pricedCalls: total.pricedCalls,
    unpricedCalls: total.unpricedCalls,
    failedCalls: total.failedCalls,
    stoppedReason: stoppedReason || null,
    note: 'Scores require separate official Gemini match-and-review rubric judge. This pilot is generation plus cost instrumentation only.',
  };
  writeFileSync(RESULTS_DIR + '/summary.json', JSON.stringify(summary,null,2));
  console.log('MAST_PILOT_SUMMARY ' + JSON.stringify(summary));
  expect(completed).toBeGreaterThan(0);
}, 2400000);
