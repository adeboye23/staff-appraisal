export function calculateWeightedScore(actual: number, target: number, weight: number) {
  if (target <= 0) return 0;
  return Number(((actual / target) * weight).toFixed(2));
}
