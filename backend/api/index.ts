import { app } from "../src/app.js";
import { ensureReviewPeriodsTable } from "../src/services/reviewPeriodService.js";

const initialization = ensureReviewPeriodsTable();

export default async function handler(
  req: Parameters<typeof app>[0],
  res: Parameters<typeof app>[1]
) {
  await initialization;
  return app(req, res);
}
