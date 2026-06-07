import { Router } from "express";
import {
  bulkOnboardStaff,
  createDepartment,
  createStaff,
  deleteDepartment,
  deleteStaff,
  listStaffInvitations,
  listDepartments,
  listStaff,
  resetStaffPassword,
  resendStaffInvitation,
  revokeStaffInvitation,
  updateDepartment,
  updateStaffStatus,
  updateStaff
} from "../controllers/userController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/departments", requireRole("hr"), listDepartments);
router.post("/departments", requireRole("hr"), createDepartment);
router.put("/departments/:id", requireRole("hr"), updateDepartment);
router.delete("/departments/:id", requireRole("hr"), deleteDepartment);
router.post("/bulk-onboard", requireRole("hr"), bulkOnboardStaff);
router.get("/invitations", requireRole("hr"), listStaffInvitations);
router.post("/invitations/:id/resend", requireRole("hr"), resendStaffInvitation);
router.post("/invitations/:id/revoke", requireRole("hr"), revokeStaffInvitation);
router.get("/", listStaff);
router.post("/", requireRole("hr"), createStaff);
router.put("/:id", requireRole("hr"), updateStaff);
router.patch("/:id/status", requireRole("hr"), updateStaffStatus);
router.post("/:id/reset-password", requireRole("hr"), resetStaffPassword);
router.delete("/:id", requireRole("hr"), deleteStaff);

export default router;
