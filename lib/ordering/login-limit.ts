import "server-only";
import { connectionVar, workroomDatabase } from "../workroom/store";

const WINDOW = 10 * 60 * 1000;
const LIMIT = 5;
const local = globalThis as typeof globalThis & { __copperKitchenLogin?: { started: number; count: number } };

/** One bounded account bucket, shared by all staff devices; owner login is separate. */
export async function allowKitchenLogin(now = Date.now()): Promise<boolean> {
  if (!connectionVar()) {
    if (process.env.NODE_ENV === "production") throw new Error("Persistent kitchen sign-in storage unavailable.");
    const prior = local.__copperKitchenLogin;
    const bucket = prior && now >= prior.started && now - prior.started < WINDOW ? prior : { started: now, count: 0 };
    bucket.count = Math.min(bucket.count, LIMIT) + 1;
    local.__copperKitchenLogin = bucket;
    return bucket.count <= LIMIT;
  }
  const result = await (await workroomDatabase()).query(`INSERT INTO copper_login_attempts(id,attempts,started) VALUES('kitchen',1,$1)
    ON CONFLICT(id) DO UPDATE SET
      attempts=CASE WHEN copper_login_attempts.started<=$2 THEN 1 ELSE LEAST(copper_login_attempts.attempts,5)+1 END,
      started=CASE WHEN copper_login_attempts.started<=$2 THEN $1 ELSE copper_login_attempts.started END
    RETURNING attempts`, [now, now - WINDOW]);
  return Number(result.rows[0].attempts) <= LIMIT;
}
