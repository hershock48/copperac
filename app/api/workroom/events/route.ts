import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore, newId } from "@/lib/workroom/store";
import { getEventsContact } from "@/lib/content";
import { eventErrors, type EventDraft, type WorkroomEvent } from "@/lib/workroom/events-def";

/**
 * The events the planner writes. GET lists them all (drafts included);
 * PUT creates or updates one; DELETE removes one and its photo.
 *
 * Validation runs the same eventErrors the screen ran; this pass is the one
 * that counts. Every method checks the gate itself: a route that trusts its
 * caller lets anyone on the internet put an event on the club's site.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const locked = () => NextResponse.json({ error: "Locked." }, { status: 401 });

// Control characters out, newlines kept: the details field is one bullet per
// line, and nothing else a keyboard produces belongs in a string the site prints.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(CONTROL, "").replace(/\r\n?/g, "\n").slice(0, max) : "";
}

/**
 * Photos are stored the moment they are picked, before the event is saved,
 * so a photo picked twice, or picked and then cancelled, is a row nobody
 * points at. Every save and delete sweeps those, leaving anything under a
 * day old alone so an editor left open over a long evening is not pulled
 * out from under its planner (review, 20 Oct 2026).
 *
 * Housekeeping never fails the request: the event has been written by the
 * time DELETE sweeps, and a thrown sweep would tell the planner it had not
 * saved, and a retry would save it twice (second review, same day). PUT
 * sweeps BEFORE it checks the photo exists, so a photo this request would
 * have swept is reported as missing instead of saved as a dangling id.
 */
const PHOTO_GRACE_MS = 24 * 60 * 60 * 1000;

async function sweepOrphanPhotos(): Promise<void> {
  try {
    const store = getStore();
    const [events, images] = await Promise.all([store.events.list(), store.images.meta()]);
    const used = new Set(events.map((e) => e.imageId).filter(Boolean));
    const cutoff = Date.now() - PHOTO_GRACE_MS;
    for (const img of images) {
      if (!used.has(img.id) && img.createdAt < cutoff) await store.images.remove(img.id);
    }
  } catch (err) {
    console.error("[events] photo sweep failed", err);
  }
}

async function listing() {
  const store = getStore();
  const events = (await store.events.list()).sort((a, b) =>
    (a.date + a.startTime).localeCompare(b.date + b.startTime)
  );
  return { events, contact: await getEventsContact(), backend: store.backend };
}

export async function GET() {
  if (!(await isWorkroomAuthed())) return locked();
  return NextResponse.json(await listing());
}

export async function PUT(req: Request) {
  if (!(await isWorkroomAuthed())) return locked();
  const body = (await req.json().catch(() => null)) as { event?: Record<string, unknown> } | null;
  const raw = body?.event;
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Malformed." }, { status: 400 });

  const draft: EventDraft = {
    title: clean(raw.title, 80).replace(/\n/g, " ").trim(),
    date: clean(raw.date, 10).trim(),
    startTime: clean(raw.startTime, 5).trim(),
    endTime: clean(raw.endTime, 5).trim(),
    price: clean(raw.price, 60).replace(/\n/g, " ").trim(),
    ticketUrl: clean(raw.ticketUrl, 500).replace(/\s/g, ""),
    details: clean(raw.details, 1000).trim(),
    imageId: clean(raw.imageId, 40).trim(),
    imageAlt: clean(raw.imageAlt, 200).replace(/\n/g, " ").trim(),
    published: raw.published !== false,
  };
  const errors = eventErrors(draft);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Check the marked boxes.", errors }, { status: 400 });
  }

  const store = getStore();
  await sweepOrphanPhotos();
  if (draft.imageId && !(await store.images.get(draft.imageId))) {
    return NextResponse.json({ error: "That photo did not finish uploading. Add it again." }, { status: 400 });
  }

  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const existing = id ? await store.events.get(id) : null;
  if (id && !existing) return NextResponse.json({ error: "That event is gone. Reload the list." }, { status: 404 });

  const now = Date.now();
  const event: WorkroomEvent = {
    id: existing?.id ?? newId("evt"),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...draft,
  };
  await store.events.put(event);
  // A photo swapped out is a photo nobody reads any more.
  if (existing?.imageId && existing.imageId !== event.imageId) await store.images.remove(existing.imageId);

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, event, ...(await listing()) });
}

export async function DELETE(req: Request) {
  if (!(await isWorkroomAuthed())) return locked();
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Malformed." }, { status: 400 });
  const store = getStore();
  const existing = await store.events.get(id);
  if (existing) {
    await store.events.remove(id);
    if (existing.imageId) await store.images.remove(existing.imageId);
  }
  await sweepOrphanPhotos();
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, ...(await listing()) });
}
