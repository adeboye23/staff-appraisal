import bcrypt from "bcryptjs";
import { pool, query } from "../db.js";
import "../config.js";

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;
const name = process.env.SUPER_ADMIN_NAME?.trim() || "Developer Super Admin";

async function main() {
  if (!email || !password) {
    throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required.");
  }

  if (password.length < 12) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
    await query(
      "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('employee', 'manager', 'hr', 'super_admin'))"
    );

    await query(
      `
        INSERT INTO users (name, email, password, role, department_id, manager_id)
        VALUES ($1, $2, $3, 'super_admin', NULL, NULL)
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            password = EXCLUDED.password,
            role = 'super_admin',
            department_id = NULL,
            manager_id = NULL
      `,
      [name, email, hashedPassword]
    );

    console.log(`Super admin account ready: ${email}`);
  } finally {
    await pool.end();
  }
}

void main();
