import { z } from "zod";

export const performanceSchema = z.object({
  kpiId: z.number().int().positive(),
  actual: z.number().nonnegative()
});

export const selfAppraisalSchema = z.object({
  kpiId: z.number().int().positive(),
  selfScore: z.number().int().min(1).max(5),
  comment: z.string().min(2)
});

export const managerScoreSchema = z.object({
  kpiId: z.number().int().positive(),
  managerScore: z.number().int().min(1).max(5),
  comment: z.string().min(2)
});

export const finalScoreSchema = z.object({
  kpiId: z.number().int().positive(),
  finalScore: z.number().int().min(1).max(5),
  agree: z.boolean()
});

export const signOffSchema = z.object({
  appraisalId: z.number().int().positive(),
  actor: z.enum(["employee", "manager"])
});
