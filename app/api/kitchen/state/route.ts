import { isKitchenAuthed } from "@/lib/ordering/auth";
import { getStore } from "@/lib/ordering/store";
import { boardView } from "@/lib/ordering/kitchen-operations";
import { kitchenReply, runKitchenAction } from "@/lib/ordering/kitchen-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKitchenAuthed())) return kitchenReply({ error: "Not signed in." }, 401);
  try {
    const store = getStore(), state = boardView(await store.getStateRecord());
    const { configuredPrinters } = await import("@/lib/ordering/printing");
    const seen = await store.printerLastSeen();
    const printers = configuredPrinters().map(p => ({ id: p.id, label: p.label, role: p.role, online: Date.now() - (seen[p.id] ?? 0) < 60_000 }));
    return kitchenReply({ state, backend: store.backend, printers });
  } catch { return kitchenReply({ error: "Kitchen state is unavailable. Try refreshing." }, 503); }
}
export async function PATCH(req: Request) { return runKitchenAction(req, "state"); }
