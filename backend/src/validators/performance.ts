import { z } from "zod";

export const performanceSchema = z.object({
  kpiId: z.number().int().positive(),
  actual: z.number().nonnegative()
});

export const selfAppraisalSchema = z.object({
  kpiId: z.number().int().positive(),
  selfScore: z.number().min(1).max(5),
  comment: z.string().min(2).optional()
});

export const managerScoreSchema = z.object({
  kpiId: z.number().int().positive(),
  managerScore: z.number().min(1).max(5),
  comment: z.string().min(2).optional()
});

export const finalScoreSchema = z.object({
  kpiId: z.number().int().positive(),
  finalScore: z.number().min(1).max(5),
  agree: z.boolean()
});

export const directorReviewSchema = z.object({
  appraisalId: z.number().int().positive(),
  overallRemark: z.string().min(2),
  improvementSuggestions: z.string().min(2).optional(),
  trainingRecommendations: z.string().min(2).optional()
});

export const signOffSchema = z.object({
  appraisalId: z.number().int().positive(),
  actor: z.enum(["employee", "manager"])
});

export const unlockEvaluationSchema = z.object({
  appraisalId: z.number().int().positive(),
  unlocked: z.boolean().optional().default(true)
});
