import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { issueSession, sessionRole, SESSION_SECONDS } from "./session";

/** Signed expiring owner sessions. Production requires a separate session secret. */

const COOKIE = "copperac_workroom";
const DEV_FALLBACK = "workroom-dev";
const MIN_LENGTH = 4;

/** The passcode, or null meaning "this deployment has no workroom". */
export function workroomPasscode(): string | null {
  const set = process.env.WORKROOM_PASSCODE?.trim();
  if (set) {
    if (set.length < MIN_LENGTH) {
      console.error(
        `[workroom] WORKROOM_PASSCODE is shorter than ${MIN_LENGTH} characters, so the workroom is closed. Set a longer one.`
      );
      return null;
    }
    return set;
  }
  return process.env.NODE_ENV === "production" ? null : DEV_FALLBACK;
}

function token(passcode: string): string {
  return createHash("sha256").update(`copperac-workroom-v1:${passcode}`).digest("hex");
}

/** Constant time, so a wrong guess cannot be timed character by character. */
export function passcodeMatches(candidate: string, passcode: string): boolean {
  const a = Buffer.from(token(candidate));
  const b = Buffer.from(token(passcode));
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionSecret(): string | null {
  let secret = process.env.WORKROOM_SESSION_SECRET?.trim();
  if (!secret && process.env.NODE_ENV !== "production") {
    const local = globalThis as typeof globalThis & { __copperSessionSecret?: string };
    secret = local.__copperSessionSecret ||= randomBytes(32).toString("hex");
  }
  if (!secret || secret.length < 32) return null;
  // Bind the reusable primitive to this application, even if configuration is reused.
  return createHmac("sha256", secret).update("copperac-workroom-v2").digest("hex");
}

export function workroomSessionReady() { return Boolean(workroomPasscode() && sessionSecret()); }

export async function isWorkroomAuthed(): Promise<boolean> {
  const passcode = workroomPasscode(), secret = sessionSecret();
  if (!passcode || !secret) return false;
  const jar = await cookies();
  return sessionRole(jar.get(COOKIE)?.value, secret, { staff: null, owner: passcode }) === "owner";
}

export async function setWorkroomCookie(passcode: string): Promise<void> {
  const expected = workroomPasscode(), secret = sessionSecret();
  if (!expected || !secret || !passcodeMatches(passcode, expected)) throw new Error("Workroom session unavailable.");
  const jar = await cookies();
  jar.set(COOKIE, issueSession("owner", expected, secret), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS, path: "/",
  });
}

export async function clearWorkroomCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
}
