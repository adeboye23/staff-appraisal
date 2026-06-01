import bcrypt from "bcryptjs";
import { pool, query } from "../db.js";
import "../config.js";

const departments = [
  "HR",
  "News",
  "Programs",
  "Digital",
  "Creative",
  "Broadcast and Transmissions",
  "Commercial and Communications",
  "Corporate Services",
  "Finance"
];

const obehi = {
  name: "Obehi NC",
  email: "obehi@newscentral.com",
  role: "hr",
  department: "HR"
} as const;

async function ensureDepartments() {
  for (const department of departments) {
    await query(
      `
        INSERT INTO departments (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING
      `,
      [department]
    );
  }
}

async function ensureObehi() {
  const fallbackPasswordHash = await bcrypt.hash("password", 10);

  await query(
    `
      INSERT INTO users (name, email, password, role, department_id, manager_id)
      VALUES ($1, $2, $3, $4, (SELECT id FROM departments WHERE name = $5), NULL)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          department_id = EXCLUDED.department_id,
          manager_id = NULL
    `,
    [obehi.name, obehi.email, fallbackPasswordHash, obehi.role, obehi.department]
  );
}

async function main() {
  try {
    await query("BEGIN");
    await ensureDepartments();
    await ensureObehi();
    await query("COMMIT");
    console.log("Office structure aligned for live testing.");
  } catch (error) {
    await query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await pool.end();
  }
}

void main();
