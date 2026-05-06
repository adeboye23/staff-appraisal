import { changePasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "../validators/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { changePassword, loginUser, registerUser, resetPassword } from "../services/authService.js";
import { logAudit } from "../utils/audit.js";
export const register = asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const user = await registerUser(data);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "auth.register",
        entityType: "user",
        entityId: user.id,
        metadata: { role: data.role }
    });
    res.status(201).json({ user });
});
export const login = asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const result = await loginUser(data.email, data.password);
    await logAudit({
        actorUserId: result.user.id,
        action: "auth.login",
        entityType: "user",
        entityId: result.user.id
    });
    res.json(result);
});
export const logout = asyncHandler(async (req, res) => {
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "auth.logout",
        entityType: "session",
        entityId: req.user?.id ?? null
    });
    res.json({ message: "Logged out successfully" });
});
export const reset = asyncHandler(async (req, res) => {
    const data = resetPasswordSchema.parse(req.body);
    await resetPassword(data.email, data.newPassword);
    res.json({ message: "Password reset successfully" });
});
export const change = asyncHandler(async (req, res) => {
    const data = changePasswordSchema.parse(req.body);
    await changePassword(req.user.id, data.currentPassword, data.newPassword);
    await logAudit({
        actorUserId: req.user?.id ?? null,
        action: "auth.change_password",
        entityType: "user",
        entityId: req.user?.id ?? null
    });
    res.json({ message: "Password changed successfully" });
});
