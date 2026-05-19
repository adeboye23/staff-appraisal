import { query } from "../db.js";
import { ApiError } from "../utils/ApiError.js";
import { getActiveReviewPeriod } from "./reviewPeriodService.js";

type KpiRow = {
  id: number;
  appraisal_id: number;
  user_id: number;
  weight: string;
  target: string;
  status: "draft" | "submitted" | "approved" | "rejected";
};

type PerformanceRow = {
  id: number;
  kpi_id: number;
  actual: string;
  target_self_score: string | null;
  self_score: string | null;
  manager_score: string | null;
  final_score: string | null;
  manager_score_locked: boolean;
};

type AppraisalRow = {
  id: number;
  user_id: number;
  period?: string;
  status: "draft" | "in_review" | "completed";
  review_date?: string | null;
  employee_signed: boolean;
  manager_signed: boolean;
  evaluation_unlocked_by_hr?: boolean;
  evaluation_unlocked_at?: string | null;
  director_overall_remark?: string | null;
  director_improvement_suggestions?: string | null;
  director_training_recommendations?: string | null;
  created_at: string;
};

export async function ensureAppraisalWorkflowColumns() {
  await query(
    `
      ALTER TABLE performance
      ADD COLUMN IF NOT EXISTS target_self_score NUMERIC(8,2)
    `
  );
  await query(
    `
      UPDATE performance
      SET target_self_score = self_score,
          self_score = NULL,
          updated_at = NOW()
      WHERE target_self_score IS NULL
        AND self_score IS NOT NULL
        AND manager_score IS NULL
        AND final_score IS NULL
    `
  );
  await query(
    `
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS evaluation_unlocked_by_hr BOOLEAN NOT NULL DEFAULT FALSE
    `
  );
  await query(
    `
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS evaluation_unlocked_at TIMESTAMP
    `
  );
  await query(
    `
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS review_date DATE
    `
  );
  await query(
    `
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS director_overall_remark TEXT
    `
  );
  await query(
    `
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS director_improvement_suggestions TEXT
    `
  );
  await query(
    `
      ALTER TABLE appraisals
      ADD COLUMN IF NOT EXISTS director_training_recommendations TEXT
    `
  );
}

export async function ensureKpiEditable(kpiId: number) {
  const result = await query<KpiRow>("SELECT * FROM kpis WHERE id = $1", [kpiId]);
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

export async function ensureKpiExists(kpiId: number) {
  const result = await query<KpiRow>("SELECT * FROM kpis WHERE id = $1", [kpiId]);
  const kpi = result.rows[0];
  if (!kpi) {
    throw new ApiError(404, "KPI not found");
  }
  return kpi;
}

export async function ensureAppraisalMutable(appraisalId: number) {
  const result = await query<AppraisalRow>("SELECT * FROM appraisals WHERE id = $1", [appraisalId]);
  const appraisal = result.rows[0];
  if (!appraisal) {
    throw new ApiError(404, "Appraisal not found");
  }
  if ((appraisal.employee_signed && appraisal.manager_signed) || appraisal.status === "completed") {
    throw new ApiError(409, "Signed appraisals are immutable");
  }
  return appraisal;
}

export async function getOrCreateAppraisal(userId: number, period: string, reviewDate?: string | null) {
  const existing = await query<AppraisalRow>(
    "SELECT * FROM appraisals WHERE user_id = $1 AND period = $2",
    [userId, period]
  );

  if (existing.rows[0]) {
    if (!existing.rows[0].review_date && reviewDate) {
      const updated = await query<AppraisalRow>(
        `
          UPDATE appraisals
          SET review_date = $3,
              updated_at = NOW()
          WHERE user_id = $1 AND period = $2
          RETURNING *
        `,
        [userId, period, reviewDate]
      );

      return updated.rows[0];
    }

    return existing.rows[0];
  }

  const created = await query<AppraisalRow>(
    `
      INSERT INTO appraisals (user_id, period, status, review_date, employee_signed, manager_signed)
      VALUES ($1, $2, 'draft', $3, FALSE, FALSE)
      RETURNING *
    `,
    [userId, period, reviewDate ?? null]
  );

  return created.rows[0];
}

export async function getOrCreateActiveAppraisal(userId: number) {
  const activePeriod = await getActiveReviewPeriod();
  return getOrCreateAppraisal(userId, activePeriod.name, activePeriod.ends_on ?? null);
}

export async function assertKpiWeightTotal(appraisalId: number, userId: number, nextWeight?: number, excludeKpiId?: number) {
  const existing = await getKpiWeightTotal(appraisalId, userId, excludeKpiId);
  const finalTotal = Number((existing + (nextWeight ?? 0)).toFixed(2));
  if (finalTotal > 100) {
    throw new ApiError(400, "KPI weights cannot exceed 100%");
  }
  return finalTotal;
}

export async function getKpiWeightTotal(appraisalId: number, userId: number, excludeKpiId?: number) {
  const result = await query<{ total: string }>(
    `
      SELECT COALESCE(SUM(weight), 0)::text AS total
      FROM kpis
      WHERE appraisal_id = $1 AND user_id = $2
      AND ($3::int IS NULL OR id <> $3)
    `,
    [appraisalId, userId, excludeKpiId ?? null]
  );

  return Number(result.rows[0]?.total || 0);
}

export async function ensureAdditionalKpiCapacity(appraisalId: number, userId: number) {
  void appraisalId;
  void userId;
}

export async function requireExactKpiWeightTotal(appraisalId: number, userId: number) {
  const result = await query<{ total: string }>(
    `
      SELECT COALESCE(SUM(weight), 0)::text AS total
      FROM kpis
      WHERE appraisal_id = $1 AND user_id = $2
    `,
    [appraisalId, userId]
  );

  const total = Number(result.rows[0]?.total || 0);
  if (Number(total.toFixed(2)) !== 100) {
    throw new ApiError(400, "KPI weights must equal exactly 100% before submission or approval");
  }
}

export async function getPerformanceByKpi(kpiId: number) {
  const result = await query<PerformanceRow>("SELECT * FROM performance WHERE kpi_id = $1", [kpiId]);
  return result.rows[0] ?? null;
}

export async function requirePerformanceForFinal(kpiId: number) {
  const performance = await getPerformanceByKpi(kpiId);
  if (!performance) {
    throw new ApiError(404, "Performance record not found");
  }
  if (performance.self_score === null || performance.manager_score === null) {
    throw new ApiError(400, "Final score requires both self_score and manager_score");
  }
  return performance;
}

export function isReviewDateOpen(reviewDate?: string | null) {
  if (!reviewDate) return true;

  const deadline = new Date(reviewDate);
  if (Number.isNaN(deadline.getTime())) {
    return true;
  }

  deadline.setHours(23, 59, 59, 999);
  return deadline.getTime() >= Date.now();
}

export async function getAppraisalById(appraisalId: number) {
  const appraisal = await query<AppraisalRow>("SELECT * FROM appraisals WHERE id = $1", [appraisalId]);
  const record = appraisal.rows[0];

  if (!record) {
    throw new ApiError(404, "Appraisal not found");
  }

  return record;
}

export function getEvaluationReviewDate(createdAt: string) {
  const reviewDate = new Date(createdAt);
  reviewDate.setMonth(reviewDate.getMonth() + 3);

  if (Number.isNaN(reviewDate.getTime())) {
    throw new ApiError(500, "Unable to determine the evaluation date");
  }

  return reviewDate;
}

export async function requireEvaluationStageOpen(appraisalId: number) {
  const record = await getAppraisalById(appraisalId);

  if (!record.evaluation_unlocked_by_hr) {
    throw new ApiError(400, "HR must open this appraisal for the three-month evaluation stage first.");
  }

  return record;
}

export async function ensureAppraisalWithinReviewDate(appraisalId: number, message?: string) {
  const record = await getAppraisalById(appraisalId);

  if (!isReviewDateOpen(record.review_date ?? null)) {
    throw new ApiError(409, message ?? "This appraisal is closed because the review date has passed.");
  }

  return record;
}

export async function requireAppraisalReadyForDirector(appraisalId: number) {
  const result = await query<{ total: string; finalized: string }>(
    `
      SELECT
        COUNT(k.id)::text AS total,
        COUNT(k.id) FILTER (WHERE p.final_score IS NOT NULL)::text AS finalized
      FROM kpis k
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE k.appraisal_id = $1
        AND k.status = 'approved'
    `,
    [appraisalId]
  );

  const total = Number(result.rows[0]?.total ?? 0);
  const finalized = Number(result.rows[0]?.finalized ?? 0);

  if (total === 0 || finalized < total) {
    throw new ApiError(400, "Director remarks can only be added after all approved KPI final scores are completed.");
  }

  return getAppraisalById(appraisalId);
}
