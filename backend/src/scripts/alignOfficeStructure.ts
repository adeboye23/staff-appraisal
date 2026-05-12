import bcrypt from "bcryptjs";
import { pool, query } from "../db.js";
import "../config.js";

type ManagedUser = {
  name: string;
  email: string;
  role: "employee" | "manager" | "hr";
  department: string;
  managerEmail?: string | null;
};

const departments = [
  "Human Resources",
  "Digital",
  "Programmes",
  "Entertainment",
  "Sports",
  "Business",
  "Technical",
  "Operations & Support Services"
];

const managedUsers: ManagedUser[] = [
  { name: "Obehi NC", email: "obehi@newscentral.com", role: "hr", department: "Human Resources" },
  { name: "Amina NC", email: "amina@newscentral.com", role: "hr", department: "Human Resources" },
  { name: "Nkechi NC", email: "nkechi@newscentral.com", role: "hr", department: "Human Resources" },
  { name: "Donald NC", email: "donald@newscentral.com", role: "manager", department: "Technical" },
  { name: "Katleen NC", email: "katleen@newscentral.com", role: "manager", department: "Digital" },
  { name: "Tolu NC", email: "tolu@newscentral.com", role: "manager", department: "Entertainment" },
  { name: "Bamidele NC", email: "bamidele@newscentral.com", role: "manager", department: "Programmes" },
  { name: "Chinedu NC", email: "chinedu@newscentral.com", role: "manager", department: "Sports" },
  { name: "Kemi NC", email: "kemi@newscentral.com", role: "manager", department: "Business" },
  { name: "Omolara NC", email: "omolara@newscentral.com", role: "manager", department: "Operations & Support Services" },
  {
    name: "Emmanuel NC",
    email: "emmanuel@newscentral.com",
    role: "employee",
    department: "Technical",
    managerEmail: "donald@newscentral.com"
  },
  {
    name: "Motun NC",
    email: "motun@newscentral.com",
    role: "employee",
    department: "Digital",
    managerEmail: "katleen@newscentral.com"
  },
  {
    name: "Tomisin NC",
    email: "tomisin@newscentral.com",
    role: "employee",
    department: "Operations & Support Services",
    managerEmail: "omolara@newscentral.com"
  },
  {
    name: "test staff",
    email: "teststaff@newscentral.com",
    role: "employee",
    department: "Digital",
    managerEmail: "katleen@newscentral.com"
  }
];

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

async function upsertManagedUser(user: ManagedUser, fallbackPasswordHash: string) {
  await query(
    `
      INSERT INTO users (name, email, password, role, department_id, manager_id)
      VALUES (
        $1,
        $2,
        $3,
        $4,
        (SELECT id FROM departments WHERE name = $5),
        NULL
      )
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          department_id = EXCLUDED.department_id
    `,
    [user.name, user.email, fallbackPasswordHash, user.role, user.department]
  );
}

async function updateManagerLinks() {
  for (const user of managedUsers) {
    await query(
      `
        UPDATE users
        SET manager_id = CASE
          WHEN $1::text IS NULL THEN NULL
          ELSE (SELECT id FROM users WHERE email = $1)
        END
        WHERE email = $2
      `,
      [user.managerEmail ?? null, user.email]
    );
  }
}

async function removeObsoleteUnusedDepartments() {
  await query(
    `
      DELETE FROM departments
      WHERE name NOT IN (${departments.map((_, index) => `$${index + 1}`).join(", ")})
      AND id NOT IN (
        SELECT DISTINCT department_id
        FROM users
        WHERE department_id IS NOT NULL
      )
    `,
    departments
  );
}

async function main() {
  const fallbackPasswordHash = await bcrypt.hash("password", 10);

  try {
    await query("BEGIN");
    await ensureDepartments();

    for (const user of managedUsers) {
      await upsertManagedUser(user, fallbackPasswordHash);
    }

    await updateManagerLinks();
    await removeObsoleteUnusedDepartments();
    await query("COMMIT");
    console.log("Office structure aligned successfully.");
  } catch (error) {
    await query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await pool.end();
  }
}

void main();
