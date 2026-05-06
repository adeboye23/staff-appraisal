import { Router } from "express";
import {
  getComments,
  createPerformance,
  finalScore,
  getPerformance,
  getTimeline,
  managerScore,
  selfAppraisal,
  signOff
} from "../controllers/performanceController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.post("/", requireRole("employee", "manager", "hr"), createPerformance);
router.get("/:userId/timeline", getTimeline);
router.get("/:userId/comments", getComments);
router.get("/:userId", getPerformance);
router.post("/manager-score", requireRole("manager", "hr"), managerScore);
router.post("/self-appraisal", requireRole("employee", "hr"), selfAppraisal);
router.post("/final-score", requireRole("manager", "hr"), finalScore);
router.post("/signoff", requireRole("employee", "manager", "hr"), signOff);

export default router;
