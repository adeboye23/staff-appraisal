import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { query } from "../db.js";
import { ApiError } from "../utils/ApiError.js";
export async function registerUser(input) {
    const existing = await query("SELECT * FROM users WHERE email = $1", [input.email]);
    if (existing.rowCount) {
        throw new ApiError(409, "User with this email already exists");
    }
    const password = await bcrypt.hash(input.password, 10);
    const result = await query(`
      INSERT INTO users (name, email, password, role, department_id, manager_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, role
    `, [input.name, input.email, password, input.role, input.departmentId ?? null, input.managerId ?? null]);
    return result.rows[0];
}
export async function createUserAccount(input) {
    return registerUser(input);
}
export async function updateUserAccount(id, input) {
    const existing = await query("SELECT * FROM users WHERE id = $1", [id]);
    const user = existing.rows[0];
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    if (input.email && input.email !== user.email) {
        const emailTaken = await query("SELECT * FROM users WHERE email = $1 AND id <> $2", [input.email, id]);
        if (emailTaken.rowCount) {
            throw new ApiError(409, "User with this email already exists");
        }
    }
    const result = await query(`
      UPDATE users
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          role = COALESCE($3, role),
          department_id = CASE WHEN $4::boolean THEN $5 ELSE department_id END,
          manager_id = CASE WHEN $6::boolean THEN $7 ELSE manager_id END
      WHERE id = $8
      RETURNING id, name, email, role
    `, [
        input.name ?? null,
        input.email ?? null,
        input.role ?? null,
        Object.prototype.hasOwnProperty.call(input, "departmentId"),
        input.departmentId ?? null,
        Object.prototype.hasOwnProperty.call(input, "managerId"),
        input.managerId ?? null,
        id
    ]);
    return result.rows[0];
}
export async function resetPasswordByUserId(userId, newPassword) {
    const hashed = await bcrypt.hash(newPassword, 10);
    const result = await query("UPDATE users SET password = $1 WHERE id = $2", [hashed, userId]);
    if (!result.rowCount) {
        throw new ApiError(404, "User not found");
    }
}
export async function deleteUserAccount(userId) {
    const dependencies = await query(`
      SELECT
        (SELECT COUNT(*)::text FROM appraisals WHERE user_id = $1) AS appraisals,
        (SELECT COUNT(*)::text FROM kpis WHERE user_id = $1) AS kpis,
        (SELECT COUNT(*)::text FROM comments WHERE user_id = $1) AS comments,
        (SELECT COUNT(*)::text FROM users WHERE manager_id = $1) AS reports
    `, [userId]);
    const usage = dependencies.rows[0];
    if (Number(usage.appraisals) > 0 ||
        Number(usage.kpis) > 0 ||
        Number(usage.comments) > 0 ||
        Number(usage.reports) > 0) {
        throw new ApiError(409, "This user already has linked appraisal records or reporting relationships");
    }
    const result = await query("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);
    if (!result.rowCount) {
        throw new ApiError(404, "User not found");
    }
}
export async function loginUser(email, password) {
    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user) {
        throw new ApiError(401, "Invalid credentials");
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        throw new ApiError(401, "Invalid credentials");
    }
    const authUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.department_id
    };
    const token = jwt.sign(authUser, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn
    });
    return {
        token,
        user: authUser
    };
}
export async function resetPassword(email, newPassword) {
    const hashed = await bcrypt.hash(newPassword, 10);
    const result = await query("UPDATE users SET password = $1 WHERE email = $2", [hashed, email]);
    if (!result.rowCount) {
        throw new ApiError(404, "User not found");
    }
}
export async function changePassword(userId, currentPassword, newPassword) {
    const result = await query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = result.rows[0];
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
        throw new ApiError(401, "Current password is incorrect");
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password = $1 WHERE id = $2", [hashed, userId]);
}
