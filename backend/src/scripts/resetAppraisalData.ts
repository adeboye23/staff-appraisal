import { pool, query } from "../db.js";
import "../config.js";

async function main() {
  try {
    await query("BEGIN");
    await query(
      `
        DELETE FROM audit_logs
        WHERE entity_type IN ('appraisal', 'kpi', 'performance')
      `
    );
    await query("TRUNCATE TABLE comments, performance, kpis, appraisals RESTART IDENTITY CASCADE");
    await query("COMMIT");
    console.log("KPI and appraisal data cleared successfully.");
  } catch (error) {
    await query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await pool.end();
  }
}

void main();
