import {loginClient} from '@/lib/workroom/login-limit';
import { NextResponse } from "next/server";
import { clearKitchenCookie, kitchenPin, kitchenPinMatches, kitchenRole, kitchenSessionReady, setKitchenCookie } from "@/lib/ordering/auth";
import { allowKitchenLogin } from "@/lib/ordering/login-limit";
import { clearWorkroomCookie } from "@/lib/workroom/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

function sameOrigin(req: Request): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    // Next may reconstruct req.url with an internal host/protocol behind its proxy.
    // Browsers send the public Host and cannot override it from a different origin.
    const host = req.headers.get("host") ?? new URL(req.url).host;
    return ["http:", "https:"].includes(source.protocol) && source.origin === origin && source.host === host;
  } catch { return false; }
}

async function readPin(req: Request): Promise<string | null> {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof body?.pin === "string" && body.pin.length <= 128 ? body.pin : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function GET() {
  const role = await kitchenRole();
  return reply({ authed: role !== null, role, configured: kitchenSessionReady() });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "Open the kitchen on this website to sign in." }, 403);
  const pin = kitchenPin();
  if (!pin || !kitchenSessionReady()) return reply({ error: "Staff sign-in is not configured. Ask the owner to finish kitchen setup." }, 503);
  try {
    if (!(await allowKitchenLogin(loginClient(req)))) return NextResponse.json({ error: "Too many sign-in attempts. Wait ten minutes, or use owner sign-in." }, { status: 429, headers: { ...headers, "Retry-After": "600" } });
  } catch { return reply({ error: "Sign-in storage is unavailable. Try again later." }, 503); }
  const candidate = await readPin(req);
  if (candidate === null || !kitchenPinMatches(candidate, pin)) return reply({ error: "That kitchen PIN is not right." }, 401);
  try { await setKitchenCookie(candidate); }
  catch { return reply({ error: "Sign-in could not finish. Try again later." }, 503); }
  return reply({ ok: true, role: "staff" });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "Open the kitchen on this website to sign out." }, 403);
  try { await clearKitchenCookie(); await clearWorkroomCookie(); }
  catch { return reply({ error: "Sign-out could not finish. Try again." }, 503); }
  return reply({ ok: true });
}
