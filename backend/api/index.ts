import { app } from "../src/app.js";
import { ensureAppraisalWorkflowColumns } from "../src/services/appraisalService.js";
import { ensurePasswordResetTokensTable, ensureUserRoleConstraint } from "../src/services/authService.js";
import { ensureInvitationInfrastructure } from "../src/services/invitationService.js";
import { ensureReviewPeriodsTable } from "../src/services/reviewPeriodService.js";

const initialization = Promise.all([
  ensureReviewPeriodsTable(),
  ensureUserRoleConstraint(),
  ensurePasswordResetTokensTable(),
  ensureInvitationInfrastructure(),
  ensureAppraisalWorkflowColumns()
]);

export default async function handler(
  req: Parameters<typeof app>[0],
  res: Parameters<typeof app>[1]
) {
  await initialization;
  return app(req, res);
}
