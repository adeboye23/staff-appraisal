import { Router } from "express";
import { change, login, logout, register, reset } from "../controllers/authController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.post("/login", authLimiter, login);
router.post("/register", authLimiter, requireAuth, requireRole("hr"), register);
router.post("/logout", requireAuth, logout);
router.post("/reset-password", authLimiter, reset);
router.post("/change-password", requireAuth, change);

export default router;
