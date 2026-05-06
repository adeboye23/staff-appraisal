import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["employee", "manager", "hr"]),
  departmentId: z.number().int().positive().nullable().optional(),
  managerId: z.number().int().positive().nullable().optional()
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(["employee", "manager", "hr"]).optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  managerId: z.number().int().positive().nullable().optional()
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(8)
});
