import { query } from "../db.js";
import { ApiError } from "../utils/ApiError.js";
import { getActiveReviewPeriod } from "./reviewPeriodService.js";
export async function ensureAppraisalWorkflowColumns() {
    await query(`
      ALTER TABLE performance
      ADD COLUMN IF NOT EXISTS target_self_score NUMERIC(8,2)
    `);
    await query(`
      UPDATE performance
      SET target_self_score = self_score,
          self_score = NULL,
          updated_at = NOW()
      WHERE target_self_score IS NULL
        AND self_score IS NOT NULL
        AND manager_score IS NULL
        AND final_score IS NULL
    `);
    await query(`
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS evaluation_unlocked_by_hr BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await query(`
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS evaluation_unlocked_at TIMESTAMP
    `);
    await query(`
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS review_date DATE
    `);
    await query(`
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS director_overall_remark TEXT
    `);
    await query(`
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS director_improvement_suggestions TEXT
    `);
    await query(`
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS director_training_recommendations TEXT
    `);
}
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
    await ensureAppraisalWithinReviewDate(kpi.appraisal_id, "This appraisal is closed because the review date has passed.");
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
export async function getOrCreateAppraisal(userId, period, reviewDate) {
    const existing = await query("SELECT * FROM appraisals WHERE user_id = $1 AND period = $2", [userId, period]);
    if (existing.rows[0]) {
        if (!existing.rows[0].review_date && reviewDate) {
            const updated = await query(`
          UPDATE appraisals
          SET review_date = $3,
              updated_at = NOW()
          WHERE user_id = $1 AND period = $2
          RETURNING *
        `, [userId, period, reviewDate]);
            return updated.rows[0];
        }
        return existing.rows[0];
    }
    const created = await query(`
      INSERT INTO appraisals (user_id, period, status, review_date, employee_signed, manager_signed)
      VALUES ($1, $2, 'draft', $3, FALSE, FALSE)
      RETURNING *
    `, [userId, period, reviewDate ?? null]);
    return created.rows[0];
}
export async function getOrCreateActiveAppraisal(userId) {
    const activePeriod = await getActiveReviewPeriod();
    if (!activePeriod) {
        throw new ApiError(400, "Create an active review period before adding KPIs.");
    }
    return getOrCreateAppraisal(userId, activePeriod.name, activePeriod.ends_on ?? null);
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
    void appraisalId;
    void userId;
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
export function isReviewDateOpen(reviewDate) {
    if (!reviewDate)
        return true;
    const deadline = new Date(reviewDate);
    if (Number.isNaN(deadline.getTime())) {
        return true;
    }
    deadline.setHours(23, 59, 59, 999);
    return deadline.getTime() >= Date.now();
}
export async function getAppraisalById(appraisalId) {
    const appraisal = await query("SELECT * FROM appraisals WHERE id = $1", [appraisalId]);
    const record = appraisal.rows[0];
    if (!record) {
        throw new ApiError(404, "Appraisal not found");
    }
    return record;
}
export function getEvaluationReviewDate(createdAt) {
    const reviewDate = new Date(createdAt);
    reviewDate.setMonth(reviewDate.getMonth() + 3);
    if (Number.isNaN(reviewDate.getTime())) {
        throw new ApiError(500, "Unable to determine the evaluation date");
    }
    return reviewDate;
}
export async function requireEvaluationStageOpen(appraisalId) {
    const record = await getAppraisalById(appraisalId);
    if (!record.evaluation_unlocked_by_hr) {
        throw new ApiError(400, "HR must open this appraisal for the three-month evaluation stage first.");
    }
    return record;
}
export async function ensureAppraisalWithinReviewDate(appraisalId, message) {
    const record = await getAppraisalById(appraisalId);
    if (!isReviewDateOpen(record.review_date ?? null)) {
        throw new ApiError(409, message ?? "This appraisal is closed because the review date has passed.");
    }
    return record;
}
export async function requireAppraisalReadyForDirector(appraisalId) {
    const result = await query(`
      SELECT
        COUNT(k.id)::text AS total,
        COUNT(k.id) FILTER (WHERE p.final_score IS NOT NULL)::text AS finalized
      FROM kpis k
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE k.appraisal_id = $1
        AND k.status = 'approved'
    `, [appraisalId]);
    const total = Number(result.rows[0]?.total ?? 0);
    const finalized = Number(result.rows[0]?.finalized ?? 0);
    if (total === 0 || finalized < total) {
        throw new ApiError(400, "Director remarks can only be added after all approved KPI final scores are completed.");
    }
    return getAppraisalById(appraisalId);
}
