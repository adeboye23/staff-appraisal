import { app } from "./app.js";
import { config } from "./config.js";
import { ensureAppraisalWorkflowColumns } from "./services/appraisalService.js";
import { ensurePasswordResetTokensTable, ensureUserRoleConstraint } from "./services/authService.js";
import { ensureReviewPeriodsTable } from "./services/reviewPeriodService.js";

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function initializeDatabase() {
  const attempts = 8;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await ensureReviewPeriodsTable();
      await ensureUserRoleConstraint();
      await ensurePasswordResetTokensTable();
      await ensureAppraisalWorkflowColumns();
      return;
    } catch (error) {
      console.error(`Database initialization attempt ${attempt}/${attempts} failed`, error);

      if (attempt === attempts) {
        throw error;
      }

      await wait(5000);
    }
  }
}

void initializeDatabase()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`News Central API listening on port ${config.port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize review periods after multiple retries", error);
    process.exit(1);
  });
