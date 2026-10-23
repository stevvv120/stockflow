import type { PoolConnection } from "mysql2/promise";

export async function writeAudit(
  connection: PoolConnection,
  userId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  details: Record<string, unknown> = {}
) {
  await connection.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, action, entityType, entityId, JSON.stringify(details)]
  );
}
