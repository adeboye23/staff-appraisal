export function calculateWeightedScore(actual, target, weight) {
    if (target <= 0)
        return 0;
    return Number(((actual / target) * weight).toFixed(2));
}
