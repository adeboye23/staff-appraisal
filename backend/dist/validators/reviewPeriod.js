import { z } from "zod";
export const createReviewPeriodSchema = z.object({
    name: z.string().min(2),
    startsOn: z.string().optional().nullable(),
    endsOn: z.string().optional().nullable(),
    isActive: z.boolean().optional()
});
export const activateReviewPeriodSchema = z.object({
    periodId: z.number().int().positive()
});
