import 'server-only';
import { connectionVar, workroomDatabase } from './store';

const WINDOW = 10 * 60 * 1000;
const LIMIT = 5;
const local = globalThis as typeof globalThis & { __copperLogin?: { started: number; count: number } };

export async function allowLogin(now = Date.now()) {
  if (!connectionVar()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Persistent login storage unavailable.');
    const prior = local.__copperLogin;
    const bucket = prior && now - prior.started < WINDOW ? prior : { started: now, count: 0 };
    bucket.count++;
    local.__copperLogin = bucket;
    return bucket.count <= LIMIT;
  }
  const db = await workroomDatabase();
  const result = await db.query(`INSERT INTO copper_login_attempts(id,attempts,started) VALUES('owner',1,$1)
    ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN copper_login_attempts.started<=$2 THEN 1 ELSE copper_login_attempts.attempts+1 END,
    started=CASE WHEN copper_login_attempts.started<=$2 THEN $1 ELSE copper_login_attempts.started END RETURNING attempts`, [now, now - WINDOW]);
  return Number(result.rows[0].attempts) <= LIMIT;
}

export async function clearLoginAttempts() {
  if (!connectionVar()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Persistent login storage unavailable.');
    local.__copperLogin = undefined;
    return;
  }
  await (await workroomDatabase()).query("DELETE FROM copper_login_attempts WHERE id='owner'");
}
