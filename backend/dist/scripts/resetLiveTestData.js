import bcrypt from "bcryptjs";
import { pool, query } from "../db.js";
import "../config.js";
const obehi = {
    name: "Obehi NC",
    email: "obehi@newscentral.com",
    role: "hr",
    department: "HR",
    previousEmail: "hr@newscentral.com"
};
async function main() {
    const fallbackPasswordHash = await bcrypt.hash("password", 10);
    try {
        await query("BEGIN");
        await query("TRUNCATE TABLE comments, performance, kpis, appraisals, review_periods, audit_logs RESTART IDENTITY CASCADE");
        await query(`
        INSERT INTO departments (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING
      `, [obehi.department]);
        await query(`
        UPDATE users
        SET name = $1,
            email = $2,
            role = $3,
            department_id = (SELECT id FROM departments WHERE name = $4),
            manager_id = NULL
        WHERE email = $5
        AND NOT EXISTS (SELECT 1 FROM users WHERE email = $2)
      `, [obehi.name, obehi.email, obehi.role, obehi.department, obehi.previousEmail]);
        await query(`
        INSERT INTO users (name, email, password, role, department_id, manager_id)
        VALUES ($1, $2, $3, $4, (SELECT id FROM departments WHERE name = $5), NULL)
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            role = EXCLUDED.role,
            department_id = EXCLUDED.department_id,
            manager_id = NULL
      `, [obehi.name, obehi.email, fallbackPasswordHash, obehi.role, obehi.department]);
        await query("DELETE FROM users WHERE email <> $1", [obehi.email]);
        await query("COMMIT");
        console.log("Live test data reset complete. Only Obehi HR remains, with no active review period.");
    }
    catch (error) {
        await query("ROLLBACK").catch(() => undefined);
        throw error;
    }
    finally {
        await pool.end();
    }
}
void main();
