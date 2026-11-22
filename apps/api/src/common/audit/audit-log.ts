import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { ADMIN_HISTORY_LIMIT, type AdminHistoryEntry } from '@cineseat/shared';
import {
  fromSqlTime,
  sqlTime,
  type InventoryTx,
  type SqlValue,
} from '../../database/inventory-lane';

/**
 * The audit trail of admin changes (`audit_logs`), written inside the same
 * transaction as the change so the record and the change commit together.
 *
 * `action` is `<entity>.<verb>[:<fields>]` — `movies.update:title,status`,
 * `theaters.screen.delete`, `shows.create`, `users.role.admin` (announcements use
 * the same shape).
 * `subject` says in words what the change was about, as it read at the time
 * ("Screen 2", a movie's title), so an entry stays readable after the thing is
 * deleted. A theater's screens are recorded on the theater (`theaters.screen.*`)
 * so its history covers them, deleted screens included.
 */
export type AuditEntity = 'movies' | 'theaters' | 'shows' | 'users';

export type AuditEntry = {
  /** The admin who made the change; null for system changes (seed, tests) — nothing is recorded. */
  actorId: string | null;
  entity: AuditEntity;
  entityId: string;
  verb: string;
  fields?: readonly string[];
  subject?: string | null;
  now?: Date;
};

const INSERT_SQL = `INSERT INTO "audit_logs" ("id", "actorId", "action", "entity", "entityId", "subject", "createdAt")
   VALUES (?, ?, ?, ?, ?, ?, ?)`;

export async function recordChange(tx: EntityManager, entry: AuditEntry): Promise<void> {
  if (entry.actorId === null) return;
  await tx.query(INSERT_SQL, auditRow(entry, entry.actorId));
}

/** `recordChange` inside an InventoryLane unit (changes made through the lane). */
export function recordChangeInLane(tx: InventoryTx, entry: AuditEntry): void {
  if (entry.actorId === null) return;
  tx.run(INSERT_SQL, ...auditRow(entry, entry.actorId));
}

function auditRow(entry: AuditEntry, actorId: string): SqlValue[] {
  const detail = entry.fields?.length ? `:${entry.fields.join(',')}` : '';
  return [
    randomUUID(),
    actorId,
    `${entry.entity}.${entry.verb}${detail}`,
    entry.entity,
    entry.entityId,
    entry.subject ?? null,
    sqlTime(entry.now ?? new Date()),
  ];
}

/** `theaters.screen.update:name,formats` → `{ verb: 'screen.update', fields: ['name', 'formats'] }`. */
export function parseAction(entity: string, action: string): { verb: string; fields: string[] } {
  const body = action.startsWith(`${entity}.`) ? action.slice(entity.length + 1) : action;
  const [verb, detail] = body.split(':', 2);
  return { verb, fields: detail ? detail.split(',').filter(Boolean) : [] };
}

/** The latest recorded changes of one thing, newest first, with who made them. */
export async function historyOf(
  manager: EntityManager,
  entity: AuditEntity,
  entityId: string,
  limit: number = ADMIN_HISTORY_LIMIT,
): Promise<AdminHistoryEntry[]> {
  const rows = await manager.query<
    {
      id: string;
      action: string;
      subject: string | null;
      createdAt: string;
      actorId: string;
      name: string;
      email: string;
    }[]
  >(
    `SELECT a."id", a."action", a."subject", a."createdAt", u."id" AS "actorId", u."name", u."email"
     FROM "audit_logs" a JOIN "users" u ON u."id" = a."actorId"
     WHERE a."entity" = ? AND a."entityId" = ?
     ORDER BY a."createdAt" DESC, a.rowid DESC
     LIMIT ?`,
    [entity, entityId, limit],
  );
  return rows.map((row) => {
    const { verb, fields } = parseAction(entity, row.action);
    return {
      id: row.id,
      action: verb,
      fields,
      subject: row.subject,
      actor: { id: row.actorId, name: row.name, email: row.email },
      at: fromSqlTime(row.createdAt).toISOString(),
    };
  });
}
