import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { config } from "../config.js";
import { query } from "../db.js";
import { ApiError } from "../utils/ApiError.js";
import { sendEmail } from "./emailService.js";
function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}
function nameFromEmail(email) {
    return email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}
function setupEmailHtml(input) {
    return `
    <div style="margin:0;background:#f6f7fb;padding:32px 16px;font-family:Aptos,Segoe UI,Arial,sans-serif;color:#111827;">
      <table role="presentation" style="width:100%;max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e6e8ee;border-radius:20px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px;border-bottom:1px solid #eef0f4;">
            <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#c1121f;font-weight:700;">News Central</div>
            <h1 style="margin:12px 0 0;font-size:26px;line-height:1.2;color:#0b1020;">Set up your appraisal account</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 32px;">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7;">Hello ${input.name},</p>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">You have been invited to the News Central Performance Portal under <strong>${input.department}</strong>.</p>
            <a href="${input.setupUrl}" style="display:inline-block;background:#c1121f;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 18px;">Set Up Account</a>
            <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">This secure link expires in 24 hours and can only be used once.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}
export async function ensureInvitationInfrastructure() {
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'active'");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP");
    await query("UPDATE users SET account_status = 'active' WHERE account_status IS NULL");
    await query(`
    CREATE TABLE IF NOT EXISTS invitation_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      delivery_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      sent_at TIMESTAMP,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
    await query("CREATE INDEX IF NOT EXISTS idx_invitation_tokens_user ON invitation_tokens(user_id)");
    await query("CREATE INDEX IF NOT EXISTS idx_invitation_tokens_status ON invitation_tokens(status)");
}
export async function createInvitation(input) {
    const email = input.email.toLowerCase().trim();
    const department = await query("SELECT id, name FROM departments WHERE id = $1", [
        input.departmentId
    ]);
    const departmentRow = department.rows[0];
    if (!departmentRow) {
        throw new ApiError(404, "Department not found");
    }
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount) {
        return { skipped: true, email, reason: "already registered" };
    }
    const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    const user = await query(`
      INSERT INTO users (name, email, password, role, department_id, manager_id, account_status, invited_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      RETURNING id, name, email, role
    `, [
        nameFromEmail(email) || email,
        email,
        placeholderPassword,
        input.role,
        input.departmentId,
        input.managerId ?? null
    ]);
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const invitation = await query(`
      INSERT INTO invitation_tokens (user_id, token_hash, expires_at, created_by)
      VALUES ($1, $2, NOW() + INTERVAL '24 hours', $3)
      RETURNING id
    `, [user.rows[0].id, tokenHash, input.createdBy]);
    const setupUrl = `${config.clientUrl}?setupToken=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    try {
        await sendEmail({
            to: email,
            subject: "Set up your News Central appraisal account",
            html: setupEmailHtml({ name: user.rows[0].name, department: departmentRow.name, setupUrl }),
            text: `Hello ${user.rows[0].name}, set up your News Central appraisal account for ${departmentRow.name}: ${setupUrl}. This link expires in 24 hours.`
        });
        await query("UPDATE invitation_tokens SET status = 'pending', delivery_attempts = delivery_attempts + 1, sent_at = NOW(), last_error = NULL WHERE id = $1", [
            invitation.rows[0].id
        ]);
        return { skipped: false, user: user.rows[0], invitationId: invitation.rows[0].id, email, status: "pending" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Email delivery failed";
        await query("UPDATE invitation_tokens SET status = 'failed', delivery_attempts = delivery_attempts + 1, last_error = $2 WHERE id = $1", [
            invitation.rows[0].id,
            message
        ]);
        return { skipped: false, user: user.rows[0], invitationId: invitation.rows[0].id, email, status: "failed", error: message };
    }
}
export async function listInvitations() {
    const result = await query(`
    SELECT
      it.id,
      it.user_id,
      u.name,
      u.email,
      u.role,
      u.account_status,
      d.name AS department,
      it.status,
      it.expires_at,
      it.used_at,
      it.sent_at,
      it.delivery_attempts,
      it.last_error,
      creator.name AS created_by_name,
      it.created_at
    FROM invitation_tokens it
    JOIN users u ON u.id = it.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN users creator ON creator.id = it.created_by
    ORDER BY it.created_at DESC
    LIMIT 200
  `);
    return result.rows;
}
export async function validateInvitation(token) {
    const tokenHash = hashToken(token);
    const result = await query(`
      SELECT it.id, it.user_id, u.email, u.name, d.name AS department, it.status, it.expires_at
      FROM invitation_tokens it
      JOIN users u ON u.id = it.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE it.token_hash = $1
      LIMIT 1
    `, [tokenHash]);
    const invitation = result.rows[0];
    if (!invitation) {
        throw new ApiError(400, "Invitation link is invalid");
    }
    if (invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
        if (invitation.status === "pending") {
            await query("UPDATE invitation_tokens SET status = 'expired' WHERE id = $1", [invitation.id]);
        }
        throw new ApiError(400, "Invitation link is expired or no longer active");
    }
    return invitation;
}
export async function acceptInvitation(token, password, name) {
    const invitation = await validateInvitation(token);
    const hashed = await bcrypt.hash(password, 10);
    await query(`
      UPDATE users
      SET password = $1,
          name = COALESCE($2, name),
          account_status = 'active',
          activated_at = NOW()
      WHERE id = $3
    `, [hashed, name?.trim() || null, invitation.user_id]);
    await query("UPDATE invitation_tokens SET status = 'accepted', used_at = NOW() WHERE id = $1", [invitation.id]);
    return invitation;
}
export async function resendInvitation(invitationId, actorId) {
    const result = await query(`
      SELECT u.id AS user_id, u.name, u.email, u.role, u.department_id, d.name AS department
      FROM invitation_tokens it
      JOIN users u ON u.id = it.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE it.id = $1 AND u.account_status = 'pending'
    `, [invitationId]);
    const record = result.rows[0];
    if (!record?.department_id) {
        throw new ApiError(404, "Pending invitation not found");
    }
    await query("UPDATE invitation_tokens SET status = 'revoked', revoked_at = NOW() WHERE id = $1", [invitationId]);
    const token = crypto.randomBytes(32).toString("hex");
    const setupUrl = `${config.clientUrl}?setupToken=${encodeURIComponent(token)}&email=${encodeURIComponent(record.email)}`;
    const invitation = await query(`
      INSERT INTO invitation_tokens (user_id, token_hash, expires_at, created_by)
      VALUES ($1, $2, NOW() + INTERVAL '24 hours', $3)
      RETURNING id
    `, [record.user_id, hashToken(token), actorId]);
    try {
        await sendEmail({
            to: record.email,
            subject: "Set up your News Central appraisal account",
            html: setupEmailHtml({ name: record.name, department: record.department, setupUrl }),
            text: `Hello ${record.name}, set up your News Central appraisal account for ${record.department}: ${setupUrl}. This link expires in 24 hours.`
        });
        await query("UPDATE invitation_tokens SET status = 'pending', delivery_attempts = delivery_attempts + 1, sent_at = NOW(), last_error = NULL WHERE id = $1", [
            invitation.rows[0].id
        ]);
        return { skipped: false, invitationId: invitation.rows[0].id, email: record.email, status: "pending" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Email delivery failed";
        await query("UPDATE invitation_tokens SET status = 'failed', delivery_attempts = delivery_attempts + 1, last_error = $2 WHERE id = $1", [
            invitation.rows[0].id,
            message
        ]);
        return { skipped: false, invitationId: invitation.rows[0].id, email: record.email, status: "failed", error: message };
    }
}
export async function revokeInvitation(invitationId) {
    const result = await query(`
      UPDATE invitation_tokens
      SET status = 'revoked', revoked_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'failed', 'expired')
      RETURNING user_id
    `, [invitationId]);
    if (!result.rowCount) {
        throw new ApiError(404, "Invitation not found or cannot be revoked");
    }
    await query("UPDATE users SET account_status = 'deactivated', deactivated_at = NOW() WHERE id = $1 AND account_status = 'pending'", [
        result.rows[0].user_id
    ]);
}
