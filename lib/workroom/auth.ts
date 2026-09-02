import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The workroom door.
 *
 * Ported from anchor's `lib/workroom/auth.ts`, the newest copy in the
 * studio's workroom family, and kept as it is there:
 *
 *   - A PASSCODE, whatever WORKROOM_PASSCODE says, at least four characters.
 *     The login route's limiter (five misses per ten minutes per address)
 *     is what makes a short code survivable on the public internet.
 *   - THE COOKIE CARRIES A HASH, never the passcode. A stolen cookie opens
 *     the door until it expires; it never hands over the code itself.
 *   - UNSET IN PRODUCTION IS A CLOSED DOOR, not a known fallback. The
 *     fallback below exists for local development only.
 *
 * A gate, not a vault. Behind it: the events list and the menu prices, both
 * of which the site publishes anyway, with the built-in value one clear and
 * save away. Nothing here moves money.
 */

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

export async function isWorkroomAuthed(): Promise<boolean> {
  const passcode = workroomPasscode();
  if (passcode === null) return false;
  const jar = await cookies();
  const got = jar.get(COOKIE)?.value;
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(token(passcode));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setWorkroomCookie(passcode: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, token(passcode), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // A working day and the evening after it.
    maxAge: 60 * 60 * 18,
    path: "/",
  });
}

export async function clearWorkroomCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
