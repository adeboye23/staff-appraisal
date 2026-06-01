import { query } from "../db.js";
import { ApiError } from "../utils/ApiError.js";

export type ReviewPeriodRow = {
  id: number;
  name: string;
  is_active: boolean;
  starts_on: string | null;
  ends_on: string | null;
};

export async function ensureReviewPeriodsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS review_periods (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      starts_on DATE,
      ends_on DATE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_periods_single_active
    ON review_periods ((is_active))
    WHERE is_active = TRUE
  `);

  const active = await query<{ id: number }>(
    "SELECT id FROM review_periods WHERE is_active = TRUE LIMIT 1"
  );

  if (active.rows.length) {
    return;
  }

  await query("UPDATE review_periods SET is_active = FALSE, updated_at = NOW()");
}

export async function listReviewPeriods() {
  const result = await query<ReviewPeriodRow>(
    `
      SELECT id, name, is_active, starts_on::text, ends_on::text
      FROM review_periods
      ORDER BY is_active DESC, name ASC
    `
  );

  return result.rows;
}

export async function getActiveReviewPeriod() {
  const result = await query<ReviewPeriodRow>(
    `
      SELECT id, name, is_active, starts_on::text, ends_on::text
      FROM review_periods
      WHERE is_active = TRUE
      LIMIT 1
    `
  );

  return result.rows[0] ?? null;
}

export async function createReviewPeriod(input: {
  name: string;
  startsOn?: string | null;
  endsOn?: string | null;
  isActive?: boolean;
}) {
  if (input.isActive) {
    await query("UPDATE review_periods SET is_active = FALSE, updated_at = NOW() WHERE is_active = TRUE");
  }

  const result = await query<ReviewPeriodRow>(
    `
      INSERT INTO review_periods (name, is_active, starts_on, ends_on)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, is_active, starts_on::text, ends_on::text
    `,
    [input.name, Boolean(input.isActive), input.startsOn ?? null, input.endsOn ?? null]
  );

  return result.rows[0];
}

export async function setActiveReviewPeriod(periodId: number) {
  const exists = await query<{ id: number }>("SELECT id FROM review_periods WHERE id = $1", [periodId]);
  if (!exists.rows[0]) {
    throw new ApiError(404, "Review period not found");
  }

  await query(
    `
      UPDATE review_periods
      SET is_active = CASE WHEN id = $1 THEN TRUE ELSE FALSE END,
          updated_at = NOW()
    `,
    [periodId]
  );

  return getActiveReviewPeriod();
}
