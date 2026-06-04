import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
export const getDashboardSummary = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Authentication required");
    }
    if (req.user.role === "employee") {
        const summary = await query(`
        SELECT
          COUNT(k.id) FILTER (WHERE k.status = 'approved') AS approved_kpis,
          COUNT(k.id) FILTER (WHERE k.status = 'submitted') AS submitted_kpis,
          COUNT(k.id) AS total_kpis,
          COUNT(p.kpi_id) FILTER (WHERE p.self_score IS NOT NULL) AS self_appraised,
          ROUND(COALESCE(AVG(p.final_score) * 20, 0), 1) AS average_final_score
        FROM kpis k
        LEFT JOIN performance p ON p.kpi_id = k.id
        WHERE k.user_id = $1
      `, [req.user.id]);
        return res.json({
            role: "employee",
            summary: summary.rows[0]
        });
    }
    if (req.user.role === "manager") {
        const cards = await query(`
        SELECT
          COUNT(DISTINCT u.id) AS team_members,
          COUNT(k.id) FILTER (WHERE k.status = 'submitted') AS pending_approvals,
          COUNT(k.id) FILTER (WHERE k.status = 'rejected') AS pending_scoring_tasks,
          ROUND(COALESCE(AVG(p.final_score) * 20, 0), 1) AS team_average_score
        FROM users u
        LEFT JOIN kpis k ON k.user_id = u.id
        LEFT JOIN performance p ON p.kpi_id = k.id
        WHERE u.manager_id = $1 AND u.role = 'employee'
      `, [req.user.id]);
        const teamOverview = await query(`
        SELECT
          u.id,
          u.name,
          d.name AS department,
          COUNT(k.id) FILTER (WHERE k.status = 'submitted') AS pending_approvals,
          COUNT(k.id) FILTER (WHERE k.status = 'rejected') AS pending_scoring_tasks,
          ROUND(COALESCE(AVG(p.final_score) * 20, 0), 1) AS average_score
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN kpis k ON k.user_id = u.id
        LEFT JOIN performance p ON p.kpi_id = k.id
        WHERE u.manager_id = $1 AND u.role = 'employee'
        GROUP BY u.id, d.name
        ORDER BY u.name ASC
      `, [req.user.id]);
        return res.json({
            role: "manager",
            summary: cards.rows[0],
            team: teamOverview.rows
        });
    }
    const cards = await query(`
      SELECT
        COUNT(DISTINCT d.id) AS departments,
        COUNT(DISTINCT a.id) AS active_appraisals,
        ROUND(
          COALESCE(
            100.0 * COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed') / NULLIF(COUNT(DISTINCT a.id), 0),
            0
          ),
          1
        ) AS completion_rate,
        ROUND(COALESCE(AVG(p.final_score) * 20, 0), 1) AS organization_average_score
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id AND u.role = 'employee'
      LEFT JOIN appraisals a ON a.user_id = u.id
      LEFT JOIN kpis k ON k.appraisal_id = a.id
      LEFT JOIN performance p ON p.kpi_id = k.id
    `);
    const departmentMetrics = await query(`
      SELECT
        d.id,
        d.name,
        COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'employee') AS employees,
        ROUND(
          COALESCE(
            100.0 * COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed') / NULLIF(COUNT(DISTINCT a.id), 0),
            0
          ),
          1
        ) AS completion_rate,
        ROUND(COALESCE(AVG(p.final_score) * 20, 0), 1) AS average_score
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      LEFT JOIN appraisals a ON a.user_id = u.id
      LEFT JOIN kpis k ON k.appraisal_id = a.id
      LEFT JOIN performance p ON p.kpi_id = k.id
      GROUP BY d.id, d.name
      ORDER BY d.name ASC
    `);
    const performanceDistribution = await query(`
      WITH scored AS (
        SELECT AVG(p.final_score) * 20 AS average_score
        FROM appraisals a
        JOIN kpis k ON k.appraisal_id = a.id
        JOIN performance p ON p.kpi_id = k.id
        GROUP BY a.id
      )
      SELECT
        COUNT(*) FILTER (WHERE average_score < 60) AS needs_support,
        COUNT(*) FILTER (WHERE average_score >= 60 AND average_score < 80) AS steady,
        COUNT(*) FILTER (WHERE average_score >= 80) AS high_performing
      FROM scored
    `);
    return res.json({
        role: "hr",
        summary: cards.rows[0],
        departments: departmentMetrics.rows,
        distribution: performanceDistribution.rows[0]
    });
});
export const getNotifications = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Authentication required");
    }
    const result = await query(`
      WITH relevant AS (
        SELECT
          a.id,
          a.action,
          a.entity_type,
          a.entity_id,
          a.created_at,
          actor.name,
          actor.email,
          CASE
            WHEN a.action = 'auth.login' THEN 'Last login'
            WHEN a.action = 'kpi.approval' AND a.metadata->>'status' = 'rejected' THEN 'KPI needs adjustment'
            WHEN a.action = 'kpi.approval' AND a.metadata->>'status' = 'approved' THEN 'KPI approved'
            WHEN a.action = 'kpi.create' THEN 'KPI sent'
            WHEN a.action = 'kpi.update' THEN 'KPI updated'
            WHEN a.action = 'performance.self_appraisal' THEN 'Employee review sent'
            WHEN a.action = 'performance.manager_score' THEN 'Manager score saved'
            WHEN a.action = 'performance.final_score' THEN 'Final score saved'
            WHEN a.action = 'appraisal.director_review' THEN 'Director review complete'
            WHEN a.action LIKE 'department.%' THEN 'Department updated'
            WHEN a.action LIKE 'user.%' THEN 'User maintenance'
            ELSE 'Activity update'
          END AS title,
          CASE
            WHEN a.action = 'auth.login' THEN 'Signed in successfully.'
            WHEN a.action = 'kpi.approval' AND a.metadata->>'status' = 'rejected' THEN 'A manager returned a KPI for adjustment.'
            WHEN a.action = 'kpi.approval' AND a.metadata->>'status' = 'approved' THEN 'A manager approved a KPI.'
            WHEN a.action = 'kpi.create' THEN 'An employee submitted a KPI.'
            WHEN a.action = 'kpi.update' THEN 'A KPI was updated.'
            WHEN a.action = 'performance.self_appraisal' THEN 'An employee sent review details.'
            WHEN a.action = 'performance.manager_score' THEN 'A manager saved a locked score.'
            WHEN a.action = 'performance.final_score' THEN 'A final agreed score was saved.'
            WHEN a.action = 'appraisal.director_review' THEN 'Director remarks are ready.'
            WHEN a.action LIKE 'department.%' THEN 'Department settings changed.'
            WHEN a.action LIKE 'user.%' THEN 'A staff account was updated.'
            ELSE 'New activity was recorded.'
          END AS message
        FROM audit_logs a
        LEFT JOIN users actor ON actor.id = a.actor_user_id
        WHERE
          a.action = 'auth.login' AND a.entity_id = $1
          OR (
            $2 = 'employee'
            AND (
              (a.entity_type = 'kpi' AND a.entity_id IN (SELECT id FROM kpis WHERE user_id = $1))
              OR (a.entity_type = 'performance' AND a.entity_id IN (
                SELECT p.id FROM performance p JOIN kpis k ON k.id = p.kpi_id WHERE k.user_id = $1
              ))
              OR (a.entity_type = 'appraisal' AND a.entity_id IN (SELECT id FROM appraisals WHERE user_id = $1))
            )
          )
          OR (
            $2 = 'manager'
            AND (
              (a.entity_type = 'kpi' AND a.entity_id IN (SELECT id FROM kpis WHERE user_id IN (SELECT id FROM users WHERE manager_id = $1)))
              OR (a.entity_type = 'performance' AND a.entity_id IN (
                SELECT p.id
                FROM performance p
                JOIN kpis k ON k.id = p.kpi_id
                WHERE k.user_id IN (SELECT id FROM users WHERE manager_id = $1)
              ))
              OR (a.entity_type = 'appraisal' AND a.entity_id IN (
                SELECT id FROM appraisals WHERE user_id IN (SELECT id FROM users WHERE manager_id = $1)
              ))
            )
          )
          OR (
            $2 IN ('hr', 'super_admin')
            AND (
              a.action LIKE 'department.%'
              OR a.action LIKE 'user.%'
              OR a.action IN ('kpi.create', 'kpi.update', 'kpi.approval', 'performance.self_appraisal', 'performance.manager_score', 'performance.final_score', 'appraisal.director_review')
            )
          )
      )
      SELECT *
      FROM relevant
      ORDER BY created_at DESC
      LIMIT 20
    `, [req.user.id, req.user.role]);
    res.json({ data: result.rows });
});
