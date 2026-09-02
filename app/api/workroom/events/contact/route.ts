import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore } from "@/lib/workroom/store";
import { EVENTS_CONTACT_KEY } from "@/lib/content";
import { contactErrors, type EventsContact } from "@/lib/workroom/events-def";

/** Who handles events. Shown on the events page as the way to ask about one. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTROL = /[\x00-\x1f\x7f]/g;

export async function PUT(req: Request) {
  if (!(await isWorkroomAuthed())) return NextResponse.json({ error: "Locked." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { contact?: Record<string, unknown> } | null;
  const raw = body?.contact;
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Malformed." }, { status: 400 });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL, " ").trim().slice(0, max) : "");
  const contact: EventsContact = { name: str(raw.name, 60), email: str(raw.email, 120), phone: str(raw.phone, 25) };
  const errors = contactErrors(contact);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Check the marked boxes.", errors }, { status: 400 });
  }
  await getStore().setValue(EVENTS_CONTACT_KEY, contact);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, contact });
}
