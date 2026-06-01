import bcrypt from "bcryptjs";
import { query, pool } from "../db.js";
import "../config.js";

const obehi = {
  name: "Obehi NC",
  email: "obehi@newscentral.com",
  role: "hr",
  department: "HR",
  previousEmail: "hr@newscentral.com"
} as const;

async function ensureDepartment() {
  await query(
    `
      INSERT INTO departments (name)
      VALUES ($1)
      ON CONFLICT (name) DO NOTHING
    `,
    [obehi.department]
  );
}

async function ensureObehi() {
  const passwordHash = await bcrypt.hash("password", 10);

  await query(
    `
      UPDATE users
      SET name = $1,
          email = $2,
          role = $3,
          department_id = (SELECT id FROM departments WHERE name = $4),
          manager_id = NULL
      WHERE email = $5
      AND NOT EXISTS (SELECT 1 FROM users WHERE email = $2)
    `,
    [obehi.name, obehi.email, obehi.role, obehi.department, obehi.previousEmail]
  );

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
    [obehi.name, obehi.email, passwordHash, obehi.role, obehi.department]
  );
}

async function main() {
  try {
    await ensureDepartment();
    await ensureObehi();
    console.log("Obehi HR seed completed.");
  } finally {
    await pool.end();
  }
}

void main();
