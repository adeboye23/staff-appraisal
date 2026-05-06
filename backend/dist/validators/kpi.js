import { z } from "zod";
export const createKpiSchema = z.object({
    appraisalId: z.number().int().positive().optional(),
    period: z.string().min(2).optional(),
    userId: z.number().int().positive(),
    title: z.string().min(2),
    description: z.string().optional(),
    weight: z.number().nonnegative().optional(),
    target: z.number().nonnegative().optional()
});
export const updateKpiSchema = z.object({
    title: z.string().min(2).optional(),
    description: z.string().optional(),
    weight: z.number().nonnegative().optional(),
    target: z.number().nonnegative().optional(),
    status: z.enum(["draft", "submitted", "approved", "rejected"]).optional()
});
export const approveKpiSchema = z.object({
    status: z.enum(["approved", "rejected"]),
    comment: z.string().min(2).optional()
});
