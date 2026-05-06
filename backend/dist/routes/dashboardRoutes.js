import { Router } from "express";
import { getDashboardSummary, getNotifications } from "../controllers/dashboardController.js";
import { requireAuth } from "../middleware/auth.js";
const router = Router();
router.use(requireAuth);
router.get("/summary", getDashboardSummary);
router.get("/notifications", getNotifications);
export default router;
