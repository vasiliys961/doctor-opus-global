// Providers' prices are variable. Do not fabricate accounting precision.
export function calculateCost(_input: number, _output: number, _model: string) {
  return { totalCostUsd: 0 };
}
