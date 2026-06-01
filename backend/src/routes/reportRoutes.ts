import { Router } from "express";
import { departmentReport, organizationReport, userReport } from "../controllers/reportController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/organization", requireRole("hr"), organizationReport);
router.get("/user/:id", userReport);
router.get("/department/:id", requireRole("manager", "hr"), departmentReport);

export default router;
