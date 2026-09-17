import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore } from "@/lib/workroom/store";
import { contentRevision } from "@/lib/workroom/content-cas";
import { eventId, parseEventDraft, type WorkroomEvent } from "@/lib/workroom/events-def";
import { editableEvent, eventListing } from "@/lib/workroom/event-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const locked = () => NextResponse.json({ error: "Locked." }, { status: 401 });
const conflict = () => NextResponse.json({ error: "This event changed. Compare the latest saved copy before trying again." }, { status: 409 });
const unavailable = () => process.env.NODE_ENV === "production" && getStore().backend === "memory" ? NextResponse.json({ error: "Persistent storage is required." }, { status: 503 }) : null;
export async function GET() { if (!(await isWorkroomAuthed())) return locked(); return NextResponse.json(await eventListing()); }
export async function PUT(req: Request) {
  if (!(await isWorkroomAuthed())) return locked();
  const blocked = unavailable(); if (blocked) return blocked;
  const body = await req.json().catch(() => null), raw = body?.event;
  if (!eventId(raw?.id)) return NextResponse.json({ error: "A valid event identifier is required." }, { status: 400 });
  const parsed = parseEventDraft(raw); if (!parsed) return NextResponse.json({ error: "Provide every event field." }, { status: 400 });
  if (Object.keys(parsed.errors).length) return NextResponse.json({ error: "Check the marked fields.", errors: parsed.errors }, { status: 400 });
  const store = getStore(), existing = await store.events.get(raw.id);
  if (existing ? existing.archivedAt || body.revision !== contentRevision(existing) : body.revision !== null) return conflict();
  if (parsed.draft.imageId && !(await store.images.get(parsed.draft.imageId))) return NextResponse.json({ error: "That photo is unavailable. Add it again." }, { status: 400 });
  const now = Date.now(), event: WorkroomEvent = { id: raw.id, createdAt: existing?.createdAt ?? now, updatedAt: now, ...parsed.draft };
  if (!(await store.compareAndSetEvent(event.id, existing, event))) return conflict();
  // Images remain immutable and retained. Another post or audit snapshot may use one.
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, event: editableEvent(event), ...(await eventListing()) });
}
async function archiveOrRestore(req: Request, archive: boolean) {
  if (!(await isWorkroomAuthed())) return locked();
  const blocked = unavailable(); if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  if (!eventId(body?.id)) return NextResponse.json({ error: "A valid event identifier is required." }, { status: 400 });
  const store = getStore(), existing = await store.events.get(body.id);
  if (!existing || body.revision !== contentRevision(existing) || Boolean(existing.archivedAt) === archive) return conflict();
  const event: WorkroomEvent = { ...existing, published: false, updatedAt: Date.now() };
  if (archive) event.archivedAt = Date.now(); else delete event.archivedAt;
  if (!(await store.compareAndSetEvent(event.id, existing, event))) return conflict();
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, event: editableEvent(event), ...(await eventListing()) });
}
/** Removal is reversible: keep the row/photo and take it off the site. */
export async function DELETE(req: Request) { return archiveOrRestore(req, true); }
/** Restored events return as drafts; the owner chooses when to publish again. */
export async function POST(req: Request) { return archiveOrRestore(req, false); }
