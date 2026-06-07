import { config } from "../config.js";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logAudit } from "../utils/audit.js";
import { hasHrAccess } from "../utils/roles.js";
import { bulkOnboardSchema, accountStatusSchema, createDepartmentSchema, createUserSchema, resetUserPasswordSchema, updateDepartmentSchema, updateUserSchema } from "../validators/user.js";
import { createUserAccount, deleteUserAccount, resetPasswordByUserId, updateUserAccount } from "../services/authService.js";
import { createInvitation, listInvitations, resendInvitation, revokeInvitation } from "../services/invitationService.js";
export const listStaff = asyncHandler(async (req, res) => {
    if (!req.user) {
        throw new ApiError(401, "Authentication required");
    }
    const scope = String(req.query.scope || "relevant");
    if (req.user.role === "employee") {
        const result = await query(`
        SELECT u.id, u.name, u.email, u.role, u.account_status, d.name AS department
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id = $1
      `, [req.user.id]);
        return res.json({ data: result.rows });
    }
    if (req.user.role === "manager" || scope === "team") {
        const result = await query(`
        SELECT u.id, u.name, u.email, u.role, u.account_status, d.name AS department
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
      SELECT u.id, u.name, u.email, u.role, u.account_status, d.name AS department, u.manager_id
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
export const createDepartment = asyncHandler(async (req, res) => {
    const data = createDepartmentSchema.parse(req.body);
    const result = await query(`
      INSERT INTO departments (name)
      VALUES ($1)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `, [data.name.trim()]);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "department.create",
        entityType: "department",
        entityId: result.rows[0].id
    });
    res.status(201).json({ department: result.rows[0] });
});
export const updateDepartment = asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.id);
    const data = updateDepartmentSchema.parse(req.body);
    const result = await query(`
      UPDATE departments
      SET name = $1
      WHERE id = $2
      RETURNING id, name
    `, [data.name.trim(), departmentId]);
    if (!result.rowCount) {
        throw new ApiError(404, "Department not found");
    }
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "department.rename",
        entityType: "department",
        entityId: departmentId
    });
    res.json({ department: result.rows[0] });
});
export const deleteDepartment = asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.id);
    const usage = await query("SELECT COUNT(*)::text AS users FROM users WHERE department_id = $1", [departmentId]);
    if (Number(usage.rows[0]?.users ?? 0) > 0) {
        throw new ApiError(409, "Move or reassign staff before deleting this department");
    }
    const result = await query("DELETE FROM departments WHERE id = $1 RETURNING id", [departmentId]);
    if (!result.rowCount) {
        throw new ApiError(404, "Department not found");
    }
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "department.delete",
        entityType: "department",
        entityId: departmentId
    });
    res.status(204).send();
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
export const bulkOnboardStaff = asyncHandler(async (req, res) => {
    const data = bulkOnboardSchema.parse(req.body);
    const uniqueEmails = Array.from(new Set(data.emails.map((email) => email.toLowerCase().trim())));
    const invited = [];
    const skipped = [];
    const failed = [];
    const department = await query("SELECT id FROM departments WHERE id = $1", [data.departmentId]);
    if (!department.rowCount) {
        throw new ApiError(404, "Department not found");
    }
    for (const email of uniqueEmails) {
        try {
            const result = await createInvitation({
                email,
                role: data.role,
                departmentId: data.departmentId,
                managerId: data.managerId ?? null,
                createdBy: req.user.id
            });
            if (result.skipped) {
                skipped.push({ email, reason: result.reason });
                continue;
            }
            invited.push({ email, invitationId: result.invitationId, status: result.status });
            if (result.status === "failed") {
                failed.push({ email, reason: result.error ?? "Email delivery failed" });
            }
            await logAudit({
                actorUserId: req.user?.id ?? null,
                action: "invitation.create",
                entityType: "invitation",
                entityId: result.invitationId,
                metadata: { departmentId: data.departmentId, role: data.role }
            });
        }
        catch (error) {
            failed.push({
                email,
                reason: error instanceof Error ? error.message : "Unable to invite this email"
            });
        }
    }
    res.status(201).json({
        invited,
        skipped,
        failed,
        emailDeliveryConfigured: Boolean(config.resendApiKey)
    });
});
export const listStaffInvitations = asyncHandler(async (_req, res) => {
    const invitations = await listInvitations();
    res.json({ data: invitations });
});
export const resendStaffInvitation = asyncHandler(async (req, res) => {
    const invitationId = Number(req.params.id);
    const result = await resendInvitation(invitationId, req.user.id);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "invitation.resend",
        entityType: "invitation",
        entityId: result.invitationId ?? invitationId
    });
    res.json({ invitation: result });
});
export const revokeStaffInvitation = asyncHandler(async (req, res) => {
    const invitationId = Number(req.params.id);
    await revokeInvitation(invitationId);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "invitation.revoke",
        entityType: "invitation",
        entityId: invitationId
    });
    res.status(204).send();
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
export const updateStaffStatus = asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    await ensureCanManageTargetUser(req.user?.role, userId);
    const data = accountStatusSchema.parse(req.body);
    const result = await query(`
      UPDATE users
      SET account_status = $1,
          deactivated_at = CASE WHEN $1 = 'deactivated' THEN NOW() ELSE NULL END
      WHERE id = $2
      RETURNING id, name, email, role, account_status
    `, [data.status, userId]);
    if (!result.rowCount) {
        throw new ApiError(404, "User not found");
    }
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: `user.${data.status}`,
        entityType: "user",
        entityId: userId
    });
    res.json({ user: result.rows[0] });
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
