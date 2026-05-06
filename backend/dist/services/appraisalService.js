import { query } from "../db.js";
import { ApiError } from "../utils/ApiError.js";
import { getActiveReviewPeriod } from "./reviewPeriodService.js";
export async function ensureKpiEditable(kpiId) {
    const result = await query("SELECT * FROM kpis WHERE id = $1", [kpiId]);
    const kpi = result.rows[0];
    if (!kpi) {
        throw new ApiError(404, "KPI not found");
    }
    if (kpi.status === "approved") {
        throw new ApiError(409, "Approved KPIs are locked");
    }
    await ensureAppraisalMutable(kpi.appraisal_id);
    return kpi;
}
export async function ensureKpiExists(kpiId) {
    const result = await query("SELECT * FROM kpis WHERE id = $1", [kpiId]);
    const kpi = result.rows[0];
    if (!kpi) {
        throw new ApiError(404, "KPI not found");
    }
    return kpi;
}
export async function ensureAppraisalMutable(appraisalId) {
    const result = await query("SELECT * FROM appraisals WHERE id = $1", [appraisalId]);
    const appraisal = result.rows[0];
    if (!appraisal) {
        throw new ApiError(404, "Appraisal not found");
    }
    if ((appraisal.employee_signed && appraisal.manager_signed) || appraisal.status === "completed") {
        throw new ApiError(409, "Signed appraisals are immutable");
    }
    return appraisal;
}
export async function getOrCreateAppraisal(userId, period) {
    const existing = await query("SELECT * FROM appraisals WHERE user_id = $1 AND period = $2", [userId, period]);
    if (existing.rows[0]) {
        return existing.rows[0];
    }
    const created = await query(`
      INSERT INTO appraisals (user_id, period, status, employee_signed, manager_signed)
      VALUES ($1, $2, 'draft', FALSE, FALSE)
      RETURNING *
    `, [userId, period]);
    return created.rows[0];
}
export async function getOrCreateActiveAppraisal(userId) {
    const activePeriod = await getActiveReviewPeriod();
    return getOrCreateAppraisal(userId, activePeriod.name);
}
export async function assertKpiWeightTotal(appraisalId, userId, nextWeight, excludeKpiId) {
    const existing = await getKpiWeightTotal(appraisalId, userId, excludeKpiId);
    const finalTotal = Number((existing + (nextWeight ?? 0)).toFixed(2));
    if (finalTotal > 100) {
        throw new ApiError(400, "KPI weights cannot exceed 100%");
    }
    return finalTotal;
}
export async function getKpiWeightTotal(appraisalId, userId, excludeKpiId) {
    const result = await query(`
      SELECT COALESCE(SUM(weight), 0)::text AS total
      FROM kpis
      WHERE appraisal_id = $1 AND user_id = $2
      AND ($3::int IS NULL OR id <> $3)
    `, [appraisalId, userId, excludeKpiId ?? null]);
    return Number(result.rows[0]?.total || 0);
}
export async function ensureAdditionalKpiCapacity(appraisalId, userId) {
    const total = await getKpiWeightTotal(appraisalId, userId);
    if (Number(total.toFixed(2)) >= 100) {
        throw new ApiError(400, "The total KPI weight is already 100%. No more KPIs can be added.");
    }
}
export async function requireExactKpiWeightTotal(appraisalId, userId) {
    const result = await query(`
      SELECT COALESCE(SUM(weight), 0)::text AS total
      FROM kpis
      WHERE appraisal_id = $1 AND user_id = $2
    `, [appraisalId, userId]);
    const total = Number(result.rows[0]?.total || 0);
    if (Number(total.toFixed(2)) !== 100) {
        throw new ApiError(400, "KPI weights must equal exactly 100% before submission or approval");
    }
}
export async function getPerformanceByKpi(kpiId) {
    const result = await query("SELECT * FROM performance WHERE kpi_id = $1", [kpiId]);
    return result.rows[0] ?? null;
}
export async function requirePerformanceForFinal(kpiId) {
    const performance = await getPerformanceByKpi(kpiId);
    if (!performance) {
        throw new ApiError(404, "Performance record not found");
    }
    if (performance.self_score === null || performance.manager_score === null) {
        throw new ApiError(400, "Final score requires both self_score and manager_score");
    }
    return performance;
}
