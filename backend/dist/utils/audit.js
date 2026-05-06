import { query } from "../db.js";
export async function logAudit(params) {
    const { actorUserId, action, entityType, entityId, metadata = {} } = params;
    await query(`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `, [actorUserId ?? null, action, entityType, entityId ?? null, JSON.stringify(metadata)]);
}
