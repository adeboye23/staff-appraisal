import { z } from "zod";
export const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["employee", "manager", "hr"]),
    departmentId: z.number().int().positive().nullable().optional(),
    managerId: z.number().int().positive().nullable().optional()
});
export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8)
});
export const resetPasswordSchema = z.object({
    email: z.string().email()
});
export const completePasswordResetSchema = z.object({
    email: z.string().email(),
    token: z.string().min(32),
    newPassword: z.string().min(8)
});
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8)
});
