import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logAudit } from "../utils/audit.js";
import { hasHrAccess } from "../utils/roles.js";
import { createUserSchema, resetUserPasswordSchema, updateUserSchema } from "../validators/user.js";
import { createUserAccount, deleteUserAccount, resetPasswordByUserId, updateUserAccount } from "../services/authService.js";
export const listStaff = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Authentication required");
    }
    const scope = String(req.query.scope || "relevant");
    if (req.user.role === "employee") {
        const result = await query(`
        SELECT u.id, u.name, u.email, u.role, d.name AS department
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id = $1
      `, [req.user.id]);
        return res.json({ data: result.rows });
    }
    if (req.user.role === "manager" || scope === "team") {
        const result = await query(`
        SELECT u.id, u.name, u.email, u.role, d.name AS department
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.manager_id = $1 AND u.role = 'employee'
        ORDER BY u.name ASC
      `, [req.user.id]);
        return res.json({ data: result.rows });
    }
    const roleFilter = req.query.role ? String(req.query.role) : null;
    const params = [];
    let where = "";
    if (roleFilter === "super_admin" && req.user.role !== "super_admin") {
        throw new ApiError(403, "Only the developer super admin can view super admin accounts");
    }
    if (roleFilter) {
        params.push(roleFilter);
        where = `WHERE u.role = $${params.length}`;
    }
    else if (req.user.role !== "super_admin") {
        where = "WHERE u.role <> 'super_admin'";
    }
    const result = await query(`
      SELECT u.id, u.name, u.email, u.role, d.name AS department, u.manager_id
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      ${where}
      ORDER BY u.role ASC, u.name ASC
    `, params);
    res.json({ data: result.rows });
});
export const listDepartments = asyncHandler(async (_req, res) => {
    const result = await query(`
      SELECT id, name
      FROM departments
      ORDER BY name ASC
    `);
    res.json({ data: result.rows });
});
async function ensureCanManageTargetUser(actorRole, userId) {
    if (actorRole === "super_admin") {
        return;
    }
    const target = await query("SELECT role FROM users WHERE id = $1", [userId]);
    if (target.rows[0]?.role === "super_admin") {
        throw new ApiError(403, "Only the developer super admin can manage this account");
    }
}
export const createStaff = asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    if (data.role === "hr" && req.user?.role !== "super_admin") {
        throw new ApiError(403, "Only the developer super admin can create HR accounts");
    }
    const user = await createUserAccount(data);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "user.create",
        entityType: "user",
        entityId: user.id,
        metadata: { role: data.role }
    });
    res.status(201).json({ user });
});
export const updateStaff = asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const data = updateUserSchema.parse(req.body);
    await ensureCanManageTargetUser(req.user?.role, userId);
    if (data.role === "hr" && req.user?.role !== "super_admin") {
        throw new ApiError(403, "Only the developer super admin can assign HR access");
    }
    const user = await updateUserAccount(userId, data);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "user.update",
        entityType: "user",
        entityId: userId
    });
    res.json({ user });
});
export const resetStaffPassword = asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    await ensureCanManageTargetUser(req.user?.role, userId);
    if (!hasHrAccess(req.user?.role)) {
        throw new ApiError(403, "You do not have permission for this action");
    }
    const data = resetUserPasswordSchema.parse(req.body);
    await resetPasswordByUserId(userId, data.newPassword);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "user.reset_password",
        entityType: "user",
        entityId: userId
    });
    res.json({ message: "Password reset successfully" });
});
export const deleteStaff = asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    await ensureCanManageTargetUser(req.user?.role, userId);
    await deleteUserAccount(userId);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "user.delete",
        entityType: "user",
        entityId: userId
    });
    res.status(204).send();
});
