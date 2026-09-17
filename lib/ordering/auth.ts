import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isWorkroomAuthed, workroomPasscode } from "../workroom/auth";
import { issueSession, sessionRole, SESSION_SECONDS } from "../workroom/session";
import { KITCHEN_PIN_FALLBACK } from "./config";

const COOKIE = "copper_kitchen";

/** Published demo PINs only work in local development. */
export function kitchenPin(): string | null {
  const configured = process.env.KITCHEN_PIN?.trim();
  if (process.env.NODE_ENV !== "production") return configured || KITCHEN_PIN_FALLBACK;
  if (!configured || !/^\d{6,12}$/.test(configured) || configured === KITCHEN_PIN_FALLBACK || configured === workroomPasscode()) return null;
  return configured;
}

function sessionSecret(): string | null {
  let secret = process.env.WORKROOM_SESSION_SECRET?.trim();
  if (!secret && process.env.NODE_ENV !== "production") {
    const local = globalThis as typeof globalThis & { __copperKitchenSecret?: string };
    secret = local.__copperKitchenSecret ||= randomBytes(32).toString("hex");
  }
  if (!secret || secret.length < 32 || secret === kitchenPin() || secret === workroomPasscode()) return null;
  // Separate app and purpose: a staff token can never become an owner token.
  return createHmac("sha256", secret).update("copperac-kitchen-v1").digest("hex");
}

export function kitchenSessionReady(): boolean { return Boolean(kitchenPin() && sessionSecret()); }

export function kitchenPinMatches(candidate: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

export async function kitchenRole(): Promise<"staff" | "owner" | null> {
  if (await isWorkroomAuthed()) return "owner";
  const pin = kitchenPin(), secret = sessionSecret();
  if (!pin || !secret) return null;
  const jar = await cookies();
  return sessionRole(jar.get(COOKIE)?.value, secret, { staff: pin, owner: null });
}

export async function isKitchenAuthed(): Promise<boolean> { return (await kitchenRole()) !== null; }

export async function setKitchenCookie(candidate: string): Promise<void> {
  const pin = kitchenPin(), secret = sessionSecret();
  if (!pin || !secret || !kitchenPinMatches(candidate, pin)) throw new Error("Kitchen sign-in is unavailable.");
  const jar = await cookies();
  jar.set(COOKIE, issueSession("staff", pin, secret), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS, path: "/",
  });
}

export async function clearKitchenCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    maxAge: 0, path: "/",
  });
}
