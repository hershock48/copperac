import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore, newId, type StoredImage } from "@/lib/workroom/store";

/**
 * A photo for an event. The browser has already resized it (the events
 * screen downscales to 1200px JPEG before sending), so what arrives is a
 * data URL of a few hundred KB at most. Stored as base64 in its own table
 * and served by app/img/events/[id]; the id goes on the event.
 *
 * The cap is generous for a resized flyer and tight for anything else: a
 * 2.6 million character base64 body is about 1.9MB decoded, under Vercel's
 * request limit with room to spare.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BASE64 = 2_600_000;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function POST(req: Request) {
  if (!(await isWorkroomAuthed())) return NextResponse.json({ error: "Locked." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { dataUrl?: unknown } | null;
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
  const m = dataUrl.match(DATA_URL);
  if (!m) return NextResponse.json({ error: "That is not a photo the site can use. JPEG, PNG or WebP." }, { status: 400 });
  if (m[2].length > MAX_BASE64) {
    return NextResponse.json({ error: "That photo is too large even after resizing. Try a smaller one." }, { status: 413 });
  }
  const image: StoredImage = {
    id: newId("img"),
    createdAt: Date.now(),
    contentType: m[1] as StoredImage["contentType"],
    base64: m[2],
  };
  await getStore().images.put(image);
  return NextResponse.json({ ok: true, id: image.id, url: `/img/events/${image.id}` });
}
