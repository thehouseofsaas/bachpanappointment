import type { DbOrTx } from "@/db/client";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  actorType: "admin" | "parent" | "teacher" | "system";
  actor?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
  ip?: string | null;
};

/** Append-only record of who did what. Pass the open transaction so it commits with the change. */
export async function audit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorType: entry.actorType,
    actor: entry.actor ?? null,
    action: entry.action,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    detail: entry.detail ?? null,
    ip: entry.ip ?? null,
  });
}
