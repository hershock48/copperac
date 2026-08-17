// Kitchen auth: a PIN and a cookie.
//
// This is a gate, not a vault. It keeps passers-by and search crawlers off the
// kitchen screen; it is not defense against a determined attacker, and nothing
// behind it moves money or exposes more than tonight's ticket queue. If that
// ever changes, this is the file that has to grow up first.

import { cookies } from "next/headers";
import { KITCHEN_PIN_FALLBACK } from "./config";

const COOKIE = "copper_kitchen";

export function kitchenPin(): string {
  return process.env.KITCHEN_PIN || KITCHEN_PIN_FALLBACK;
}

export async function isKitchenAuthed(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value === kitchenPin();
}

export async function setKitchenCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, kitchenPin(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // A shift, with margin. Not a year: a stolen tablet should age out.
    maxAge: 60 * 60 * 18,
    path: "/",
  });
}
