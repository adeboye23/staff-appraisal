import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { finalScoreSchema, managerScoreSchema, performanceSchema, selfAppraisalSchema, signOffSchema } from "../validators/performance.js";
import { ensureKpiExists, getPerformanceByKpi, requirePerformanceForFinal, ensureAppraisalMutable, requireFinalReviewWindow } from "../services/appraisalService.js";
import { ApiError } from "../utils/ApiError.js";
import { logAudit } from "../utils/audit.js";
export const createPerformance = asyncHandler(async (req, res) => {
    const data = performanceSchema.parse(req.body);
    const kpi = await ensureKpiExists(data.kpiId);
    await ensureAppraisalMutable(kpi.appraisal_id);
    const existing = await getPerformanceByKpi(data.kpiId);
    const result = existing
        ? await query(`
          UPDATE performance
          SET actual = $1, updated_at = NOW()
          WHERE kpi_id = $2
          RETURNING *
        `, [data.actual, data.kpiId])
        : await query(`
          INSERT INTO performance (kpi_id, actual)
          VALUES ($1, $2)
          RETURNING *
        `, [data.kpiId, data.actual]);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "performance.upsert",
        entityType: "performance",
        entityId: result.rows[0].id
    });
    res.status(existing ? 200 : 201).json({ performance: result.rows[0] });
});
export const getPerformance = asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const result = await query(`
      SELECT k.id AS kpi_id, k.title, k.weight, k.target, p.actual, p.self_score, p.manager_score, p.final_score
      FROM kpis k
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE k.user_id = $1
      ORDER BY k.created_at DESC
    `, [userId]);
    res.json({ data: result.rows });
});
export const getTimeline = asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const result = await query(`
      SELECT
        al.id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.created_at,
        actor.name AS actor_name
      FROM audit_logs al
      LEFT JOIN users actor ON actor.id = al.actor_user_id
      WHERE
        (al.entity_type = 'appraisal' AND al.entity_id IN (SELECT id FROM appraisals WHERE user_id = $1))
        OR (al.entity_type = 'kpi' AND al.entity_id IN (SELECT id FROM kpis WHERE user_id = $1))
        OR (al.entity_type = 'performance' AND al.entity_id IN (
          SELECT p.id
          FROM performance p
          JOIN kpis k ON k.id = p.kpi_id
          WHERE k.user_id = $1
        ))
      ORDER BY al.created_at DESC
      LIMIT 24
    `, [userId]);
    res.json({ data: result.rows });
});
export const getComments = asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const result = await query(`
      SELECT
        c.id,
        c.kpi_id,
        c.comment,
        c.type,
        c.created_at,
        k.title AS kpi_title,
        u.name AS author_name
      FROM comments c
      JOIN kpis k ON k.id = c.kpi_id
      LEFT JOIN users u ON u.id = c.user_id
      WHERE k.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 40
    `, [userId]);
    res.json({ data: result.rows });
});
export const selfAppraisal = asyncHandler(async (req, res) => {
    const data = selfAppraisalSchema.parse(req.body);
    const kpi = await ensureKpiExists(data.kpiId);
    await ensureAppraisalMutable(kpi.appraisal_id);
    const performance = await getPerformanceByKpi(data.kpiId);
    const result = performance
        ? await query(`
          UPDATE performance
          SET self_score = $1, updated_at = NOW()
          WHERE kpi_id = $2
          RETURNING *
        `, [data.selfScore, data.kpiId])
        : await query(`
          INSERT INTO performance (kpi_id, actual, self_score)
          VALUES ($1, 0, $2)
          RETURNING *
        `, [data.kpiId, data.selfScore]);
    await query("INSERT INTO comments (user_id, kpi_id, comment, type) VALUES ($1, $2, $3, 'employee')", [req.user?.id ?? kpi.user_id, data.kpiId, data.comment]);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "performance.self_appraisal",
        entityType: "performance",
        entityId: result.rows[0].id
    });
    res.json({ performance: result.rows[0] });
});
export const managerScore = asyncHandler(async (req, res) => {
    const data = managerScoreSchema.parse(req.body);
    const kpi = await ensureKpiExists(data.kpiId);
    await ensureAppraisalMutable(kpi.appraisal_id);
    const performance = await getPerformanceByKpi(data.kpiId);
    if (!performance) {
        throw new ApiError(400, "Performance record must exist before manager scoring");
    }
    if (performance.manager_score_locked) {
        throw new ApiError(409, "Manager score cannot be edited after submission");
    }
    const result = await query(`
      UPDATE performance
      SET manager_score = $1, manager_score_locked = TRUE, updated_at = NOW()
      WHERE kpi_id = $2
      RETURNING *
    `, [data.managerScore, data.kpiId]);
    await query("INSERT INTO comments (user_id, kpi_id, comment, type) VALUES ($1, $2, $3, 'manager')", [req.user?.id, data.kpiId, data.comment]);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "performance.manager_score",
        entityType: "performance",
        entityId: result.rows[0].id
    });
    res.json({ performance: result.rows[0] });
});
export const finalScore = asyncHandler(async (req, res) => {
    const data = finalScoreSchema.parse(req.body);
    const kpi = await ensureKpiExists(data.kpiId);
    await ensureAppraisalMutable(kpi.appraisal_id);
    await requireFinalReviewWindow(kpi.appraisal_id);
    if (!data.agree) {
        throw new ApiError(400, "Agreement checkbox must be confirmed");
    }
    const performance = await requirePerformanceForFinal(data.kpiId);
    const result = await query(`
      UPDATE performance
      SET final_score = $1, updated_at = NOW()
      WHERE kpi_id = $2
      RETURNING *
    `, [data.finalScore, data.kpiId]);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "performance.final_score",
        entityType: "performance",
        entityId: performance.id
    });
    res.json({ performance: result.rows[0] });
});
export const signOff = asyncHandler(async (req, res) => {
    const data = signOffSchema.parse(req.body);
    const appraisal = await ensureAppraisalMutable(data.appraisalId);
    if (data.actor === "employee" && appraisal.employee_signed) {
        throw new ApiError(409, "Employee sign-off has already been recorded");
    }
    if (data.actor === "manager" && appraisal.manager_signed) {
        throw new ApiError(409, "Manager sign-off has already been recorded");
    }
    const field = data.actor === "employee" ? "employee_signed" : "manager_signed";
    const timestampField = data.actor === "employee" ? "employee_signed_at" : "manager_signed_at";
    const nextEmployeeSigned = data.actor === "employee" ? true : appraisal.employee_signed;
    const nextManagerSigned = data.actor === "manager" ? true : appraisal.manager_signed;
    const nextStatus = nextEmployeeSigned && nextManagerSigned ? "completed" : "in_review";
    const result = await query(`
      UPDATE appraisals
      SET ${field} = TRUE,
          ${timestampField} = NOW(),
          status = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [data.appraisalId, nextStatus]);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "appraisal.signoff",
        entityType: "appraisal",
        entityId: appraisal.id,
        metadata: { actor: data.actor }
    });
    res.json({ appraisal: result.rows[0] });
});
