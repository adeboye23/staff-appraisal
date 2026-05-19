import bcrypt from "bcryptjs";
import { query, pool } from "../db.js";
import "../config.js";
const departments = [
    "News",
    "Programs",
    "Digital",
    "Creative",
    "Broadcast and Transmissions",
    "Commercial and Communications",
    "Corporate Services",
    "Finance",
    "HR"
];
const hrUsers = [
    {
        name: "Obehi NC",
        email: "obehi@newscentral.com",
        role: "hr",
        department: "HR",
        previousEmail: "hr@newscentral.com"
    },
    {
        name: "Amina NC",
        email: "amina@newscentral.com",
        role: "hr",
        department: "HR"
    },
    {
        name: "Nkechi NC",
        email: "nkechi@newscentral.com",
        role: "hr",
        department: "HR"
    }
];
const lineManagerNames = Array.from(new Set([
    "Sylvester Obieze",
    "Alli Oluwaseyi",
    "John Agbehi",
    "Shola Akintayo",
    "Emmanuel Erondu",
    "Moses Azumah",
    "Mathew Bewell",
    "Bernard Akede",
    "Nasir Agbalaya",
    "Godwin Dimoriaku",
    "Chinomso Sunday",
    "Chidinma Ubani",
    "Ololade Adenusi",
    "Mariam Adegbite-Azee",
    "Uyi Amadin",
    "Olusegun Osibowale",
    "Babatunde Koiki",
    "NneotaObase Egbe",
    "Bernard Nwosu",
    "Mark Befe",
    "Donald Saola",
    "Ebibote Twingle Okiy",
    "Olasunkanmi Ajao",
    "Tolulope Ade-Balogun",
    "Kathleen Ndongmo",
    "Omolara Ayo-Tobun",
    "Kayode Akintemi"
]));
function toEmail(name) {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "");
    return `${base}@newscentral.com`;
}
const seededManagers = lineManagerNames.map((name, index) => ({
    name,
    email: toEmail(name),
    role: "manager",
    department: departments[index % departments.length]
}));
const seededEmployees = [
    {
        name: "Emmanuel Erondu Analyst",
        email: "emmanuel.erondu.analyst@newscentral.com",
        role: "employee",
        department: "Broadcast and Transmissions",
        managerEmail: toEmail("Emmanuel Erondu"),
        previousEmail: "emmanuel@newscentral.com"
    },
    {
        name: "Motun Digital",
        email: "motun@newscentral.com",
        role: "employee",
        department: "Digital",
        managerEmail: toEmail("Kathleen Ndongmo"),
        previousEmail: "maya@newscentral.com"
    },
    {
        name: "Tomisin Corporate",
        email: "tomisin@newscentral.com",
        role: "employee",
        department: "Corporate Services",
        managerEmail: toEmail("Omolara Ayo-Tobun")
    }
];
const seedUsers = [...hrUsers, ...seededManagers, ...seededEmployees];
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
    for (const user of seedUsers.filter((item) => item.managerEmail)) {
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
