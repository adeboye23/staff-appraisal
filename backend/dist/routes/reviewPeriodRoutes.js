import { Router } from "express";
import { activatePeriod, createPeriod, listPeriods } from "../controllers/reviewPeriodController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
const router = Router();
router.use(requireAuth);
router.get("/", listPeriods);
router.post("/", requireRole("hr"), createPeriod);
router.patch("/active", requireRole("hr"), activatePeriod);
export default router;
