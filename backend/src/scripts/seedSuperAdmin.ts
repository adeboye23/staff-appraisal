import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool, query } from "../db.js";
import "../config.js";

const defaultEmail = "prosperadeboye@gmail.com";
const email = (process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || defaultEmail);
const generatedPassword = crypto.randomBytes(18).toString("base64url");
const password = process.env.SUPER_ADMIN_PASSWORD || generatedPassword;
const name = process.env.SUPER_ADMIN_NAME?.trim() || "Prosper Adeboye";

async function main() {
  if (!email) {
    throw new Error("SUPER_ADMIN_EMAIL is required.");
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
    if (!process.env.SUPER_ADMIN_PASSWORD) {
      console.log(`Generated temporary password: ${generatedPassword}`);
    }
  } finally {
    await pool.end();
  }
}

void main();
