import { z } from "zod";

export const performanceSchema = z.object({
  kpiId: z.number().int().positive(),
  actual: z.number().nonnegative()
});

export const selfAppraisalSchema = z.object({
  kpiId: z.number().int().positive(),
  selfScore: z.number().nonnegative(),
  comment: z.string().min(2)
});

export const managerScoreSchema = z.object({
  kpiId: z.number().int().positive(),
  managerScore: z.number().nonnegative(),
  comment: z.string().min(2)
});

export const finalScoreSchema = z.object({
  kpiId: z.number().int().positive(),
  finalScore: z.number().nonnegative(),
  agree: z.boolean()
});

export const signOffSchema = z.object({
  appraisalId: z.number().int().positive(),
  actor: z.enum(["employee", "manager"])
});
