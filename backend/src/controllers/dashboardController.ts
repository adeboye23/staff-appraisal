import { Response } from "express";
import { query } from "../db.js";
import { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { hasHrAccess } from "../utils/roles.js";

export const getDashboardSummary = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  if (req.user.role === "employee") {
    const summary = await query(
      `
        SELECT
          COUNT(k.id) FILTER (WHERE k.status = 'approved') AS approved_kpis,
          COUNT(k.id) FILTER (WHERE k.status = 'submitted') AS submitted_kpis,
          COUNT(k.id) AS total_kpis,
          COUNT(p.kpi_id) FILTER (WHERE p.self_score IS NOT NULL) AS self_appraised,
          ROUND(COALESCE(AVG(p.final_score) * 20, 0), 1) AS average_final_score
        FROM kpis k
        LEFT JOIN performance p ON p.kpi_id = k.id
        WHERE k.user_id = $1
      `,
      [req.user.id]
    );

    return res.json({
      role: "employee",
      summary: summary.rows[0]
    });
  }

  if (req.user.role === "manager") {
    const cards = await query(
      `
        SELECT
          COUNT(DISTINCT u.id) AS team_members,
          COUNT(k.id) FILTER (WHERE k.status = 'submitted') AS pending_approvals,
          COUNT(k.id) FILTER (WHERE k.status = 'rejected') AS pending_scoring_tasks,
          ROUND(COALESCE(AVG(p.final_score) * 20, 0), 1) AS team_average_score
        FROM users u
        LEFT JOIN kpis k ON k.user_id = u.id
        LEFT JOIN performance p ON p.kpi_id = k.id
        WHERE u.manager_id = $1 AND u.role = 'employee'
      `,
      [req.user.id]
    );

    const teamOverview = await query(
      `
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
      `,
      [req.user.id]
    );

    return res.json({
      role: "manager",
      summary: cards.rows[0],
      team: teamOverview.rows
    });
  }

  const cards = await query(
    `
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
    `
  );

  const departmentMetrics = await query(
    `
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
    `
  );

  const performanceDistribution = await query(
    `
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
    `
  );

  return res.json({
    role: "hr",
    summary: cards.rows[0],
    departments: departmentMetrics.rows,
    distribution: performanceDistribution.rows[0]
  });
});

export const getNotifications = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  if (!hasHrAccess(req.user.role)) {
    return res.json({ data: [] });
  }

  const result = await query(
    `
      SELECT
        a.id,
        a.action,
        a.entity_type,
        a.entity_id,
        a.created_at,
        u.name,
        u.email
      FROM audit_logs a
      JOIN users u ON u.id = a.actor_user_id
      WHERE u.role = 'employee'
      ORDER BY a.created_at DESC
      LIMIT 12
    `
  );

  res.json({ data: result.rows });
});
