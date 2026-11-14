import type { D1Database } from "../db/sqlite";

export class MatchConflictError extends Error {}
type RecordWrite = { kind: string; id: string; value: object };

// Serializes approvals/revocations across isolates; every batch write also checks the lease token.
// The lock expires after interrupted requests, while stale holders cannot commit or release it.
export async function withProductMatchLock<T>(
  db: D1Database,
  work: (save: (records: RecordWrite[]) => Promise<void>) => Promise<T>,
) {
  let token = crypto.randomUUID();
  const now = Date.now();
  const acquired = await db
    .prepare(
      "INSERT INTO records(id,kind,payload,updated_at) VALUES('system:productMatchLock','system',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE coalesce(json_extract(records.payload,'$.until'),0)<=?",
    )
    .bind(JSON.stringify({ token, until: now + 240000 }), now, now)
    .run();
  if (acquired.meta.changes !== 1)
    throw new MatchConflictError("Başqa uyğunlaşdırma işlənir. Bir az sonra yenidən yoxla.");
  try {
    return await work(async (records) => {
      if (!records.length) return;
      const commitToken = crypto.randomUUID();
      const result = await db.batch([
        db
          .prepare(
            "UPDATE records SET payload=json_set(payload,'$.token',?,'$.until',?),updated_at=? WHERE id='system:productMatchLock' AND json_extract(payload,'$.token')=? AND json_extract(payload,'$.until')>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)",
          )
          .bind(commitToken, Date.now() + 240000, Date.now(), token),
        ...records.map(({ kind, id, value }) =>
          db
            .prepare(
              "INSERT INTO records(id,kind,payload,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id='system:productMatchLock' AND json_extract(payload,'$.token')=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
            )
            .bind(kind + ":" + id, kind, JSON.stringify({ ...value, id }), Date.now(), commitToken),
        ),
      ]);
      if (result[0]?.meta.changes !== 1)
        throw new MatchConflictError(
          "Uyğunlaşdırmanın icra vaxtı bitdi. Məlumatı yeniləyib yenidən yoxla.",
        );
      token = commitToken;
    });
  } finally {
    await db
      .prepare(
        "DELETE FROM records WHERE id='system:productMatchLock' AND json_extract(payload,'$.token')=?",
      )
      .bind(token)
      .run();
  }
}
