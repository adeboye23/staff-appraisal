import { Response } from "express";
import { query } from "../db.js";
import { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createKpiSchema, updateKpiSchema, approveKpiSchema } from "../validators/kpi.js";
import { ApiError } from "../utils/ApiError.js";
import {
  ensureAdditionalKpiCapacity,
  ensureAppraisalWithinReviewDate,
  ensureKpiEditable,
  ensureKpiExists,
  getOrCreateActiveAppraisal,
  getOrCreateAppraisal
} from "../services/appraisalService.js";
import { logAudit } from "../utils/audit.js";

export const createKpi = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const data = createKpiSchema.parse(req.body);
  if (req.user?.role !== "hr" && req.user?.id !== data.userId) {
    throw new ApiError(403, "You can only create KPIs for your own account.");
  }
  const appraisal =
    data.appraisalId
      ? { id: data.appraisalId }
      : data.period
        ? await getOrCreateAppraisal(data.userId, data.period)
        : await getOrCreateActiveAppraisal(data.userId);

  await ensureAdditionalKpiCapacity(appraisal.id, data.userId);
  await ensureAppraisalWithinReviewDate(appraisal.id, "You cannot add KPIs after the review date.");

  const result = await query(
    `
      INSERT INTO kpis (appraisal_id, user_id, title, description, weight, target, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'draft')
      RETURNING *
    `,
    [appraisal.id, data.userId, data.title, data.description ?? null, data.weight ?? 0, data.target ?? 0]
  );

  await logAudit({
    actorUserId: req.user?.id ?? null,
    action: "kpi.create",
    entityType: "kpi",
    entityId: result.rows[0].id
  });
  res.status(201).json({ kpi: result.rows[0] });
});

export const getUserKpis = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.params.id);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const offset = (page - 1) * limit;

  const result = await query(
    `
      SELECT
        k.*,
        a.period AS appraisal_period,
        a.status AS appraisal_status,
        a.created_at AS appraisal_created_at,
        a.review_date AS appraisal_review_date,
        a.evaluation_unlocked_by_hr AS appraisal_evaluation_unlocked_by_hr,
        a.evaluation_unlocked_at AS appraisal_evaluation_unlocked_at,
        a.director_overall_remark AS appraisal_director_overall_remark,
        a.director_improvement_suggestions AS appraisal_director_improvement_suggestions,
        a.director_training_recommendations AS appraisal_director_training_recommendations,
        a.employee_signed,
        a.manager_signed,
        a.employee_signed_at,
        a.manager_signed_at
      FROM kpis k
      JOIN appraisals a ON a.id = k.appraisal_id
      WHERE k.user_id = $1
      ORDER BY k.id ASC
      LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset]
  );

  res.json({ data: result.rows, page, limit });
});

export const updateKpi = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const kpiId = Number(req.params.id);
  const data = updateKpiSchema.parse(req.body);
  const existing = await ensureKpiEditable(kpiId);
  if (req.user?.role !== "hr" && req.user?.id !== existing.user_id) {
    throw new ApiError(403, "You can only update your own KPIs.");
  }

  const result = await query(
    `
      UPDATE kpis
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          weight = COALESCE($3, weight),
          target = COALESCE($4, target),
          status = COALESCE($5, status),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `,
    [data.title ?? null, data.description ?? null, data.weight ?? null, data.target ?? null, data.status ?? null, kpiId]
  );

  await logAudit({
    actorUserId: req.user?.id ?? null,
    action: "kpi.update",
    entityType: "kpi",
    entityId: kpiId
  });
  res.json({ kpi: result.rows[0] });
});

export const deleteKpi = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const kpiId = Number(req.params.id);
  const existing = await ensureKpiEditable(kpiId);
  if (req.user?.role !== "hr" && req.user?.id !== existing.user_id) {
    throw new ApiError(403, "You can only delete your own KPIs.");
  }
  const result = await query("DELETE FROM kpis WHERE id = $1 RETURNING id", [kpiId]);
  if (!result.rowCount) {
    throw new ApiError(404, "KPI not found");
  }
  await logAudit({
    actorUserId: req.user?.id ?? null,
    action: "kpi.delete",
    entityType: "kpi",
    entityId: kpiId
  });
  res.status(204).send();
});

export const approveKpi = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const kpiId = Number(req.params.id);
  const data = approveKpiSchema.parse(req.body);
  const existing = await ensureKpiExists(kpiId);
  await ensureAppraisalWithinReviewDate(existing.appraisal_id, "You cannot change KPI approval after the review date.");

  if (data.status === "rejected" && !data.comment?.trim()) {
    throw new ApiError(400, "Manager feedback is required when returning a KPI for adjustment.");
  }

  const result = await query(
    "UPDATE kpis SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [data.status, kpiId]
  );
  if (!result.rowCount) {
    throw new ApiError(404, "KPI not found");
  }
  if (data.comment) {
    await query(
      "INSERT INTO comments (user_id, kpi_id, comment, type) VALUES ($1, $2, $3, 'manager')",
      [req.user?.id ?? null, kpiId, data.comment]
    );
  }
  await logAudit({
    actorUserId: req.user?.id ?? null,
    action: "kpi.approval",
    entityType: "kpi",
    entityId: kpiId,
    metadata: { status: data.status }
  });
  res.json({ kpi: result.rows[0] });
});
