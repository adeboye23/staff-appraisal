import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const userReport = asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const periods = await query(`
      SELECT a.period,
             a.status,
             a.employee_signed,
             a.manager_signed,
             COUNT(k.id) AS kpi_count,
             ROUND(COALESCE(AVG(p.final_score), 0), 1) AS average_score
      FROM appraisals a
      LEFT JOIN kpis k ON k.appraisal_id = a.id
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE a.user_id = $1
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `, [userId]);
    const summary = await query(`
      SELECT
        COUNT(DISTINCT a.id) AS appraisal_count,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed') AS completed_appraisals,
        ROUND(COALESCE(AVG(p.final_score), 0), 1) AS average_final_score,
        ROUND(
          COALESCE(
            100.0 * COUNT(k.id) FILTER (WHERE p.actual IS NOT NULL AND p.actual >= k.target)
            / NULLIF(COUNT(k.id), 0),
            0
          ),
          1
        ) AS achievement_rate,
        ROUND(COALESCE(AVG(ABS(COALESCE(p.self_score, 0) - COALESCE(p.manager_score, 0))), 0), 1) AS score_variance
      FROM appraisals a
      LEFT JOIN kpis k ON k.appraisal_id = a.id
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE a.user_id = $1
    `, [userId]);
    const kpis = await query(`
      SELECT
        a.period,
        k.title,
        k.status,
        k.weight,
        k.target,
        p.actual,
        p.self_score,
        p.manager_score,
        p.final_score,
        ROUND(ABS(COALESCE(p.self_score, 0) - COALESCE(p.manager_score, 0)), 1) AS variance
      FROM appraisals a
      JOIN kpis k ON k.appraisal_id = a.id
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC, k.created_at ASC
    `, [userId]);
    res.json({ summary: summary.rows[0], periods: periods.rows, kpis: kpis.rows });
});
export const departmentReport = asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.id);
    const summary = await query(`
      SELECT d.name AS department,
             COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'employee') AS employees,
             COUNT(DISTINCT a.id) AS active_appraisals,
             ROUND(
               COALESCE(
                 100.0 * COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed') / NULLIF(COUNT(DISTINCT a.id), 0),
                 0
               ),
               1
             ) AS completion_rate,
             ROUND(COALESCE(AVG(p.final_score), 0), 1) AS average_score,
             ROUND(
               COALESCE(
                 100.0 * COUNT(k.id) FILTER (WHERE p.actual IS NOT NULL AND p.actual >= k.target) / NULLIF(COUNT(k.id), 0),
                 0
               ),
               1
             ) AS achievement_rate,
             ROUND(COALESCE(AVG(ABS(COALESCE(p.self_score, 0) - COALESCE(p.manager_score, 0))), 0), 1) AS score_variance
      FROM departments d
      JOIN users u ON u.department_id = d.id
      JOIN appraisals a ON a.user_id = u.id
      LEFT JOIN kpis k ON k.appraisal_id = a.id
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE d.id = $1
      GROUP BY d.name
    `, [departmentId]);
    const periods = await query(`
      SELECT
        a.period,
        COUNT(DISTINCT a.id) AS appraisals,
        ROUND(
          COALESCE(
            100.0 * COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed') / NULLIF(COUNT(DISTINCT a.id), 0),
            0
          ),
          1
        ) AS completion_rate,
        ROUND(COALESCE(AVG(p.final_score), 0), 1) AS average_score
      FROM departments d
      JOIN users u ON u.department_id = d.id
      JOIN appraisals a ON a.user_id = u.id
      LEFT JOIN kpis k ON k.appraisal_id = a.id
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE d.id = $1
      GROUP BY a.period
      ORDER BY a.period DESC
    `, [departmentId]);
    const employees = await query(`
      SELECT
        u.id,
        u.name,
        a.period,
        a.status,
        ROUND(COALESCE(AVG(p.final_score), 0), 1) AS average_score,
        ROUND(COALESCE(AVG(ABS(COALESCE(p.self_score, 0) - COALESCE(p.manager_score, 0))), 0), 1) AS score_variance
      FROM departments d
      JOIN users u ON u.department_id = d.id AND u.role = 'employee'
      JOIN appraisals a ON a.user_id = u.id
      LEFT JOIN kpis k ON k.appraisal_id = a.id
      LEFT JOIN performance p ON p.kpi_id = k.id
      WHERE d.id = $1
      GROUP BY u.id, u.name, a.period, a.status, a.created_at
      ORDER BY a.created_at DESC, u.name ASC
    `, [departmentId]);
    res.json({
        summary: summary.rows[0] ?? null,
        periods: periods.rows,
        employees: employees.rows
    });
});
