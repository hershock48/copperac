import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore } from "@/lib/workroom/store";
import { EVENTS_CONTACT_KEY } from "@/lib/content";
import { contentRevision } from "@/lib/workroom/content-cas";
import { parseEventsContact } from "@/lib/workroom/events-def";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PUT(req: Request) {
  if (!(await isWorkroomAuthed())) return NextResponse.json({ error: "Locked." }, { status: 401 });
  const store = getStore();
  if (process.env.NODE_ENV === "production" && store.backend === "memory") return NextResponse.json({ error: "Persistent storage is required." }, { status: 503 });
  const body = await req.json().catch(() => null), parsed = parseEventsContact(body?.contact);
  if (!parsed) return NextResponse.json({ error: "Provide every contact field." }, { status: 400 });
  if (Object.keys(parsed.errors).length) return NextResponse.json({ error: "Check the marked fields.", errors: parsed.errors }, { status: 400 });
  const raw = await store.getValue(EVENTS_CONTACT_KEY);
  if (body.revision !== contentRevision(raw) || !(await store.compareAndSetValue(EVENTS_CONTACT_KEY, raw, parsed.contact))) return NextResponse.json({ error: "The contact changed. Compare the latest saved copy." }, { status: 409 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, contact: parsed.contact, revision: contentRevision(parsed.contact), backend: store.backend });
}
