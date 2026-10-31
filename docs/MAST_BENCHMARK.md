# Doctor Opus Consilium — MAST benchmark adapter

This is an experimental adapter, NOT an official MAST submission.

## Integration
- Route: `POST /api/benchmark/mast`
- Content type: `text/plain`
- Authorization: `Bearer <MAST_BENCHMARK_TOKEN>`
- Response: `{"response":"..."}`
- The route reuses the existing `runConsilium` and returns a text response without another LLM call.
- Set a long random `MAST_BENCHMARK_TOKEN` in the server environment, never in the repository.

## Local smoke test
```bash
npm install
MAST_BENCHMARK_TOKEN=local-test-secret npm run dev:plain
curl -X POST http://localhost:3000/api/benchmark/mast \
  -H 'Authorization: Bearer local-test-secret' \
  -H 'Content-Type: text/plain' \
  --data-binary 'Synthetic test case'
npm run test:unit
```

## Before live evaluation
1. Configure and verify cloud LLM provider credentials.
2. Disable request/response logs, caches, tracing, third-party retention, and other durable persistence for official MAST cases.
3. Check official task-specific schemas, timeout, provider terms and rubric.
4. Verify benchmarking costs and concurrency limits.
5. Run official endpoint validator and open clinical test sets.
6. Confirm registration eligibility and secure MAST team acceptance.

**Not yet proven:** actual model inference, official validator pass, production zero-retention compliance, or scoring on private MAST cases.
