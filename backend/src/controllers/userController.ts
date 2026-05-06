import { Response } from "express";
import { query } from "../db.js";
import { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logAudit } from "../utils/audit.js";
import { createUserSchema, resetUserPasswordSchema, updateUserSchema } from "../validators/user.js";
import {
  createUserAccount,
  deleteUserAccount,
  resetPasswordByUserId,
  updateUserAccount
} from "../services/authService.js";

export const listStaff = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const scope = String(req.query.scope || "relevant");

  if (req.user.role === "employee") {
    const result = await query(
      `
        SELECT u.id, u.name, u.email, u.role, d.name AS department
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id = $1
      `,
      [req.user.id]
    );

    return res.json({ data: result.rows });
  }

  if (req.user.role === "manager" || scope === "team") {
    const result = await query(
      `
        SELECT u.id, u.name, u.email, u.role, d.name AS department
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.manager_id = $1 AND u.role = 'employee'
        ORDER BY u.name ASC
      `,
      [req.user.id]
    );

    return res.json({ data: result.rows });
  }

  const roleFilter = req.query.role ? String(req.query.role) : null;
  const params: unknown[] = [];
  let where = "";

  if (roleFilter) {
    params.push(roleFilter);
    where = `WHERE u.role = $${params.length}`;
  }

  const result = await query(
    `
      SELECT u.id, u.name, u.email, u.role, d.name AS department, u.manager_id
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      ${where}
      ORDER BY u.role ASC, u.name ASC
    `,
    params
  );

  res.json({ data: result.rows });
});

export const listDepartments = asyncHandler(async (_req: AuthedRequest, res: Response) => {
  const result = await query(
    `
      SELECT id, name
      FROM departments
      ORDER BY name ASC
    `
  );

  res.json({ data: result.rows });
});

export const createStaff = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const data = createUserSchema.parse(req.body);
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

export const updateStaff = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.params.id);
  const data = updateUserSchema.parse(req.body);
  const user = await updateUserAccount(userId, data);
  await logAudit({
    actorUserId: req.user?.id ?? null,
    action: "user.update",
    entityType: "user",
    entityId: userId
  });
  res.json({ user });
});

export const resetStaffPassword = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.params.id);
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

export const deleteStaff = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.params.id);
  await deleteUserAccount(userId);
  await logAudit({
    actorUserId: req.user?.id ?? null,
    action: "user.delete",
    entityType: "user",
    entityId: userId
  });
  res.status(204).send();
});
