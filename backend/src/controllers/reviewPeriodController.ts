import { Response } from "express";
import { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { activateReviewPeriodSchema, createReviewPeriodSchema } from "../validators/reviewPeriod.js";
import {
  createReviewPeriod,
  getActiveReviewPeriod,
  listReviewPeriods,
  setActiveReviewPeriod
} from "../services/reviewPeriodService.js";
import { logAudit } from "../utils/audit.js";

export const listPeriods = asyncHandler(async (_req: AuthedRequest, res: Response) => {
  const periods = await listReviewPeriods();
  const active = await getActiveReviewPeriod();
  res.json({ data: periods, active });
});

export const createPeriod = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const data = createReviewPeriodSchema.parse(req.body);
  const period = await createReviewPeriod(data);
  await logAudit({
    actorUserId: req.user?.id ?? null,
    action: "review_period.create",
    entityType: "review_period",
    entityId: period.id,
    metadata: { isActive: period.is_active }
  });
  res.status(201).json({ period });
});

export const activatePeriod = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const data = activateReviewPeriodSchema.parse(req.body);
  const period = await setActiveReviewPeriod(data.periodId);
  await logAudit({
    actorUserId: req.user?.id ?? null,
    action: "review_period.activate",
    entityType: "review_period",
    entityId: period.id
  });
  res.json({ period });
});
