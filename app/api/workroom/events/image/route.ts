import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore } from "@/lib/workroom/store";
import { prepareEventPhoto } from "@/lib/workroom/event-photo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!(await isWorkroomAuthed())) return NextResponse.json({ error: "Locked." }, { status: 401 });
  const store = getStore();
  if (process.env.NODE_ENV === "production" && store.backend === "memory") return NextResponse.json({ error: "Persistent storage is required." }, { status: 503 });
  const body = await req.json().catch(() => null);
  let photo: Awaited<ReturnType<typeof prepareEventPhoto>>;
  try { photo = await prepareEventPhoto(body?.dataUrl); }
  catch { return NextResponse.json({ error: "That photo could not be read. Choose a JPEG, PNG or WebP under 2 MB after resizing." }, { status: 400 }); }
  // A retry returns the same image without duplicating uploads or changing an immutable URL.
  if (!(await store.images.get(photo.id))) await store.images.put({ ...photo, createdAt: Date.now() });
  return NextResponse.json({ ok: true, id: photo.id, url: `/img/events/${photo.id}` });
}
