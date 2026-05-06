import bcrypt from "bcryptjs";
import { query, pool } from "../db.js";
import "../config.js";
const departments = ["Human Resources", "Editorial", "Digital", "Operations"];
const seedUsers = [
    {
        name: "Obehi NC",
        email: "obehi@newscentral.com",
        role: "hr",
        department: "Human Resources",
        previousEmail: "hr@newscentral.com"
    },
    {
        name: "Amina NC",
        email: "amina@newscentral.com",
        role: "hr",
        department: "Human Resources"
    },
    {
        name: "Nkechi NC",
        email: "nkechi@newscentral.com",
        role: "hr",
        department: "Human Resources"
    },
    {
        name: "Donald NC",
        email: "donald@newscentral.com",
        role: "manager",
        department: "Editorial",
        previousEmail: "manager@newscentral.com"
    },
    {
        name: "Katleen NC",
        email: "katleen@newscentral.com",
        role: "manager",
        department: "Digital"
    },
    {
        name: "Omolara NC",
        email: "omolara@newscentral.com",
        role: "manager",
        department: "Operations"
    },
    {
        name: "Emmanuel NC",
        email: "emmanuel@newscentral.com",
        role: "employee",
        department: "Editorial",
        managerEmail: "donald@newscentral.com",
        previousEmail: "tolu@newscentral.com"
    },
    {
        name: "Motun NC",
        email: "motun@newscentral.com",
        role: "employee",
        department: "Digital",
        managerEmail: "katleen@newscentral.com",
        previousEmail: "maya@newscentral.com"
    },
    {
        name: "Tomisin NC",
        email: "tomisin@newscentral.com",
        role: "employee",
        department: "Operations",
        managerEmail: "omolara@newscentral.com"
    }
];
async function ensureDepartments() {
    for (const name of departments) {
        await query(`
        INSERT INTO departments (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING
      `, [name]);
    }
}
async function ensureUsers() {
    const passwordHash = await bcrypt.hash("password", 10);
    for (const user of seedUsers) {
        if (user.previousEmail) {
            await query(`
          UPDATE users
          SET name = $1, email = $2, password = $3, role = $4,
              department_id = (SELECT id FROM departments WHERE name = $5)
          WHERE email = $6
        `, [user.name, user.email, passwordHash, user.role, user.department, user.previousEmail]);
        }
        await query(`
        INSERT INTO users (name, email, password, role, department_id)
        VALUES ($1, $2, $3, $4, (SELECT id FROM departments WHERE name = $5))
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            password = EXCLUDED.password,
            role = EXCLUDED.role,
            department_id = EXCLUDED.department_id
      `, [user.name, user.email, passwordHash, user.role, user.department]);
    }
    for (const user of seedUsers.filter((item) => item.role === "employee" && item.managerEmail)) {
        await query(`
        UPDATE users
        SET manager_id = (SELECT id FROM users WHERE email = $1)
        WHERE email = $2
      `, [user.managerEmail, user.email]);
    }
}
async function ensureTomisinAppraisal() {
    await query(`
      INSERT INTO appraisals (user_id, period, status, employee_signed, manager_signed)
      VALUES (
        (SELECT id FROM users WHERE email = 'tomisin@newscentral.com'),
        '2026 Annual Review',
        'draft',
        FALSE,
        FALSE
      )
      ON CONFLICT (user_id, period) DO NOTHING
    `);
    await query(`
      INSERT INTO kpis (appraisal_id, user_id, title, description, weight, target, status)
      VALUES
      (
        (SELECT id FROM appraisals WHERE user_id = (SELECT id FROM users WHERE email = 'tomisin@newscentral.com') AND period = '2026 Annual Review'),
        (SELECT id FROM users WHERE email = 'tomisin@newscentral.com'),
        'Broadcast turnaround',
        'Deliver assigned production tasks within agreed turnaround time.',
        40,
        12,
        'submitted'
      ),
      (
        (SELECT id FROM appraisals WHERE user_id = (SELECT id FROM users WHERE email = 'tomisin@newscentral.com') AND period = '2026 Annual Review'),
        (SELECT id FROM users WHERE email = 'tomisin@newscentral.com'),
        'Audience retention',
        'Improve retention across assigned content segments.',
        35,
        9,
        'draft'
      ),
      (
        (SELECT id FROM appraisals WHERE user_id = (SELECT id FROM users WHERE email = 'tomisin@newscentral.com') AND period = '2026 Annual Review'),
        (SELECT id FROM users WHERE email = 'tomisin@newscentral.com'),
        'Production accuracy',
        'Reduce handoff and publishing errors.',
        25,
        98,
        'approved'
      )
      ON CONFLICT DO NOTHING
    `);
}
async function main() {
    try {
        await ensureDepartments();
        await ensureUsers();
        await ensureTomisinAppraisal();
        console.log("News Central staff seed completed.");
    }
    finally {
        await pool.end();
    }
}
void main();
