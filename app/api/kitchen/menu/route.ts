// The menu document, for the editor: GET the whole thing, PUT the whole
// thing. Whole-document on purpose: it is one restaurant's menu, edits are a
// few a week, and a whole-doc write cannot half-apply. Validation guards the
// shapes that would corrupt orders; content is theirs to get wrong.

import { NextRequest, NextResponse } from "next/server";
import { isKitchenAuthed } from "@/lib/ordering/auth";
import { invalidateMenuCache, loadMenuDoc, validateMenuDoc } from "@/lib/ordering/menu";
import { getStore } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKitchenAuthed())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const doc = await loadMenuDoc(getStore());
  return NextResponse.json({ doc });
}

export async function PUT(req: NextRequest) {
  if (!(await isKitchenAuthed())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  let doc: unknown;
  try {
    doc = (await req.json()).doc;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const problem = validateMenuDoc(doc);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  await getStore().setMenuDoc(doc);
  invalidateMenuCache();
  return NextResponse.json({ ok: true });
}
