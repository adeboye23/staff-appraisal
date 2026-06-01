import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { directorReviewSchema, finalScoreSchema, managerScoreSchema, performanceSchema, selfAppraisalSchema, signOffSchema, unlockEvaluationSchema } from "../validators/performance.js";
import { ensureAppraisalWithinReviewDate, ensureKpiExists, getPerformanceByKpi, requirePerformanceForFinal, ensureAppraisalMutable, getAppraisalById, requireAppraisalReadyForDirector } from "../services/appraisalService.js";
import { ApiError } from "../utils/ApiError.js";
import { logAudit } from "../utils/audit.js";
import { hasHrAccess } from "../utils/roles.js";
export const createPerformance = asyncHandler(async (req, res) => {
    const data = performanceSchema.parse(req.body);
    const kpi = await ensureKpiExists(data.kpiId);
    if (!hasHrAccess(req.user?.role) && req.user?.id !== kpi.user_id) {
        throw new ApiError(403, "You can only update performance details for your own appraisal.");
    }
    await ensureAppraisalMutable(kpi.appraisal_id);
    await ensureAppraisalWithinReviewDate(kpi.appraisal_id);
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
      SELECT
        k.id AS kpi_id,
        k.title,
        k.weight,
        k.target,
        p.actual,
        p.target_self_score,
        p.self_score,
        p.manager_score,
        p.manager_score_locked,
        p.final_score
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
    if (!hasHrAccess(req.user?.role) && req.user?.id !== kpi.user_id) {
        throw new ApiError(403, "You can only complete self-appraisal for your own record.");
    }
    await ensureAppraisalMutable(kpi.appraisal_id);
    await ensureAppraisalWithinReviewDate(kpi.appraisal_id);
    if (kpi.status !== "approved") {
        throw new ApiError(400, "This KPI must be approved before it can move through appraisal scoring.");
    }
    const performance = await getPerformanceByKpi(data.kpiId);
    if (!performance || performance.target_self_score === null || performance.target_self_score === undefined) {
        if (data.comment?.trim()) {
            throw new ApiError(400, "The initial target self-score does not take an actual achievement note yet.");
        }
        const result = performance
            ? await query(`
            UPDATE performance
            SET target_self_score = $1, updated_at = NOW()
            WHERE kpi_id = $2
            RETURNING *
          `, [data.selfScore, data.kpiId])
            : await query(`
            INSERT INTO performance (kpi_id, actual, target_self_score)
            VALUES ($1, 0, $2)
            RETURNING *
          `, [data.kpiId, data.selfScore]);
        await logAudit({
            actorUserId: req.user?.id ?? null,
            action: "performance.target_self_score",
            entityType: "performance",
            entityId: result.rows[0].id
        });
        res.status(performance ? 200 : 201).json({ performance: result.rows[0] });
        return;
    }
    if (performance.self_score !== null && performance.self_score !== undefined) {
        throw new ApiError(409, "The post-review self-score is locked once it has been submitted.");
    }
    if (!data.comment?.trim()) {
        throw new ApiError(400, "Add the employee actual achievement for the three-month evaluation.");
    }
    const result = await query(`
      UPDATE performance
      SET self_score = $1, updated_at = NOW()
      WHERE kpi_id = $2
      RETURNING *
    `, [data.selfScore, data.kpiId]);
    await query("INSERT INTO comments (user_id, kpi_id, comment, type) VALUES ($1, $2, $3, 'employee')", [req.user?.id ?? kpi.user_id, data.kpiId, data.comment.trim()]);
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
    if (req.user?.role === "manager" && req.user.id === kpi.user_id) {
        throw new ApiError(403, "Managers cannot score their own appraisal record.");
    }
    await ensureAppraisalMutable(kpi.appraisal_id);
    await ensureAppraisalWithinReviewDate(kpi.appraisal_id);
    const performance = await getPerformanceByKpi(data.kpiId);
    if (!performance || performance.target_self_score === null || performance.target_self_score === undefined) {
        throw new ApiError(400, "Employee target score must be recorded before manager scoring");
    }
    if (performance.self_score === null || performance.self_score === undefined) {
        throw new ApiError(400, "Employee post-review self-score must be recorded before manager scoring");
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
    if (data.comment?.trim()) {
        await query("INSERT INTO comments (user_id, kpi_id, comment, type) VALUES ($1, $2, $3, 'manager')", [req.user?.id, data.kpiId, data.comment.trim()]);
    }
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
    if (req.user?.role === "manager" && req.user.id === kpi.user_id) {
        throw new ApiError(403, "Managers cannot finalize their own appraisal record.");
    }
    await ensureAppraisalMutable(kpi.appraisal_id);
    await ensureAppraisalWithinReviewDate(kpi.appraisal_id);
    if (!data.agree) {
        throw new ApiError(400, "Agreement checkbox must be confirmed");
    }
    const performance = await requirePerformanceForFinal(data.kpiId);
    if (performance.final_score !== null) {
        throw new ApiError(409, "Final score cannot be edited after submission");
    }
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
export const directorReview = asyncHandler(async (req, res) => {
    const data = directorReviewSchema.parse(req.body);
    const appraisal = await requireAppraisalReadyForDirector(data.appraisalId);
    const result = await query(`
      UPDATE appraisals
      SET director_overall_remark = $2,
          director_improvement_suggestions = $3,
          director_training_recommendations = $4,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [
        appraisal.id,
        data.overallRemark.trim(),
        data.improvementSuggestions?.trim() ?? null,
        data.trainingRecommendations?.trim() ?? null
    ]);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "appraisal.director_review",
        entityType: "appraisal",
        entityId: appraisal.id
    });
    res.json({ appraisal: result.rows[0] });
});
export const unlockEvaluation = asyncHandler(async (req, res) => {
    const data = unlockEvaluationSchema.parse(req.body);
    const appraisal = await getAppraisalById(data.appraisalId);
    const result = await query(`
      UPDATE appraisals
      SET evaluation_unlocked_by_hr = $2,
          evaluation_unlocked_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [appraisal.id, data.unlocked]);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: data.unlocked ? "appraisal.evaluation_unlock" : "appraisal.evaluation_lock",
        entityType: "appraisal",
        entityId: appraisal.id
    });
    res.json({ appraisal: result.rows[0] });
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
