import bcrypt from "bcryptjs";
import { query, pool } from "../db.js";
import "../config.js";
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
        department: "Technical",
        previousEmail: "manager@newscentral.com"
    },
    {
        name: "Katleen NC",
        email: "katleen@newscentral.com",
        role: "manager",
        department: "Digital"
    },
    {
        name: "Tolu NC",
        email: "tolu@newscentral.com",
        role: "manager",
        department: "Entertainment"
    },
    {
        name: "Bamidele NC",
        email: "bamidele@newscentral.com",
        role: "manager",
        department: "Programmes"
    },
    {
        name: "Chinedu NC",
        email: "chinedu@newscentral.com",
        role: "manager",
        department: "Sports"
    },
    {
        name: "Kemi NC",
        email: "kemi@newscentral.com",
        role: "manager",
        department: "Business"
    },
    {
        name: "Omolara NC",
        email: "omolara@newscentral.com",
        role: "manager",
        department: "Operations & Support Services"
    },
    {
        name: "Emmanuel NC",
        email: "emmanuel@newscentral.com",
        role: "employee",
        department: "Technical",
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
        department: "Operations & Support Services",
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
async function main() {
    try {
        await ensureDepartments();
        await ensureUsers();
        console.log("News Central staff seed completed.");
    }
    finally {
        await pool.end();
    }
}
void main();
